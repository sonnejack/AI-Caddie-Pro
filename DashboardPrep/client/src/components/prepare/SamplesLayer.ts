// client/src/components/prepare/SamplesLayer.ts
// Singleton Samples Layer for Cesium – PointPrimitiveCollection pool

declare const window: any;

type Maybe<T> = T | null;

let viewerRef: Maybe<any> = null;
let collection: Maybe<any> = null;
let pool: any[] = [];
let capacity = 0;
let initialized = false;

const getCesium = () => (window as any).Cesium;
const PREVIEW_COLOR = () => getCesium().Color.fromBytes(153, 153, 153, 255); // grey

// Class mapping -> colors
// 0 UNKNOWN, 1 OB, 2 WATER, 3 HAZARD, 4 BUNKER, 5 GREEN, 6 FAIRWAY, 7 RECOVERY, 8 ROUGH, 9 TEE(optional)
function colorForClass(cls: number): any {
  const Cesium = getCesium();
  switch (cls | 0) {
    case 6: return Cesium.Color.fromBytes(40, 180, 60, 255);   // fairway #28B43C
    case 5: return Cesium.Color.fromBytes(108, 255, 138, 255); // green   #6CFF8A
    case 2: return Cesium.Color.fromBytes(0, 120, 255, 255);   // water   #0078FF
    case 8: return Cesium.Color.fromBytes(139, 94, 60, 255);   // rough   #8B5E3C (brown)
    case 4: return Cesium.Color.fromBytes(210, 180, 140, 255); // bunker  #D2B48C
    case 7: return Cesium.Color.fromBytes(142, 68, 173, 255);  // recovery/hazard/OB purple base
    case 3: return Cesium.Color.fromBytes(231, 76, 60, 255);   // hazard  #E74C3C
    case 1: return Cesium.Color.fromBytes(142, 68, 173, 255);  // OB uses same purple in UI
    case 9: return Cesium.Color.fromBytes(211, 211, 211, 255); // tee light gray
    default: return PREVIEW_COLOR(); // unknown/preview
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
      pixelSize: 5,
      color: PREVIEW_COLOR(),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
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
  ensureCapacity(initialCapacity);
  initialized = true;
}

export function showSamples(flag: boolean) {
  if (collection) collection.show = flag;
}

export function setSamples(pointsLL: Float64Array, classes?: Uint8Array) {
  if (!viewerRef) return;
  const n = Math.floor(pointsLL.length / 2);
  if (n <= 0) { clearSamplesLayer(); return; }

  const Cesium = getCesium();
  ensureCapacity(n);

  // Update active points
  let idx = 0;
  for (; idx < n; idx++) {
    const lon = pointsLL[2 * idx];
    const lat = pointsLL[2 * idx + 1];
    const point = pool[idx];

    point.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    point.color = classes ? colorForClass(classes[idx]) : PREVIEW_COLOR();
    point.show = true;
  }
  // Hide remaining
  for (; idx < capacity; idx++) {
    pool[idx].show = false;
  }
}

export function clearSamplesLayer() {
  if (!collection) return;
  for (let i = 0; i < capacity; i++) pool[i].show = false;
}

export function destroySamplesLayer() {
  if (viewerRef && collection) {
    try {
      viewerRef.scene.primitives.remove(collection);
    } catch { /* ignore */ }
  }
  collection = null;
  viewerRef = null;
  pool = [];
  capacity = 0;
  initialized = false;
}