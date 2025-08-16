// client/src/components/prepare/SamplesLayer.ts
import { HeightProvider, CesiumHeightProvider, SampleReq } from "@/lib/heightProvider";

let viewerRef: any = null;
let collection: any = null;
let pool: any[] = [];
let capacity = 0;
let initialized = false;

let heightProvider: HeightProvider | null = null;
let generation = 0;
let pending: SampleReq[] = [];
let rafId: number | null = null;
// Keep last lon/lat for async refinement
let pointsScratch: Float64Array = new Float64Array(0);

function getCesium(): any { return (window as any).Cesium; }

const PREVIEW_COLOR = () => getCesium().Color.fromBytes(153, 153, 153, 255); // grey

// Class mapping -> colors
// 0 UNKNOWN, 1 OB, 2 WATER, 3 HAZARD, 4 BUNKER, 5 GREEN, 6 FAIRWAY, 7 RECOVERY, 8 ROUGH, 9 TEE(optional)
function colorForClass(cls: number): any {
  const Cesium = getCesium();
  switch (cls | 0) {
    case 6: return Cesium.Color.LIMEGREEN;   // fairway 
    case 5: return Cesium.Color.LIGHTGREEN; // green   
    case 2: return Cesium.Color.CORNFLOWERBLUE;   // water   
    case 8: return Cesium.Color.OLIVE;   // rough
    case 4: return Cesium.Color.PEACHPUFF; // bunker  
    case 7: return Cesium.Color.PLUM;  // recovery
    case 3: return Cesium.Color.TOMATO;   // hazard  
    case 1: return Cesium.Color.WHITESMOKE;  // OB 
    case 9: return Cesium.Color.POWDERBLUE; // tee 
    case 0: return Cesium.Color.OLIVE; // unknown/rough (treat as rough)
    default: return PREVIEW_COLOR(); // preview
  }
}

function ensureCapacity(minCapacity: number) {
  if (!viewerRef || !collection) return;
  if (minCapacity <= capacity) return;
  const Cesium = getCesium();
  const toAdd = minCapacity - capacity;
  for (let i = 0; i < toAdd; i++) {
    const p = collection.add({
      position: Cesium.Cartesian3.fromDegrees(0, 0),
      pixelSize: 2,
      color: PREVIEW_COLOR(),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: false,
    });
    pool.push(p);
  }
  capacity = minCapacity;
}

export function initSamplesLayer(viewer: any, initialCapacity = 1200) {
  if (initialized) return;
  const Cesium = getCesium();
  viewerRef = viewer;
  collection = new Cesium.PointPrimitiveCollection();
  viewer.scene.primitives.add(collection);

  // Make sure terrain doesn't hide tiny points before precise heights arrive
  viewer.scene.globe.depthTestAgainstTerrain = false;

  // Default height provider = Cesium terrain
  heightProvider = new CesiumHeightProvider(viewerRef);

  ensureCapacity(initialCapacity);
  initialized = true;
}

export function destroySamplesLayer() {
  if (!viewerRef) return;
  if (collection) {
    viewerRef.scene.primitives.remove(collection);
    collection = null;
  }
  pool = [];
  capacity = 0;
  initialized = false;
  heightProvider?.dispose?.();
  heightProvider = null;
}

export function showSamples(flag: boolean) {
  if (collection) collection.show = flag;
}

function scheduleAsyncRefine() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const batch = pending;
    pending = [];
    if (!heightProvider || batch.length === 0) return;

    heightProvider.sampleHeightsAsync(batch, (idx, h, gen) => {
      if (gen !== generation) return;       // stale
      if (idx >= capacity) return;
      const Cesium = getCesium();
      const lon = pointsScratch[2 * idx];
      const lat = pointsScratch[2 * idx + 1];
      // Refined exact height + 0.05 m lift
      pool[idx].position = Cesium.Cartesian3.fromDegrees(lon, lat, (h || 0) + 0.05);
    });
  });
}

export function setSamples(pointsLL: Float64Array, classes?: Uint8Array) {
  if (!viewerRef) return;
  const Cesium = getCesium();

  const n = Math.floor(pointsLL.length / 2);
  if (n <= 0) { clearSamplesLayer(); return; }

  // New generation; cancel pending
  generation++;
  pending = [];
  pointsScratch = pointsLL; // hold for async update

  ensureCapacity(n);

  // Always start with basic ground level placement and queue ALL points for precise refinement
  let idx = 0;
  for (; idx < n; idx++) {
    const lon = pointsLL[2 * idx];
    const lat = pointsLL[2 * idx + 1];
    const p = pool[idx];

    // Start with ground level + lift (no sync height - just get them visible immediately)
    p.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0.05);
    const classId = classes ? classes[idx] : -1;
    p.color = classes ? colorForClass(classId) : PREVIEW_COLOR();
    p.show = true;
    
    // Debug log for OB points
    if (classId === 1 && idx < 5) {
      console.log(`🎨 SamplesLayer: Point ${idx} at (${lon}, ${lat}) classified as OB (${classId}), colored WHITESMOKE`);
    }

    // Queue ALL points for precise batch refinement
    pending.push({ idx, lon, lat, gen: generation });
  }
  for (; idx < capacity; idx++) pool[idx].show = false;

  // Always schedule async refinement for all points
  scheduleAsyncRefine();
}

export function clearSamplesLayer() {
  for (let i = 0; i < capacity; i++) pool[i].show = false;
}
