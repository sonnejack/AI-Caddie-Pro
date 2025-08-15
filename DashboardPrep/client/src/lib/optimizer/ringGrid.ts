// client/src/lib/optimizer/ringGrid.ts
// Ring Grid Optimizer (Half-Disc, Plays-Like Gating, Progress, Final Recheck)
// Adapted from task specification to align with existing repo structure

import { OptimizerStrategy, OptimizerInput, OptimizerResult, Candidate, LL } from './types';
import { ProgressiveStats } from '../sampling';
import { classifyPointInstant } from '../maskLookup';
import { bearingRad } from '../geo';
import { ES } from '@shared/expectedStrokesAdapter';

// Constants for coordinate conversion (matching CEM implementation)
const M_PER_DEG_LAT = 111320;

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
    
    // Check height grid availability for plays-like gating
    const hasHeightGrid = !!input.heightGrid;
    if (!hasHeightGrid) {
      console.log('RingGrid: skipping plays-like gating (no height grid)');
    }
    
    let evalCount = 0;
    const allCandidates: Array<{ ll: LL; es: number; ci95?: number }> = [];
    
    // Phase 1: Ring Grid Search
    const R = input.maxDistanceMeters;
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
        
        // Apply constraints
        if (!this.passesConstraints(aimLL, aimMeters, input, pinMeters, startToPinDist, hasHeightGrid)) {
          continue;
        }
        
        // Evaluate with progressive MC
        const { es, ci95 } = await this.evaluateAimPointProgressive(aimLL, input, signal);
        evalCount++;
        allCandidates.push({ ll: aimLL, es, ci95 });
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
          
          // Apply same constraints
          if (!this.passesConstraints(refinedLL, refinedMeters, input, pinMeters, startToPinDist, hasHeightGrid)) {
            continue;
          }
          
          const { es, ci95 } = await this.evaluateAimPointProgressive(refinedLL, input, signal);
          evalCount++;
          allCandidates.push({ ll: refinedLL, es, ci95 });
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
      
      if (!this.passesConstraints(aimLL, aimMeters, input, pinMeters, startToPinDist, hasHeightGrid)) {
        continue;
      }
      
      const { es, ci95 } = await this.evaluateAimPointProgressive(aimLL, input, signal);
      evalCount++;
      allCandidates.push({ ll: aimLL, es, ci95 });
    }
    
    // Phase 4: Final selection with spatial separation
    if (signal.aborted) throw new Error('Optimization aborted');
    
    // Sort all candidates by ES
    allCandidates.sort((a, b) => a.es - b.es);
    
    // Select final candidates with spatial separation
    const finalCandidates: Candidate[] = [];
    const minSeparationM = input.constraints?.minSeparationMeters || 3;
    const maxFinalCandidates = 8;
    
    for (const candidate of allCandidates) {
      if (finalCandidates.length >= maxFinalCandidates) break;
      
      // Check separation from existing candidates
      let tooClose = false;
      for (const existing of finalCandidates) {
        const dist = this.calculateDistance(candidate.ll, { lon: existing.lon, lat: existing.lat });
        if (dist < minSeparationM) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        // Re-evaluate with final sample count for stability
        const { es: finalES, ci95: finalCI95 } = await this.evaluateAimPointProgressive(
          candidate.ll, 
          { ...input, eval: { ...input.eval, nEarly: input.eval.nFinal } }, 
          signal
        );
        evalCount++;
        
        finalCandidates.push({
          lon: candidate.ll.lon,
          lat: candidate.ll.lat,
          es: finalES,
          esCi95: finalCI95
        });
      }
    }
    
    // Final sort by ES (ascending - lower is better)
    finalCandidates.sort((a, b) => a.es - b.es);
    
    return {
      candidates: finalCandidates,
      iterations: numRings,
      evalCount,
      diagnostics: {
        totalCandidatesEvaluated: allCandidates.length,
        ringCount: numRings,
        refinementCandidates: params.topSeeds,
        randomCoveragePoints: params.randomCover
      }
    };
  }
  
  private passesConstraints(
    aimLL: LL, 
    aimMeters: { x: number; y: number }, 
    input: OptimizerInput,
    pinMeters: { x: number; y: number },
    startToPinDist: number,
    hasHeightGrid: boolean
  ): boolean {
    // Use proper geodesic distance calculation instead of coordinate distance
    const startToAimDistanceMeters = this.calculateDistance(input.start, aimLL);
    const startToAimDistanceYards = startToAimDistanceMeters / 0.9144;
    const maxDistanceYards = input.maxDistanceMeters / 0.9144;
    
    // Primary constraint: plays-like distance (without elevation, just surface distance) ≤ max driver distance
    if (startToAimDistanceYards > maxDistanceYards) {
      return false;
    }
    
    // Distance constraint: don't allow aims farther from pin than start is
    if (input.constraints?.disallowFartherThanPin) {
      const aimToPinDist = this.calculateDistance(aimLL, input.pin);
      const startToPinDistProper = this.calculateDistance(input.start, input.pin);
      if (aimToPinDist > startToPinDistProper) {
        return false;
      }
    }
    
    return true;
  }
  
  private async evaluateAimPointProgressive(
    aim: LL, 
    input: OptimizerInput, 
    signal: AbortSignal
  ): Promise<{ es: number; ci95: number }> {
    const stats = new ProgressiveStats();
    const maxSamples = input.eval.nEarly;
    
    // Calculate ellipse parameters (reuse pattern from CEM)
    const aimToStart = {
      x: (input.start.lon - aim.lon) * M_PER_DEG_LAT * Math.cos(aim.lat * Math.PI / 180),
      y: (input.start.lat - aim.lat) * M_PER_DEG_LAT
    };
    const distance = Math.sqrt(aimToStart.x ** 2 + aimToStart.y ** 2);
    const bearing = Math.atan2(aimToStart.x, aimToStart.y);
    
    // Convert skill parameters to ellipse dimensions (in meters)
    const distanceYards = distance / 0.9144;
    const semiMajorYards = (input.skill.distPct / 100) * distanceYards;
    const semiMinorYards = distanceYards * Math.tan(input.skill.offlineDeg * Math.PI / 180);
    const semiMajorM = semiMajorYards * 0.9144;
    const semiMinorM = semiMinorYards * 0.9144;
    
    // Progressive Monte Carlo with uniform ellipse sampling
    for (let i = 0; i < maxSamples; i++) {
      if (signal.aborted) throw new Error('Evaluation aborted');
      
      const sample = this.sampleEllipse(aim, semiMajorM, semiMinorM, bearing);
      const classId = classifyPointInstant(sample.lon, sample.lat, {
        width: input.mask.width,
        height: input.mask.height,
        bbox: input.mask.bbox,
        data: input.mask.classes
      } as any);
      
      const condition = this.classIdToCondition(classId);
      const distanceToPin = this.calculateDistance(sample, input.pin);
      const distanceToPinYards = distanceToPin / 0.9144;
      
      const es = ES.calculate(distanceToPinYards, condition);
      stats.add(es);
      
      // Early stop when 95% CI ≤ ci95Stop
      if (i > 30 && stats.getConfidenceInterval95() <= input.eval.ci95Stop) {
        break;
      }
    }
    
    return {
      es: stats.getMean(),
      ci95: stats.getConfidenceInterval95()
    };
  }
  
  private sampleEllipse(center: LL, semiMajorM: number, semiMinorM: number, bearing: number): LL {
    // Uniform sampling in unit disk (matching CEM implementation)
    const u1 = Math.random();
    const u2 = Math.random();
    const r = Math.sqrt(u1);
    const theta = 2 * Math.PI * u2;
    
    // Transform to ellipse local coordinates
    const x = semiMajorM * r * Math.cos(theta);
    const y = semiMinorM * r * Math.sin(theta);
    
    // Rotate by bearing
    const cos_bearing = Math.cos(bearing);
    const sin_bearing = Math.sin(bearing);
    const x_rot = x * cos_bearing - y * sin_bearing;
    const y_rot = x * sin_bearing + y * cos_bearing;
    
    // Convert to lat/lon
    const mPerDegLon = M_PER_DEG_LAT * Math.cos(center.lat * Math.PI / 180);
    return {
      lon: center.lon + x_rot / mPerDegLon,
      lat: center.lat + y_rot / M_PER_DEG_LAT
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
  
  private classIdToCondition(classId: number): 'green'|'fairway'|'rough'|'sand'|'recovery'|'water' {
    switch (classId) {
      case 5: return 'green';
      case 6: return 'fairway';
      case 4: return 'sand'; // bunker
      case 2: return 'water';
      case 7: return 'recovery';
      default: return 'rough'; // 0,1,3,8,9 -> rough
    }
  }
}