// client/src/components/prepare/CandidateLayer.ts
// Cesium layer for rendering optimization candidate points as clickable numbered markers

import { Candidate } from '../../lib/optimizer/types';
import { HeightProvider, CesiumHeightProvider, SampleReq } from "@/lib/heightProvider";

let viewerRef: any = null;
let pointCollection: any = null;
let candidatePoints: any[] = [];
let candidates: Candidate[] = [];
let clickCallback: ((idx: number, candidate: Candidate) => void) | null = null;
let clickHandler: any = null;
let heightProvider: HeightProvider | null = null;
let generation = 0;
let pending: SampleReq[] = [];
let rafId: number | null = null;

function getCesium(): any { 
  return (window as any).Cesium; 
}

// Get color based on rank - gold/silver/bronze then slate
function getCandidateColor(rank: number, esValue: number, bestES: number): any {
  const Cesium = getCesium();
  
  if (rank === 1) return Cesium.Color.GOLD;           // 1st place
  if (rank === 2) return Cesium.Color.SILVER;         // 2nd place  
  if (rank === 3) return Cesium.Color.fromCssColorString('#CD7F32'); // 3rd place - Bronze
  
  return Cesium.Color.SLATEGRAY; // All others are slate gray
}

function scheduleAsyncRefine() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const batch = pending;
    pending = [];
    if (!heightProvider || batch.length === 0) return;

    heightProvider.sampleHeightsAsync(batch, (idx, h, gen) => {
      if (gen !== generation) return; // stale
      if (idx >= candidatePoints.length) return;
      const Cesium = getCesium();
      const candidate = candidates[idx];
      if (!candidate) return;
      
      // Update position with refined height + 2m lift for visibility
      candidatePoints[idx].position = Cesium.Cartesian3.fromDegrees(candidate.lon, candidate.lat, (h || 0) + 2.0);
    });
  });
}

export function initCandidateLayer(viewer: any): void {
  if (pointCollection) {
    console.log('🎯 CandidateLayer already initialized');
    return; // Already initialized
  }

  console.log('🎯 Initializing CandidateLayer with viewer:', viewer);
  const Cesium = getCesium();
  viewerRef = viewer;
  
  // Create point primitive collection like SamplesLayer
  pointCollection = new Cesium.PointPrimitiveCollection();
  viewer.scene.primitives.add(pointCollection);
  
  // Initialize height provider like SamplesLayer
  heightProvider = new CesiumHeightProvider(viewerRef);

  // Set up click handler for candidate selection
  clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((event: any) => {
    const pickedObject = viewer.scene.pick(event.position);
    
    if (pickedObject && pickedObject.id && pickedObject.id.candidateIndex !== undefined) {
      const candidateIndex = pickedObject.id.candidateIndex;
      if (candidateIndex >= 0 && candidateIndex < candidates.length && clickCallback) {
        clickCallback(candidateIndex, candidates[candidateIndex]);
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function setCandidates(newCandidates: Candidate[]): void {
  console.log('🎯 setCandidates called with:', newCandidates.length, 'candidates');
  console.log('🎯 Point collection exists:', !!pointCollection);
  
  if (!pointCollection) {
    console.warn('⚠️ No point collection in setCandidates');
    return;
  }
  
  const Cesium = getCesium();
  candidates = [...newCandidates];
  
  console.log('🎯 Clearing', candidatePoints.length, 'existing points');
  
  // Clear existing points
  candidatePoints.forEach(point => {
    pointCollection.remove(point);
  });
  candidatePoints = [];
  
  // Add new candidate points using PointPrimitive like SamplesLayer
  const bestES = candidates.length > 0 ? candidates[0].es : 0;
  console.log('🎯 Creating points for', candidates.length, 'candidates');
  
  // New generation for async height updates
  generation++;
  pending = [];
  
  candidates.forEach((candidate, index) => {
    const rank = index + 1;
    const color = getCandidateColor(rank, candidate.es, bestES);
    
    console.log(`🎯 Creating candidate ${rank} at [${candidate.lat}, ${candidate.lon}] with ES ${candidate.es}`);
    
    try {
      // Start with ground level + 2m lift for immediate visibility
      const point = pointCollection.add({
        position: Cesium.Cartesian3.fromDegrees(candidate.lon, candidate.lat, 2.0), // Start with 2m lift
        pixelSize: 12,
        color: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: true,
        candidateIndex: index // Store for click handling
      });
      
      console.log(`✅ Created point primitive for candidate ${rank}:`, point);
      candidatePoints.push(point);
      
      // Queue for precise height refinement
      pending.push({ idx: index, lon: candidate.lon, lat: candidate.lat, gen: generation });
    } catch (error) {
      console.error(`❌ Failed to create point for candidate ${rank}:`, error);
    }
  });
  
  // Schedule async height refinement for all points
  scheduleAsyncRefine();
  
  console.log(`🎯 Finished creating ${candidatePoints.length} candidate points`);
  
  // Check point collection state
  if (candidatePoints.length > 0) {
    console.log(`🎯 Point collection show:`, pointCollection.show);
    console.log(`🎯 Point collection length:`, pointCollection.length);
    
    // Check individual points
    candidatePoints.forEach((point, idx) => {
      console.log(`🎯 Point ${idx + 1} created successfully`);
    });
    
    // Force collection to be visible
    pointCollection.show = true;
    
    // Force a scene render
    viewerRef.scene.requestRender();
  }
}

export function clearCandidates(): void {
  if (!pointCollection) return;
  
  // Clear existing points
  candidatePoints.forEach(point => {
    pointCollection.remove(point);
  });
  candidatePoints = [];
  candidates = [];
}

export function onCandidateClick(callback: (idx: number, candidate: Candidate) => void): void {
  clickCallback = callback;
}

export function destroyCandidateLayer(): void {
  // Clear all points
  clearCandidates();
  
  if (clickHandler) {
    clickHandler.destroy();
    clickHandler = null;
  }
  
  if (pointCollection && viewerRef) {
    viewerRef.scene.primitives.remove(pointCollection);
    pointCollection = null;
  }
  
  candidates = [];
  clickCallback = null;
  viewerRef = null;
}

// Get candidate info for debugging/tooltips
export function getCandidateInfo(index: number): { candidate: Candidate; rank: number } | null {
  if (index < 0 || index >= candidates.length) return null;
  
  return {
    candidate: candidates[index],
    rank: index + 1
  };
}

// Check if candidates are currently visible
export function areCandidatesVisible(): boolean {
  return candidatePoints.length > 0 && pointCollection?.show;
}

// Toggle candidate visibility
export function showCandidates(visible: boolean): void {
  if (pointCollection) {
    pointCollection.show = visible;
  }
}