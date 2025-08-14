// heightProvider.ts
declare const window: any;

export type LL = { lon: number; lat: number };
export type SampleReq = { idx: number; lon: number; lat: number; gen: number };

export interface HeightProvider {
  // Fast, no network: may return undefined if terrain tile not ready
  getHeightSync(ll: LL): number | undefined;

  // Batch precise heights; call onBatchResult for each {idx,height}
  sampleHeightsAsync(
    requests: SampleReq[],
    onBatchResult: (idx: number, height: number, gen: number) => void
  ): void;

  dispose?(): void;
}

const getCesium = () => (window as any).Cesium;

/** Default provider using Cesium terrain */
export class CesiumHeightProvider implements HeightProvider {
  constructor(private viewer: any) {}

  getHeightSync({ lon, lat }: LL): number | undefined {
    const Cesium = getCesium();
    const h = this.viewer.scene.globe.getHeight(
      Cesium.Cartographic.fromDegrees(lon, lat)
    );
    return Number.isFinite(h) ? (h as number) : undefined;
  }

  sampleHeightsAsync(
    requests: SampleReq[],
    onBatchResult: (idx: number, height: number, gen: number) => void
  ): void {
    if (requests.length === 0) return;
    const Cesium = getCesium();
    const cartos = requests.map(r => Cesium.Cartographic.fromDegrees(r.lon, r.lat));
    // One precise batch
    Cesium.sampleTerrainMostDetailed(this.viewer.terrainProvider, cartos).then(samples => {
      for (let k = 0; k < samples.length; k++) {
        const s = samples[k];
        const req = requests[k];
        const h = Number.isFinite(s.height) ? (s.height as number) : 0;
        onBatchResult(req.idx, h, req.gen);
      }
    }).catch(() => { /* ignore */ });
  }
}

// Types for prebaked elevation grids
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GridMeta {
  bbox: BBox;
  width: number;
  height: number;
  spacingMeters: number;
  sigmaMeters: number;
  version: string;
}

export interface FinePatch {
  bbox: BBox;
  width: number;
  height: number;
  spacingMeters: number;
  data: Float32Array;
  // Cached meters-per-degree for this patch's center
  metersPerDegLat: number;
  metersPerDegLon: number;
}

export interface GridData {
  bbox: BBox;
  coarseGrid: Float32Array;
  coarseMeta: GridMeta;
  patches: FinePatch[];
  featherMeters: number;
  // Cached meters-per-degree for main bbox center
  metersPerDegLat: number;
  metersPerDegLon: number;
}

/** Provider for pre-baked height grid aligned to mask */
export class GridHeightProvider implements HeightProvider {
  constructor(private data: GridData) {}

  getHeightSync({ lon, lat }: LL): number | undefined {
    // Always return a height (fully in-memory)
    return this.sampleHeight(lon, lat);
  }

  sampleHeightsAsync(
    requests: SampleReq[],
    onBatchResult: (idx: number, height: number, gen: number) => void
  ): void {
    // Immediate callback using same grid (synchronous)
    for (const r of requests) {
      const h = this.sampleHeight(r.lon, r.lat);
      onBatchResult(r.idx, h, r.gen);
    }
  }

  private sampleHeight(lon: number, lat: number): number {
    // Check if point is inside any fine patch (with feathering)
    for (const patch of this.data.patches) {
      const distToPatch = this.distanceToPatchEdge(lon, lat, patch);
      
      if (distToPatch <= this.data.featherMeters) {
        const fineHeight = this.bilinearSample(lon, lat, patch.data, patch);
        
        if (distToPatch <= 0) {
          // Inside patch - use fine height
          return fineHeight;
        } else {
          // In feather zone - blend fine and coarse
          const coarseHeight = this.bilinearSampleCoarse(lon, lat);
          const alpha = 1.0 - (distToPatch / this.data.featherMeters); // 1.0 at edge, 0.0 at feather limit
          return fineHeight * alpha + coarseHeight * (1.0 - alpha);
        }
      }
    }
    
    // Use coarse grid
    return this.bilinearSampleCoarse(lon, lat);
  }

  private bilinearSampleCoarse(lon: number, lat: number): number {
    const { bbox, width, height } = this.data.coarseMeta;
    return this.bilinearSample(lon, lat, this.data.coarseGrid, {
      bbox, width, height,
      metersPerDegLat: this.data.metersPerDegLat,
      metersPerDegLon: this.data.metersPerDegLon
    } as FinePatch);
  }

  private bilinearSample(
    lon: number, 
    lat: number, 
    grid: Float32Array, 
    meta: Pick<FinePatch, 'bbox' | 'width' | 'height' | 'metersPerDegLat' | 'metersPerDegLon'>
  ): number {
    const { bbox, width, height } = meta;
    
    // Convert lon/lat to grid coordinates
    const x = ((lon - bbox.west) / (bbox.east - bbox.west)) * (width - 1);
    const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * (height - 1);
    
    // Clamp to grid boundaries
    const x0 = Math.max(0, Math.min(width - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(height - 2, Math.floor(y)));
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    
    // Fractional parts
    const fx = x - x0;
    const fy = y - y0;
    
    // Sample grid at four corners
    const h00 = grid[y0 * width + x0];
    const h10 = grid[y0 * width + x1];
    const h01 = grid[y1 * width + x0];
    const h11 = grid[y1 * width + x1];
    
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fy) + h1 * fy;
  }

  private distanceToPatchEdge(lon: number, lat: number, patch: FinePatch): number {
    const { bbox } = patch;
    
    // If inside bbox, return negative distance (inside)
    if (lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north) {
      // Distance to nearest edge (negative = inside)
      const distWest = (lon - bbox.west) * patch.metersPerDegLon;
      const distEast = (bbox.east - lon) * patch.metersPerDegLon;
      const distSouth = (lat - bbox.south) * patch.metersPerDegLat;
      const distNorth = (bbox.north - lat) * patch.metersPerDegLat;
      
      return -Math.min(distWest, distEast, distSouth, distNorth);
    }
    
    // Outside bbox - distance to nearest corner/edge
    const dLon = Math.max(0, Math.max(bbox.west - lon, lon - bbox.east)) * patch.metersPerDegLon;
    const dLat = Math.max(0, Math.max(bbox.south - lat, lat - bbox.north)) * patch.metersPerDegLat;
    
    return Math.sqrt(dLon * dLon + dLat * dLat);
  }

  dispose?(): void {
    // No cleanup needed for in-memory grids
  }
}