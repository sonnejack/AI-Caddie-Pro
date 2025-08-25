// client/src/components/prepare/CandidateLayer.ts
// Cesium layer for rendering optimization candidates as vertical beacon pillars (RimLighting primitives)

import { Candidate } from "../../lib/optimizer/types";

let viewerRef: any = null;
let candidatePrims: any[] = []; // store Cesium.Primitive per candidate
let candidates: Candidate[] = [];
let clickCallback: ((idx: number, candidate: Candidate) => void) | null = null;
let clickHandler: any = null;

function getCesium(): any {
  return (window as any).Cesium;
}

// ---------- Visual spec ----------
const BEACON_HEIGHT = 200; // meters

// Thickness by rank (diameter meters) - made thicker
const BEACON_DIAM_BY_RANK = [2.0, 1.5, 1.2, 1.0, 0.8];

// RimLighting settings (match Sandcastle)
const RIM_COLOR = "CYAN";
const RIM_ALPHA = 0.65;
const RIM_RIMCOLOR = "PALEVIOLETRED";
const RIM_RIMALPHA = 0.01;
const RIM_WIDTH = 1.0;

// ---------- Clamp mode ----------
type ClampMode = "visible" | "terrain";
/**
 * visible: base is pinned to whatever is rendered (3D Tiles or terrain)
 * terrain: no sampling — places center at height/2 (may not perfectly touch tiles)
 */
let CLAMP_MODE: ClampMode = "visible";

// ---------- Helpers ----------
function isFiniteDeg(x: any) {
  return typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 360;
}

// Prefer sampling the actually-visible surface; swallow errors to avoid overlay
async function sampleVisibleGroundQuiet(viewer: any, Cesium: any, lon: number, lat: number): Promise<number> {
  try {
    const carto = Cesium.Cartographic.fromDegrees(lon, lat);
    if (viewer.scene && typeof viewer.scene.sampleHeightMostDetailed === "function") {
      const h = await viewer.scene.sampleHeightMostDetailed(carto);
      if (Number.isFinite(h)) return h as number;
    }
  } catch {}
  try {
    if (viewer.terrain?.ready && typeof Cesium.sampleTerrainMostDetailed === "function") {
      const [s] = await Cesium.sampleTerrainMostDetailed(viewer.terrain, [
        Cesium.Cartographic.fromDegrees(lon, lat),
      ]);
      if (s && Number.isFinite(s.height)) return s.height as number;
    }
  } catch {}
  try {
    const h2 = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
    if (Number.isFinite(h2)) return h2 as number;
  } catch {}
  return 0;
}

function makeRimLightingMaterial(Cesium: any, baseAlpha = RIM_ALPHA) {
  return Cesium.Material.fromType("RimLighting", {
    color:     (Cesium.Color as any)[RIM_COLOR].withAlpha(baseAlpha),
    rimColor:  (Cesium.Color as any)[RIM_RIMCOLOR].withAlpha(RIM_RIMALPHA),
    width:     RIM_WIDTH
  });
}

function diameterForRank(rank1based: number) {
  const i = Math.max(0, Math.min(rank1based - 1, BEACON_DIAM_BY_RANK.length - 1));
  return BEACON_DIAM_BY_RANK[i];
}

// ---------- Public API ----------
export function initCandidateLayer(viewer: any): void {
  if (viewerRef) {
    console.log("🎯 CandidateLayer already initialized");
    return;
  }
  const Cesium = getCesium();
  viewerRef = viewer;

  // Click handler — works with Primitive picking (GeometryInstance id)
  clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((event: any) => {
    const picked = viewer.scene.pick(event.position);
    const pickedId = picked?.id; // GeometryInstance.id (we set this per candidate)
    if (!pickedId) return;
    const idx = pickedId?.candidateIndex;
    if (typeof idx === "number" && idx >= 0 && idx < candidates.length && clickCallback) {
      clickCallback(idx, candidates[idx]);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Expose a runtime toggle if you want to flip clamp behavior
  (window as any).__setCandidateClampMode = (m: ClampMode) => {
    CLAMP_MODE = m;
    console.log("CLAMP_MODE =", m);
  };
}

export async function setCandidates(newCandidates: Candidate[]): Promise<void> {
  if (!viewerRef) {
    console.warn("⚠️ setCandidates called before init");
    return;
  }

  clearCandidates();
  candidates = [...newCandidates];
  const Cesium = getCesium();

  // Build one RimLighting Primitive per candidate
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!isFiniteDeg(c.lon) || !isFiniteDeg(c.lat)) {
      console.error(`❌ Candidate ${i} has invalid coordinates:`, c.lon, c.lat);
      continue;
    }

    // Compute world position (center = base height + length/2)
    let centerZ: number;
    if (CLAMP_MODE === "visible") {
      const ground = await sampleVisibleGroundQuiet(viewerRef, Cesium, c.lon, c.lat);
      centerZ = ground + BEACON_HEIGHT / 2;
    } else {
      centerZ = BEACON_HEIGHT / 2; // terrain-only fallback (no sampling)
    }

    const modelMatrix = Cesium.Matrix4.multiplyByTranslation(
      Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(c.lon, c.lat, centerZ)
      ),
      new Cesium.Cartesian3(0.0, 0.0, 0.0),
      new Cesium.Matrix4()
    );

    // Geometry: diameter by rank
    const diameter = diameterForRank(i + 1);
    const radius = diameter / 2;

    const geom = new Cesium.CylinderGeometry({
      length: BEACON_HEIGHT,
      topRadius: radius,
      bottomRadius: radius,
    });

    // Material: exactly like Sandcastle RimLighting (use per-rank alpha if you want)
    const alphaByRank = [0.70, 0.55, 0.40, 0.30, 0.22][Math.min(i, 4)];
    const rimMat = makeRimLightingMaterial(Cesium, alphaByRank);

    const appearance = new Cesium.MaterialAppearance({
      material: rimMat,
      faceForward: true,
      translucent: true,
      closed: false
    });

    // Give the instance an id we can pick
    const instance = new Cesium.GeometryInstance({
      geometry: geom,
      modelMatrix,
      id: { candidateIndex: i }
    });

    const prim = new Cesium.Primitive({
      geometryInstances: instance,
      appearance,
      asynchronous: false,            // build immediately
      shadows: Cesium.ShadowMode.DISABLED
    });

    viewerRef.scene.primitives.add(prim);
    candidatePrims.push(prim);
  }

  viewerRef.scene.requestRender();
}

export function clearCandidates(): void {
  if (!viewerRef) return;
  const prims = candidatePrims.splice(0, candidatePrims.length);
  for (const p of prims) {
    try { viewerRef.scene.primitives.remove(p); } catch {}
  }
  viewerRef.scene.requestRender();
}

export function onCandidateClick(callback: (idx: number, candidate: Candidate) => void): void {
  clickCallback = callback;
}

export function destroyCandidateLayer(): void {
  clearCandidates();
  if (clickHandler) {
    clickHandler.destroy();
    clickHandler = null;
  }
  candidates = [];
  clickCallback = null;
  viewerRef = null;
}

export function getCandidateInfo(index: number): { candidate: Candidate; rank: number } | null {
  if (index < 0 || index >= candidates.length) return null;
  return { candidate: candidates[index], rank: index + 1 };
}

export function areCandidatesVisible(): boolean {
  // Primitives don't share a single .show; if we have any, consider them visible
  return candidatePrims.length > 0;
}

export function showCandidates(visible: boolean): void {
  for (const p of candidatePrims) p.show = visible;
  viewerRef?.scene.requestRender?.();
}