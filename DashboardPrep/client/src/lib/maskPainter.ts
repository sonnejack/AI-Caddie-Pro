import { computeMaskDimsPreservingAspect, makeDegToPxMapper, expandBBox, CLASS, sanitizeMaskBuffer, logMaskHistogramOnce } from './maskBuffer';
import type { ImportResponse } from '@shared/overpass';

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
  });
  
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
      ctx.beginPath();
      for (const poly of polys) {
        for (const ring of poly) {
          ring.forEach(([lon, lat], i) => {
            const [x, y] = toPx(lon, lat);
            // Round coordinates to prevent sub-pixel rendering
            const roundedX = Math.round(x);
            const roundedY = Math.round(y);
            if (i === 0) ctx.moveTo(roundedX, roundedY); else ctx.lineTo(roundedX, roundedY);
          });
          ctx.closePath();
        }
      }
      ctx.fillStyle = `rgba(${cls},0,0,1)`; // class in red channel
      ctx.fill("evenodd");
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