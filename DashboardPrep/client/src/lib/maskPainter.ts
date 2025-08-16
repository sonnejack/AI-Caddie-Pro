import { computeMaskDimsPreservingAspect, makeDegToPxMapper, expandBBox, CLASS, sanitizeMaskBuffer, logMaskHistogramOnce, CONDITION_CLASS } from './maskBuffer';
import type { ImportResponse } from '@shared/overpass';
import type { MaskBuffer } from './maskBuffer';
import type { UserPolygon } from '@/prepare/drawing/ConditionDrawingManager';

const PAINT_CLASS = { UNKNOWN:0, WATER:2, BUNKER:4, GREEN:5, FAIRWAY:6, RECOVERY:7, ROUGH:8, TEE:9 } as const;

export function createMaskFromFeatures(
  features: {
    greens: GeoJSON.FeatureCollection; 
    fairways: GeoJSON.FeatureCollection;
    bunkers: GeoJSON.FeatureCollection; 
    water: GeoJSON.FeatureCollection;
    tees?: GeoJSON.FeatureCollection;
  }, 
  rawBbox: { west:number; south:number; east:number; north:number }
) {
  
  const bbox = expandBBox(rawBbox, 0.01);
  const { width, height } = computeMaskDimsPreservingAspect(bbox, 8192, 1024);

  console.log("[Mask] dims", width, height, "bbox", bbox);
  console.log("[Mask] aspect(px)", (width/height).toFixed(4), "aspect(deg)", ((bbox.east-bbox.west)/(bbox.north-bbox.south)).toFixed(4));

  // Safety checks for canvas dimensions
  if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
    console.error('❌ Invalid canvas dimensions in createMaskFromFeatures:', { width, height, bbox });
    throw new Error(`Invalid canvas dimensions: ${width}x${height}`);
  }
  
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { 
    willReadFrequently: true,
    alpha: true,
    antialias: false
  }) as CanvasRenderingContext2D | null;
  
  if (!ctx) {
    console.error('❌ Failed to get canvas context in createMaskFromFeatures');
    throw new Error('Failed to get canvas context');
  }
  
  // Disable all forms of smoothing and anti-aliasing
  ctx.imageSmoothingEnabled = false;
  (ctx as any).webkitImageSmoothingEnabled = false;
  (ctx as any).mozImageSmoothingEnabled = false;
  (ctx as any).msImageSmoothingEnabled = false;
  (ctx as any).oImageSmoothingEnabled = false;

  const { toPx } = makeDegToPxMapper(bbox, width, height);

  // Clear to transparent (class 0 -> converted to ROUGH by sampler)
  ctx.clearRect(0, 0, width, height);

  function fillFC(fc: GeoJSON.FeatureCollection, cls: number) {
    for (const f of fc.features) {
      const g = f.geometry; 
      if (!g) continue;
      if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;

      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      ctx!.beginPath();
      for (const poly of polys) {
        for (const ring of poly) {
          ring.forEach(([lon, lat], i) => {
            const [x, y] = toPx(lon, lat);
            // Round coordinates to prevent sub-pixel rendering
            const roundedX = Math.round(x);
            const roundedY = Math.round(y);
            if (i === 0) ctx!.moveTo(roundedX, roundedY); else ctx!.lineTo(roundedX, roundedY);
          });
          ctx!.closePath();
        }
      }
      ctx!.fillStyle = `rgba(${cls},0,0,1)`; // class in red channel
      ctx!.fill("evenodd");
    }
  }

  // Paint order (water/bunker first so fairway/green can overwrite if needed)
  fillFC(features.water,   PAINT_CLASS.WATER);
  fillFC(features.bunkers, PAINT_CLASS.BUNKER);
  fillFC(features.greens,  PAINT_CLASS.GREEN);
  fillFC(features.fairways,PAINT_CLASS.FAIRWAY);
  
  // Paint tees if available
  if (features.tees) {
    fillFC(features.tees, PAINT_CLASS.TEE);
  }

  // Rough default: nothing to paint; sampler converts class 0 to ROUGH
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (error) {
    console.error('❌ Failed to get image data in createMaskFromFeatures:', error);
    throw new Error('Failed to get image data from canvas');
  }
  
  // Sanitize and log histogram
  sanitizeMaskBuffer(imageData);
  logMaskHistogramOnce(imageData);

  return { 
    canvas, 
    imageData, 
    bbox, 
    width, 
    height,
    // Include debug info for verification
    aspectPx: width/height,
    aspectDeg: (bbox.east-bbox.west)/(bbox.north-bbox.south)
  };
}

// Legacy compatibility wrapper - calls the new implementation
export class MaskPainter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    this.ctx = ctx;
  }

  paintMask(
    features: ImportResponse['features'],
    bbox: { west: number; south: number; east: number; north: number },
    options?: { width?: number; height?: number; metersPerPixel?: number }
  ) {
    // Use new implementation
    const result = createMaskFromFeatures(features, bbox);
    
    // Update internal canvas for compatibility
    this.canvas.width = result.width;
    this.canvas.height = result.height;
    this.ctx.putImageData(result.imageData, 0, 0);
    
    return {
      width: result.width,
      height: result.height,
      bbox: result.bbox,
      data: result.imageData.data
    };
  }
}

/**
 * Apply user-drawn polygons on top of existing mask, with user features overriding OSM
 */
export function applyUserPolygonsToMask(
  baseMask: MaskBuffer,
  userPolys: UserPolygon[]
): MaskBuffer {
  // If no user polygons, return the base mask unchanged
  if (userPolys.length === 0) {
    return baseMask;
  }

  // Create a copy of the base mask data
  const newData = new Uint8ClampedArray(baseMask.data);

  // Create an offscreen canvas for rasterizing user polygons
  const canvas = document.createElement('canvas');
  canvas.width = baseMask.width;
  canvas.height = baseMask.height;
  
  const ctx = canvas.getContext('2d', { 
    willReadFrequently: true,
    alpha: true,
    antialias: false
  }) as CanvasRenderingContext2D | null;
  
  if (!ctx) {
    console.error('Failed to get canvas context for user polygon rasterization');
    return baseMask;
  }

  // Disable anti-aliasing for crisp pixels
  ctx.imageSmoothingEnabled = false;
  (ctx as any).webkitImageSmoothingEnabled = false;
  (ctx as any).mozImageSmoothingEnabled = false;
  (ctx as any).msImageSmoothingEnabled = false;
  (ctx as any).oImageSmoothingEnabled = false;

  // Create coordinate mapper
  const { toPx } = makeDegToPxMapper(baseMask.bbox, baseMask.width, baseMask.height);

  // Rasterize each user polygon
  for (const polygon of userPolys) {
    const classId = CONDITION_CLASS[polygon.condition];
    if (classId === undefined) {
      console.warn(`Unknown condition type: ${polygon.condition}`);
      continue;
    }

    // Clear canvas for this polygon
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw polygon path
    ctx.beginPath();
    polygon.positionsLL.forEach(({ lon, lat }, index) => {
      const [x, y] = toPx(lon, lat);
      // Round coordinates to prevent sub-pixel rendering
      const roundedX = Math.round(x);
      const roundedY = Math.round(y);
      
      if (index === 0) {
        ctx.moveTo(roundedX, roundedY);
      } else {
        ctx.lineTo(roundedX, roundedY);
      }
    });
    ctx.closePath();

    // Fill with solid color (we just need alpha coverage)
    ctx.fillStyle = 'rgba(255,0,0,1)'; // Any solid color works
    ctx.fill('evenodd');

    // Read back the ImageData to get pixel coverage
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixelData = imageData.data;

    // Apply the polygon's class to covered pixels
    for (let i = 0; i < pixelData.length; i += 4) {
      const alpha = pixelData[i + 3]; // Alpha channel
      if (alpha > 0) {
        // This pixel is covered by the polygon
        const pixelIndex = i / 4; // Convert from RGBA index to pixel index
        const maskDataIndex = pixelIndex * 4; // Convert back to RGBA index in mask data
        
        // Set the class ID in the red channel (mask format)
        newData[maskDataIndex] = classId;     // Red: class ID
        newData[maskDataIndex + 1] = 0;       // Green: 0
        newData[maskDataIndex + 2] = 0;       // Blue: 0  
        newData[maskDataIndex + 3] = 255;     // Alpha: fully opaque
      }
    }
  }

  // Return new mask buffer with updated data
  return {
    width: baseMask.width,
    height: baseMask.height,
    bbox: baseMask.bbox,
    data: newData
  };
}