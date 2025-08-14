// client/src/components/prepare/CandidateLayer.ts
// Cesium layer for rendering optimization candidate points as clickable numbered markers

import { Candidate } from '../../lib/optimizer/types';

let viewerRef: any = null;
let candidateEntities: any[] = [];
let candidates: Candidate[] = [];
let clickCallback: ((idx: number, candidate: Candidate) => void) | null = null;
let clickHandler: any = null;

function getCesium(): any { 
  return (window as any).Cesium; 
}

// Get color based on rank and ES value relative to best
function getCandidateColor(rank: number, esValue: number, bestES: number): any {
  const Cesium = getCesium();
  
  // Top 3 get medal colors regardless of ES
  if (rank === 1) return Cesium.Color.GOLD;
  if (rank === 2) return Cesium.Color.SILVER;
  if (rank === 3) return Cesium.Color.fromCssColorString('#CD7F32'); // Bronze
  
  // For ranks 4+, use ES-based color scale
  const esDiff = esValue - bestES;
  
  if (esDiff <= 0.02) return Cesium.Color.LIMEGREEN;      // Excellent (within 0.02 strokes)
  if (esDiff <= 0.05) return Cesium.Color.YELLOW;        // Good (within 0.05 strokes)
  if (esDiff <= 0.10) return Cesium.Color.ORANGE;        // Okay (within 0.10 strokes)
  return Cesium.Color.LIGHTCORAL;                        // Poor (more than 0.10 strokes)
}

export function initCandidateLayer(viewer: any): void {
  if (viewerRef) return; // Already initialized

  const Cesium = getCesium();
  viewerRef = viewer;

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
  if (!viewerRef) return;
  
  const Cesium = getCesium();
  candidates = [...newCandidates];
  
  // Clear existing entities
  candidateEntities.forEach(entity => {
    viewerRef.entities.remove(entity);
  });
  candidateEntities = [];
  
  // Add new candidate entities
  const bestES = candidates.length > 0 ? candidates[0].es : 0;
  
  candidates.forEach((candidate, index) => {
    const rank = index + 1;
    const color = getCandidateColor(rank, candidate.es, bestES);
    
    // Larger size for top 3, smaller for others
    const pixelSize = rank <= 3 ? 25 : 20;
    
    const entity = viewerRef.entities.add({
      position: Cesium.Cartesian3.fromDegrees(candidate.lon, candidate.lat),
      candidateIndex: index, // Store index for click handling
      point: {
        pixelSize,
        color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: rank <= 3 ? 3 : 2, // Thicker outline for top 3
        scaleByDistance: new Cesium.NearFarScalar(1.0, 1.2, 500.0, 0.8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // Clamp to ground
        show: true
      },
      label: {
        text: rank.toString(),
        font: rank <= 3 ? 'bold 16pt sans-serif' : '14pt sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -30),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // Clamp to ground
        show: true
      }
    });
    
    candidateEntities.push(entity);
  });
}

export function clearCandidates(): void {
  if (!viewerRef) return;
  
  // Clear existing entities
  candidateEntities.forEach(entity => {
    viewerRef.entities.remove(entity);
  });
  candidateEntities = [];
  candidates = [];
}

export function onCandidateClick(callback: (idx: number, candidate: Candidate) => void): void {
  clickCallback = callback;
}

export function destroyCandidateLayer(): void {
  // Clear all entities
  clearCandidates();
  
  if (clickHandler) {
    clickHandler.destroy();
    clickHandler = null;
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
  return candidateEntities.length > 0 && candidateEntities.every(entity => entity.show);
}

// Toggle candidate visibility
export function showCandidates(visible: boolean): void {
  candidateEntities.forEach(entity => {
    entity.show = visible;
  });
}