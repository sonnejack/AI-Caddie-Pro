// client/src/components/prepare/SamplesLayer.ts
// Singleton Samples Layer for Cesium – PointPrimitiveCollection pool

// Simplified SamplesLayer without height provider complexity

declare const window: any;

type Maybe<T> = T | null;

let viewerRef: Maybe<any> = null;
let collection: Maybe<any> = null;
let pool: any[] = [];
let capacity = 0;
let initialized = false;

// Simplified without height provider complexity
let generation = 0;

const getCesium = () => (window as any).Cesium;
const PREVIEW_COLOR = () => getCesium().Color.fromBytes(153, 153, 153, 255); // grey

// Removed complex height provider scheduling

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
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
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

  // ensure points don't get hidden
  viewer.scene.globe.depthTestAgainstTerrain = false;

  ensureCapacity(initialCapacity);
  initialized = true;
}

export function showSamples(flag: boolean) {
  if (collection) collection.show = flag;
}

// Removed height provider complexity

export function setSamples(pointsLL: Float64Array, classes?: Uint8Array) {
  if (!viewerRef) return;
  const Cesium = getCesium();

  const n = Math.floor(pointsLL.length / 2);
  if (n <= 0) { clearSamplesLayer(); return; }

  generation++;
  ensureCapacity(n);

  let idx = 0;
  for (; idx < n; idx++) {
    const lon = pointsLL[2 * idx];
    const lat = pointsLL[2 * idx + 1];
    const point = pool[idx];

    // Simple positioning at ground level
    point.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0.5);
    point.color = classes ? colorForClass(classes[idx]) : PREVIEW_COLOR();
    point.show = true;
  }
  for (; idx < capacity; idx++) pool[idx].show = false;
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
  generation = 0;
}
