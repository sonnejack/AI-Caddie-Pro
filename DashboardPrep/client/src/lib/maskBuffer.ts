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

export type ClassId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const CLASS = {
  UNKNOWN:0, OB:1, WATER:2, HAZARD:3, BUNKER:4, GREEN:5, FAIRWAY:6, RECOVERY:7, ROUGH:8, TEE:9
} as const;

export const ALLOWED_CLASSES = new Set([0,1,2,3,4,5,6,7,8,9]);

let maskHistogramLogged = false;

export function computeMaskDimsPreservingAspect(
  bbox: { west:number; south:number; east:number; north:number },
  maxDim = 4096,
  minDim = 512
) {
  const lonSpan = Math.max(1e-9, bbox.east - bbox.west);
  const latSpan = Math.max(1e-9, bbox.north - bbox.south);

  // Keep pixel aspect = lon_span / lat_span (degrees, not meters)
  let width = maxDim;
  let height = Math.round(width * (latSpan / lonSpan));

  if (height > maxDim) {
    height = maxDim;
    width = Math.round(height * (lonSpan / latSpan));
  }

  width = Math.max(minDim, Math.min(maxDim, width));
  height = Math.max(minDim, Math.min(maxDim, height));
  return { width, height };
}

export function makeDegToPxMapper(
  bbox: { west:number; south:number; east:number; north:number },
  width: number,
  height: number
) {
  const lonSpan = bbox.east - bbox.west;
  const latSpan = bbox.north - bbox.south;
  return {
    toPx(lon:number, lat:number) {
      // GeoJSON is [lon, lat]; y is inverted: north at y=0
      const x = ((lon - bbox.west) / lonSpan) * width;
      const y = ((bbox.north - lat) / latSpan) * height;
      return [x, y] as const;
    },
    toDeg(x:number, y:number) {
      const lon = bbox.west + (x / width) * lonSpan;
      const lat = bbox.north - (y / height) * latSpan;
      return [lon, lat] as const;
    }
  };
}

export function expandBBox(b: { west:number; south:number; east:number; north:number }, marginFrac = 0.01) {
  const dLon = (b.east - b.west) * marginFrac;
  const dLat = (b.north - b.south) * marginFrac;
  return { west: b.west - dLon, south: b.south - dLat, east: b.east + dLon, north: b.north + dLat };
}

export function sanitizeMaskBuffer(mask: ImageData) {
  const d = mask.data;
  for (let i=0;i<d.length;i+=4) {
    const cls = d[i] | 0;
    if (!ALLOWED_CLASSES.has(cls)) {
      d[i] = CLASS.ROUGH; d[i+1]=0; d[i+2]=0; d[i+3]=255;
    }
  }
}

export function logMaskHistogramOnce(img: ImageData) {
  if (maskHistogramLogged) return;
  const seen = new Map<number,number>();
  const d = img.data;
  for (let i=0;i<d.length;i+=4) { const c=d[i]|0; seen.set(c,(seen.get(c)||0)+1); }
  console.log("[Mask] hist (after sanitize):", Array.from(seen.entries()).map(([k,v])=>`Class ${k}: ${v}`).join(", "));
  maskHistogramLogged = true;
}

export function makeClassSampler(imageData: ImageData, bbox: { west:number; south:number; east:number; north:number }, width: number, height: number) {
  const { toPx } = makeDegToPxMapper(bbox, width, height);
  return function sampleClass(lon:number, lat:number) {
    const [x,y] = toPx(lon, lat);
    const xi = Math.max(0, Math.min(width - 1, Math.floor(x)));
    const yi = Math.max(0, Math.min(height - 1, Math.floor(y)));
    const idx = (yi * width + xi) * 4;
    const cls = imageData.data[idx] | 0;   // red channel
    return cls === 0 ? CLASS.ROUGH : cls;  // default to rough
  }
}

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
  
  // Ensure valid class ID (0-9)
  return Math.max(0, Math.min(9, classId)) as ClassId;
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
 * 1→rough+2 (OB), 2→water, 3→rough+1 (hazard), 4→sand, 5→green, 6→fairway, 7→recovery, 8→rough, 9→fairway (tee), 0→rough
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
    case 9: // Tee
      return { condition: "fairway", penalty: 0 };
    case 0: // Unknown
    default:
      return { condition: "rough", penalty: 0 };
  }
}

