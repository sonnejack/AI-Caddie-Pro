export interface MaskBuffer {
  width: number;
  height: number;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  data: Uint8ClampedArray;
}

export type ClassId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Load mask from URL and convert to buffer for sampling
 */
export async function loadMaskBuffer(
  url: string,
  bbox: { west: number; south: number; east: number; north: number }
): Promise<MaskBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Create canvas and draw image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        
        ctx.drawImage(img, 0, 0);
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        resolve({
          width: canvas.width,
          height: canvas.height,
          bbox,
          data: imageData.data
        });
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error(`Failed to load mask image: ${url}`));
    };
    
    img.src = url;
  });
}

/**
 * Sample class ID from mask at given coordinates
 * Palette rule (red channel only):
 * 0=unknown, 1=OB, 2=Water, 3=Hazard, 4=Bunker, 5=Green, 6=Fairway, 7=Recovery, 8=Rough
 */
export function sampleClassFromMask(
  lon: number,
  lat: number,
  mask: MaskBuffer
): ClassId {
  // Map lon/lat to pixel coordinates
  const x = Math.floor(
    ((lon - mask.bbox.west) / (mask.bbox.east - mask.bbox.west)) * mask.width
  );
  const y = Math.floor(
    ((mask.bbox.north - lat) / (mask.bbox.north - mask.bbox.south)) * mask.height
  );
  
  // Clamp to bounds
  const clampedX = Math.max(0, Math.min(mask.width - 1, x));
  const clampedY = Math.max(0, Math.min(mask.height - 1, y));
  
  // Get pixel index (RGBA format, so 4 bytes per pixel)
  const pixelIndex = (clampedY * mask.width + clampedX) * 4;
  
  // Read red channel (class ID)
  const classId = mask.data[pixelIndex] as ClassId;
  
  // Ensure valid class ID (0-8)
  return Math.max(0, Math.min(8, classId)) as ClassId;
}

/**
 * Sample class with 4-tap subpixel anti-aliasing for edge stability
 */
export function sampleClassAA(
  lon: number,
  lat: number,
  mask: MaskBuffer
): ClassId {
  // Calculate exact pixel position
  const exactX = ((lon - mask.bbox.west) / (mask.bbox.east - mask.bbox.west)) * mask.width;
  const exactY = ((mask.bbox.north - lat) / (mask.bbox.north - mask.bbox.south)) * mask.height;
  
  // Get 4 neighboring pixels
  const x0 = Math.floor(exactX);
  const y0 = Math.floor(exactY);
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const y1 = Math.min(mask.height - 1, y0 + 1);
  
  // Sample 4 corners
  const samples = [
    sampleClassFromMask(
      mask.bbox.west + (x0 / mask.width) * (mask.bbox.east - mask.bbox.west),
      mask.bbox.north - (y0 / mask.height) * (mask.bbox.north - mask.bbox.south),
      mask
    ),
    sampleClassFromMask(
      mask.bbox.west + (x1 / mask.width) * (mask.bbox.east - mask.bbox.west),
      mask.bbox.north - (y0 / mask.height) * (mask.bbox.north - mask.bbox.south),
      mask
    ),
    sampleClassFromMask(
      mask.bbox.west + (x0 / mask.width) * (mask.bbox.east - mask.bbox.west),
      mask.bbox.north - (y1 / mask.height) * (mask.bbox.north - mask.bbox.south),
      mask
    ),
    sampleClassFromMask(
      mask.bbox.west + (x1 / mask.width) * (mask.bbox.east - mask.bbox.west),
      mask.bbox.north - (y1 / mask.height) * (mask.bbox.north - mask.bbox.south),
      mask
    ),
  ];
  
  // Majority vote (most common class wins)
  const counts = new Map<ClassId, number>();
  for (const sample of samples) {
    counts.set(sample, (counts.get(sample) || 0) + 1);
  }
  
  let maxCount = 0;
  let result: ClassId = 0;
  counts.forEach((count, classId) => {
    if (count > maxCount) {
      maxCount = count;
      result = classId;
    }
  });
  
  return result;
}

/**
 * Map class ID to condition string for Expected Strokes calculation
 * Condition mapping for ES:
 * 1→rough+2 (OB), 2→water, 3→rough+1 (hazard), 4→sand, 5→green, 6→fairway, 7→recovery, 8→rough, 0→rough
 */
export function classToCondition(classId: ClassId): {
  condition: "green" | "fairway" | "rough" | "sand" | "recovery" | "water";
  penalty: number;
} {
  switch (classId) {
    case 1: // OB
      return { condition: "rough", penalty: 2 };
    case 2: // Water
      return { condition: "water", penalty: 0 };
    case 3: // Hazard
      return { condition: "rough", penalty: 1 };
    case 4: // Bunker
      return { condition: "sand", penalty: 0 };
    case 5: // Green
      return { condition: "green", penalty: 0 };
    case 6: // Fairway
      return { condition: "fairway", penalty: 0 };
    case 7: // Recovery
      return { condition: "recovery", penalty: 0 };
    case 8: // Rough
      return { condition: "rough", penalty: 0 };
    case 0: // Unknown
    default:
      return { condition: "rough", penalty: 0 };
  }
}