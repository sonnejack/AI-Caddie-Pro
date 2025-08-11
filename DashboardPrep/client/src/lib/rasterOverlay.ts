import type { MaskBuffer } from './maskBuffer';

export interface BBox {
  west: number;
  south: number; 
  east: number;
  north: number;
}

// Display palette for raster visualization (distinct from compute IDs)
// Updated colors to fix anomalies and better match terrain types
const DISPLAY_PALETTE: Record<number, [number, number, number, number]> = {
  0: [0, 0, 0, 0],           // unknown → fully transparent
  1: [255, 255, 255, 200],   // OB → white (more opaque)
  2: [0, 120, 255, 180],     // Water → blue
  3: [255, 69, 0, 160],      // Hazard → orange-red
  4: [238, 203, 173, 160],   // Bunker → light sand
  5: [34, 139, 34, 140],     // Green → forest green (less bright)
  6: [50, 205, 50, 110],     // Fairway → lime green (distinct from green)
  7: [160, 82, 45, 130],     // Recovery/Cart paths → saddle brown
  8: [107, 142, 35, 120],    // Rough → olive drab
};

// Global reference to current raster layer
let rasterLayer: any = null;

export function colorizeMaskToCanvas(mask: MaskBuffer): HTMLCanvasElement {
  const cnv = document.createElement("canvas");
  cnv.width = mask.width;
  cnv.height = mask.height;
  const ctx = cnv.getContext("2d")!;
  const out = ctx.createImageData(mask.width, mask.height);
  const src = mask.data;
  const dst = out.data;

  // Track class ID usage for debugging
  const classCount: Record<number, number> = {};

  for (let i = 0; i < src.length; i += 4) {
    const cls = src[i] | 0; // red channel contains class ID
    
    // Count class usage for debugging
    classCount[cls] = (classCount[cls] || 0) + 1;
    
    // Apply anti-aliasing smoothing for edge pixels
    const [r, g, b, a] = DISPLAY_PALETTE[cls] ?? [128, 128, 128, 100]; // Default gray for unknown
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = a; // 0–255
  }

  // Debug output for class distribution
  console.log('🎨 Mask class distribution:', Object.entries(classCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([cls, count]) => `Class ${cls}: ${count} pixels`)
  );

  ctx.putImageData(out, 0, 0);
  return cnv;
}

export function edgesMaskToCanvas(mask: MaskBuffer): HTMLCanvasElement {
  const cnv = document.createElement("canvas");
  cnv.width = mask.width;
  cnv.height = mask.height;
  const ctx = cnv.getContext("2d")!;
  const out = ctx.createImageData(mask.width, mask.height);
  const src = mask.data;
  const dst = out.data;
  const w = mask.width;
  const h = mask.height;

  const at = (x: number, y: number) => ((y * w + x) << 2);
  
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = at(x, y);
      const c = src[i] | 0;
      
      // Skip boundary checks for invalid coordinates
      if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) continue;
      
      const neighbors = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      const edge = neighbors.some(j => {
        // Bounds check for neighbor indices
        return j >= 0 && j < src.length && (src[j] | 0) !== c;
      });
      
      if (edge && c !== 0) {
        const [r, g, b] = DISPLAY_PALETTE[c] ?? [255, 255, 255];
        dst[i] = r;
        dst[i + 1] = g;
        dst[i + 2] = b;
        dst[i + 3] = 240; // Increased opacity for better visibility
      }
    }
  }
  
  ctx.putImageData(out, 0, 0);
  return cnv;
}

export function showRasterLayer(viewer: any, canvas: HTMLCanvasElement, bbox: BBox, alpha: number = 1.0) {
  hideRasterLayer(viewer);
  
  const url = canvas.toDataURL("image/png");
  const Cesium = (window as any).Cesium;
  
  const provider = new Cesium.SingleTileImageryProvider({
    url,
    rectangle: Cesium.Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north)
  });
  
  rasterLayer = viewer.imageryLayers.addImageryProvider(provider);
  rasterLayer.alpha = alpha;
}

export function hideRasterLayer(viewer: any) {
  if (rasterLayer) {
    viewer.imageryLayers.remove(rasterLayer, true);
    rasterLayer = null;
  }
}

export function setRasterVisibility(visible: boolean) {
  if (rasterLayer) {
    rasterLayer.show = visible;
  }
}