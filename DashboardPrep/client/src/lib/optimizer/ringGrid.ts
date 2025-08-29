// client/src/lib/optimizer/ringGrid.ts
// Ring Grid Optimizer (Half-Disc, Plays-Like Gating, Progress, Final Recheck)
// Adapted from task specification to align with existing repo structure

import { OptimizerStrategy, OptimizerInput, OptimizerResult, Candidate, LL } from './types';
import { ProgressiveStats, generateEllipseSamples } from '../sampling';
import { bearingRad } from '../geo';
import { ES } from '@shared/expectedStrokesAdapter';

// Constants for coordinate conversion (matching CEM implementation)
const M_PER_DEG_LAT = 111320;

// Sample raster pixel directly (same as CesiumCanvas)
function sampleRasterPixel(lon: number, lat: number, maskBuffer: { width: number; height: number; bbox: any; data: Uint8ClampedArray }): number {
  const { width, height, bbox, data } = maskBuffer;
  
  // Convert lat/lon to pixel coordinates
  const x = Math.floor(((lon - bbox.west) / (bbox.east - bbox.west)) * width);
  const y = Math.floor(((bbox.north - lat) / (bbox.north - bbox.south)) * height);
  
  // Clamp to bounds
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(height - 1, y));
  
  // Sample pixel (assuming RGBA format, class in R channel)
  const pixelIndex = (clampedY * width + clampedX) * 4;
  const classId = data[pixelIndex]; // Red channel contains class ID
  
  // Treat unknown (0) as rough (8) - any pixel without features is rough
  return classId === 0 ? 8 : classId;
}

interface RingGridParameters {
  sArc: number;           // Target arc spacing (default 10 meters)
  dr: number;            // Radial step (default 10 meters)
  minPts: number;        // Minimum points per ring (default 16)
  topSeeds: number;      // Top candidates for refinement (default 12)
  refineRadius: number;  // Radius for local refinement (calculated from R)
  refineSteps: number;   // Steps for refinement grid (default 7)
  randomCover: number;   // Random coverage points (default 200)
}

const DEFAULT_RING_GRID_PARAMS: RingGridParameters = {
  sArc: 10,         // meters
  dr: 10,           // meters
  minPts: 16,
  topSeeds: 12,
  refineRadius: 0,  // Will be calculated as max(0.03*R, 9)
  refineSteps: 7,
  randomCover: 200
};

export class RingGridOptimizer implements OptimizerStrategy {
  name: 'RingGrid' = 'RingGrid';

  async run(input: OptimizerInput, signal: AbortSignal): Promise<OptimizerResult> {
    const params = { ...DEFAULT_RING_GRID_PARAMS };
    params.refineRadius = Math.max(0.03 * input.maxDistanceMeters, 9);
    
    const mPerDegLon = M_PER_DEG_LAT * Math.cos(input.start.lat * Math.PI / 180);
    
    // Convert points to local tangent plane (meters)
    const toMeters = (ll: LL) => ({
      x: (ll.lon - input.start.lon) * mPerDegLon,
      y: (ll.lat - input.start.lat) * M_PER_DEG_LAT
    });
    
    const toLL = (xy: { x: number; y: number }): LL => ({
      lon: input.start.lon + xy.x / mPerDegLon,
      lat: input.start.lat + xy.y / M_PER_DEG_LAT
    });

    const pinMeters = toMeters(input.pin);
    const startToPinDist = Math.sqrt(pinMeters.x * pinMeters.x + pinMeters.y * pinMeters.y);
    
    // Forward bearing: from start to pin
    const bearingForward = bearingRad(input.start.lon, input.start.lat, input.pin.lon, input.pin.lat);
    
    const realMaxDistanceYards = input.eval.maxDistanceYards || (input.maxDistanceMeters / 0.9144);
    let bufferDistanceMeters = input.maxDistanceMeters; // This already includes 30-yard buffer
    
    console.log(`[RingGrid] Adaptive terrain-aware search starting with ${(bufferDistanceMeters / 0.9144).toFixed(0)} yards`);
    
    // Phase 1: Terrain sampling with feeler points (adaptive search boundary)
    try {
      const feelerStep = 5; // degrees
      const feelerPoints: Array<{ bearing: number; maxValidRadius: number }> = [];
      
      for (let bearing = 0; bearing < 180; bearing += feelerStep) {
        const bearingRad = bearing * Math.PI / 180;
        let validRadius = 0;
        
        // Sample points along this bearing
        for (let testRadius = 10; testRadius <= bufferDistanceMeters; testRadius += 20) {
          const testX = testRadius * Math.sin(bearingRad);
          const testY = testRadius * Math.cos(bearingRad);
          const testPoint = toLL({ x: testX, y: testY });
          
          // Check if this point is within the real max distance constraint
          const surfaceDistance = this.calculateDistance(input.start, testPoint);
          const surfaceDistanceYards = surfaceDistance / 0.9144;
          
          // Placeholder for elevation-based plays-like calculation
          // In practice, this would use live elevation sampling
          const playsLikeYards = surfaceDistanceYards; // Simplified for now
          
          if (playsLikeYards <= realMaxDistanceYards) {
            validRadius = testRadius;
          } else {
            break; // Stop extending in this direction
          }
        }
        
        feelerPoints.push({ bearing, maxValidRadius: validRadius });
      }
      
      // Calculate dynamic search radius based on terrain constraints
      const avgValidRadius = feelerPoints.reduce((sum, p) => sum + p.maxValidRadius, 0) / feelerPoints.length;
      const minValidRadius = Math.min(...feelerPoints.map(p => p.maxValidRadius));
      
      // Use conservative estimate but don't go below original radius
      const adaptiveRadius = Math.max(minValidRadius * 1.1, avgValidRadius * 0.9);
      bufferDistanceMeters = Math.min(bufferDistanceMeters, adaptiveRadius);
      
      console.log(`[RingGrid] Adaptive search: Avg valid radius ${(avgValidRadius/0.9144).toFixed(0)}y, min ${(minValidRadius/0.9144).toFixed(0)}y, using ${(bufferDistanceMeters/0.9144).toFixed(0)}y`);
      
    } catch (error) {
      console.warn(`[RingGrid] Adaptive search failed, using original buffer:`, error);
    }
    
    let evalCount = 0;
    const allCandidates: Array<{ ll: LL; es: number; ci95?: number; conditionBreakdown?: Record<number, number> }> = [];
    
    // Phase 2: Ring Grid Search (with adaptive buffer, no elevation filtering)
    const R = bufferDistanceMeters;
    const numRings = Math.ceil(R / params.dr);
    
    for (let k = 1; k <= numRings; k++) {
      if (signal.aborted) throw new Error('Optimization aborted');
      
      const r = k * params.dr;
      // Don't generate rings beyond max distance
      if (r > R) break;
      
      const halfCircumference = Math.PI * r;
      const pointsPerRing = Math.max(params.minPts, Math.round(halfCircumference / params.sArc));
      
      // Generate ring candidates
      for (let i = 0; i < pointsPerRing; i++) {
        if (signal.aborted) throw new Error('Optimization aborted');
        
        // θ ∈ [-90°, +90°] relative to forward bearing
        const theta = (i / (pointsPerRing - 1)) * Math.PI - Math.PI/2; // -π/2 to π/2
        const absoluteAzimuth = bearingForward + theta;
        
        // Convert to local tangent offsets
        const dx = r * Math.cos(theta);
        const dy = r * Math.sin(theta);
        
        // Rotate to absolute coordinates
        const x = dx * Math.cos(bearingForward) - dy * Math.sin(bearingForward);
        const y = dx * Math.sin(bearingForward) + dy * Math.cos(bearingForward);
        
        const aimMeters = { x, y };
        const aimLL = toLL(aimMeters);
        
        // Apply basic constraints (no elevation filtering yet)
        if (!this.passesBasicConstraints(aimLL, input, bufferDistanceMeters)) {
          continue;
        }
        
        // Evaluate with progressive MC
        const result = await this.evaluateAimPointProgressive(aimLL, input, signal);
        evalCount++;
        allCandidates.push({ ll: aimLL, es: result.es, ci95: result.ci95, conditionBreakdown: result.conditionBreakdown, ellipseDimensions: result.ellipseDimensions });
      }
      
      // Update progress
      const progress = (k / numRings) * 70; // Reserve 30% for refinement
      // Note: In worker, would postMessage({ type: 'progress', pct: progress, note: `Ring ${k}/${numRings}` })
    }
    
    // Phase 2: Refinement around top candidates
    if (signal.aborted) throw new Error('Optimization aborted');
    
    // Sort and take top seeds
    allCandidates.sort((a, b) => a.es - b.es);
    const topCandidates = allCandidates.slice(0, params.topSeeds);
    
    for (let i = 0; i < topCandidates.length; i++) {
      if (signal.aborted) throw new Error('Optimization aborted');
      
      const baseCandidate = topCandidates[i];
      const baseMeters = toMeters(baseCandidate.ll);
      
      // 7x7 micro-grid around this candidate
      for (let gx = 0; gx < params.refineSteps; gx++) {
        for (let gy = 0; gy < params.refineSteps; gy++) {
          // Skip center (already evaluated)
          if (gx === Math.floor(params.refineSteps/2) && gy === Math.floor(params.refineSteps/2)) continue;
          
          const offsetX = (gx - Math.floor(params.refineSteps/2)) * (params.refineRadius / params.refineSteps);
          const offsetY = (gy - Math.floor(params.refineSteps/2)) * (params.refineRadius / params.refineSteps);
          
          const refinedMeters = {
            x: baseMeters.x + offsetX,
            y: baseMeters.y + offsetY
          };
          const refinedLL = toLL(refinedMeters);
          
          // Apply basic constraints
          if (!this.passesBasicConstraints(refinedLL, input, bufferDistanceMeters)) {
            continue;
          }
          
          const result = await this.evaluateAimPointProgressive(refinedLL, input, signal);
          evalCount++;
          allCandidates.push({ ll: refinedLL, es: result.es, ci95: result.ci95, conditionBreakdown: result.conditionBreakdown, ellipseDimensions: result.ellipseDimensions });
        }
      }
      
      // Update progress
      const progress = 70 + (i / topCandidates.length) * 20;
      // Note: In worker, would postMessage({ type: 'progress', pct: progress, note: `Refining ${i+1}/${topCandidates.length}` })
    }
    
    // Phase 3: Random coverage (optional)
    for (let i = 0; i < params.randomCover; i++) {
      if (signal.aborted) throw new Error('Optimization aborted');
      
      // Random point in forward half-disc using sqrt radial distribution
      const u1 = Math.random();
      const u2 = Math.random();
      const r = Math.sqrt(u1) * R; // sqrt for uniform area distribution
      const theta = (u2 - 0.5) * Math.PI; // -π/2 to π/2
      
      const dx = r * Math.cos(theta);
      const dy = r * Math.sin(theta);
      
      // Rotate to absolute coordinates
      const x = dx * Math.cos(bearingForward) - dy * Math.sin(bearingForward);
      const y = dx * Math.sin(bearingForward) + dy * Math.cos(bearingForward);
      
      const aimMeters = { x, y };
      const aimLL = toLL(aimMeters);
      
      if (!this.passesBasicConstraints(aimLL, input, bufferDistanceMeters)) {
        continue;
      }
      
      const result = await this.evaluateAimPointProgressive(aimLL, input, signal);
      evalCount++;
      allCandidates.push({ ll: aimLL, es: result.es, ci95: result.ci95, conditionBreakdown: result.conditionBreakdown });
    }
    
    // Phase 4: Sort by Expected Strokes and return top candidates for main thread filtering
    if (signal.aborted) throw new Error('Optimization aborted');
    
    // Sort all candidates by ES (best first)
    allCandidates.sort((a, b) => a.es - b.es);
    console.log(`[RingGrid] Sorted ${allCandidates.length} candidates by Expected Strokes`);
    
    // Return top candidates for main thread elevation filtering
    // NOTE: Elevation filtering moved to main thread where Cesium is accessible
    console.log(`[RingGrid] Returning top 100 candidates for main thread elevation filtering`);
    
    const topCandidatesForFiltering = allCandidates.slice(0, 100).map(c => ({
      lon: c.ll.lon,
      lat: c.ll.lat,
      es: c.es,
      esCi95: c.ci95 || 0,
      conditionBreakdown: c.conditionBreakdown,
      ellipseDimensions: c.ellipseDimensions
    }));
    
    return {
      candidates: topCandidatesForFiltering,
      iterations: numRings,
      evalCount,
      diagnostics: {
        totalCandidatesEvaluated: allCandidates.length,
        ringCount: numRings,
        refinementCandidates: params.topSeeds,
        randomCoveragePoints: params.randomCover,
        returnedForFiltering: Math.min(100, allCandidates.length)
      }
    };
  }
  
  /**
   * Basic constraint check (no elevation filtering)
   */
  private passesBasicConstraints(
    aimLL: LL,
    input: OptimizerInput,
    bufferDistanceMeters: number
  ): boolean {
    // Use proper geodesic distance calculation
    const startToAimDistanceMeters = this.calculateDistance(input.start, aimLL);
    
    // Must be within buffer distance (surface distance only)
    if (startToAimDistanceMeters > bufferDistanceMeters) {
      return false;
    }
    
    // Distance constraint: don't allow aims farther from pin than start is
    if (input.constraints?.disallowFartherThanPin) {
      const aimToPinDist = this.calculateDistance(aimLL, input.pin);
      const startToPinDist = this.calculateDistance(input.start, input.pin);
      if (aimToPinDist > startToPinDist) {
        return false;
      }
    }
    
    return true;
  }
  
  private async evaluateAimPointProgressive(
    aim: LL, 
    input: OptimizerInput, 
    signal: AbortSignal
  ): Promise<{ es: number; ci95: number; conditionBreakdown?: Record<number, number> }> {
    const stats = new ProgressiveStats();
    const conditionBreakdown: Record<number, number> = {};
    const maxSamples = input.eval.nFinal;
    
    // Calculate distance from start to aim point
    const distance = this.calculateDistance(input.start, aim) / 0.9144; // Convert to yards
    
    // Calculate ellipse parameters (same as CesiumCanvas/DispersionInspector)
    const distanceErrorPct = input.skill.distPct;
    const lateralErrorDeg = input.skill.offlineDeg;
    
    // Ellipse semi-axes calculations (same as ellipseAxes function)
    // Double the dimensions to match shot metrics
    let a = 2 * distance * (distanceErrorPct / 100); // distance axis - doubled
    let b = 2 * distance * Math.tan(lateralErrorDeg * Math.PI / 180); // lateral axis - doubled
    
    // Apply roll condition multipliers to ellipse dimensions
    a = a * input.rollMultipliers.depthMultiplier;
    b = b * input.rollMultipliers.widthMultiplier;
    
    // Calculate bearing from start to aim using proper spherical geometry (matching CesiumCanvas)
    const bearing = this.calculateBearing(input.start, aim);
    
    // Generate samples - swap axes for optimizer consistency
    // Use: semiMajor=a (distance), semiMinor=b (lateral) to match other optimizers
    const samplePoints = generateEllipseSamples(maxSamples, a, b, bearing, aim, 1);
    
    // Create mock mask buffer for classification
    const mockMaskBuffer = {
      width: input.mask.width,
      height: input.mask.height,
      bbox: input.mask.bbox,
      data: input.mask.classes
    };
    
    // Evaluate each sample point
    for (let i = 0; i < maxSamples; i++) {
      if (signal.aborted) throw new Error('Evaluation aborted');
      
      // Extract point coordinates from Float64Array
      const landingLon = samplePoints[i * 2];
      const landingLat = samplePoints[i * 2 + 1];
      
      // Classify landing point using same function as CesiumCanvas
      const classId = sampleRasterPixel(landingLon, landingLat, mockMaskBuffer);
      
      // Track condition breakdown for debugging
      conditionBreakdown[classId] = (conditionBreakdown[classId] || 0) + 1;
      
      // Convert to condition and calculate distance to pin with penalty
      const { condition, penalty } = this.classIdToConditionWithPenalty(classId);
      const distanceToPin = this.calculateDistance({ lon: landingLon, lat: landingLat }, input.pin) / 0.9144; // Convert to yards
      
      // Calculate expected strokes for this outcome
      const baseES = ES.calculate(distanceToPin, condition);
      const es = baseES + penalty;
      stats.add(es);
      
      // Early stop when 95% CI ≤ ci95Stop
      if (i > 30 && stats.getConfidenceInterval95() <= input.eval.ci95Stop) {
        console.log(`[RingGrid] Early exit at ${i + 1} samples, CI95=${stats.getConfidenceInterval95().toFixed(4)}`);
        break;
      }
    }
    
    return {
      es: stats.getMean(),
      ci95: stats.getConfidenceInterval95(),
      conditionBreakdown,
      ellipseDimensions: {
        semiMajorYards: a / 0.9144, // distance (depth) 
        semiMinorYards: b / 0.9144, // lateral (width)
        distanceYards: distance
      }
    };
  }
  
  private calculateDistance(point1: LL, point2: LL): number {
    // Use haversine formula for accurate geodesic distance
    const R = 6371000; // Earth radius in meters
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lon - point1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + 
             Math.cos(point1.lat * Math.PI/180) * Math.cos(point2.lat * Math.PI/180) * 
             Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // meters
  }

  private calculateBearing(from: LL, to: LL): number {
    // Proper spherical bearing calculation matching CesiumCanvas
    const dLon = (to.lon - from.lon) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    return Math.atan2(y, x);
  }
  
  private classIdToConditionWithPenalty(classId: number): { condition: 'green'|'fairway'|'rough'|'sand'|'recovery'|'water'; penalty: number } {
    switch (classId) {
      case 0: return { condition: 'rough', penalty: 0 }; // UNKNOWN -> rough
      case 1: return { condition: 'rough', penalty: 2 }; // OB -> rough + 2
      case 2: return { condition: 'water', penalty: 0 }; // WATER (already includes +1 in engine)
      case 3: return { condition: 'rough', penalty: 1 }; // HAZARD -> rough + 1
      case 4: return { condition: 'sand', penalty: 0 };  // BUNKER -> sand
      case 5: return { condition: 'green', penalty: 0 }; // GREEN
      case 6: return { condition: 'fairway', penalty: 0 }; // FAIRWAY
      case 7: return { condition: 'recovery', penalty: 0 }; // RECOVERY
      case 8: return { condition: 'rough', penalty: 0 }; // ROUGH
      case 9: return { condition: 'fairway', penalty: 0 }; // TEE -> fairway
      default: return { condition: 'rough', penalty: 0 };
    }
  }
  
  private classIdToCondition(classId: number): 'green'|'fairway'|'rough'|'sand'|'recovery'|'water' {
    return this.classIdToConditionWithPenalty(classId).condition;
  }

}