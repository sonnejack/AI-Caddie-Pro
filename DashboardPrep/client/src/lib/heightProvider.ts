// client/src/lib/heightProvider.ts
declare const window: any;

export type LL = { lon: number; lat: number };
export type SampleReq = { idx: number; lon: number; lat: number; gen: number };

export interface HeightProvider {
  /** Fast, no network; may return undefined if tiles not ready */
  getHeightSync(ll: LL): number | undefined;

  /** Batch precise heights; invoke callback per result */
  sampleHeightsAsync(
    requests: SampleReq[],
    onBatchResult: (idx: number, height: number, gen: number) => void
  ): void;

  dispose?(): void;
}

const getCesium = () => (window as any).Cesium;

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
    Cesium.sampleTerrainMostDetailed(this.viewer.terrainProvider, cartos)
      .then((samples: any) => {
        for (let k = 0; k < samples.length; k++) {
          const s = samples[k];
          const req = requests[k];
          const h = Number.isFinite(s.height) ? (s.height as number) : 0;
          onBatchResult(req.idx, h, req.gen);
        }
      })
      .catch(() => { /* ignore; no throw in render loop */ });
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

/** Stub for future baked height grid; not needed now */
export class GridHeightProvider implements HeightProvider {
  getHeightSync(_ll: LL): number | undefined { return undefined; }
  sampleHeightsAsync(reqs: SampleReq[], cb: (i:number,h:number,g:number)=>void) {
    for (const r of reqs) cb(r.idx, 0, r.gen);
  }
}