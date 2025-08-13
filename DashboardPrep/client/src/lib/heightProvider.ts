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

/** Future provider for pre-baked height grid aligned to mask */
export class GridHeightProvider implements HeightProvider {
  // grid: Float32Array, bbox, width/height, bilinear interpolation, etc.
  // stub now; implement later
  getHeightSync(_ll: LL): number | undefined {
    // grid is fully in-memory, so sync works; return height
    return undefined;
  }
  sampleHeightsAsync(
    requests: SampleReq[],
    onBatchResult: (idx: number, height: number, gen: number) => void
  ): void {
    // trivial: just map through grid and call onBatchResult immediately
    for (const r of requests) onBatchResult(r.idx, /*height*/ 0, r.gen);
  }
}