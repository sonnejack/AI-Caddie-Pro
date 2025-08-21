// client/src/lib/optimizer/fullGrid.ts
// Full Grid Search Optimizer - Exhaustive search with plays-like constraints

import { OptimizerStrategy, OptimizerInput, OptimizerResult, Candidate, LL } from './types';
import { ProgressiveStats, generateEllipseSamples } from '../sampling';
import { bearingRad } from '../geo';
import { ES } from '@shared/expectedStrokesAdapter';

// Constants for coordinate conversion
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

interface FullGridParameters {
  gridSpacingM: number;    // Grid spacing in meters (default 5m for high resolution)
  earlyN: number;          // Low N for initial screening
  finalN: number;          // High N for top candidates
  topCandidates: number;   // Number of top candidates to refine (default 100)
  ci95Threshold: number;   // CI95 threshold for early exit
}

const DEFAULT_FULL_GRID_PARAMS: FullGridParameters = {
  gridSpacingM: 5,         // 5 meter grid for high resolution
  earlyN: 200,             // Low sample count for screening
  finalN: 600,             // High sample count for final candidates
  topCandidates: 100,      // Top 100 candidates for refinement
  ci95Threshold: 0.03      // 3% CI threshold
};

export class FullGridOptimizer implements OptimizerStrategy {
  name: 'FullGrid' = 'FullGrid';

  async run(input: OptimizerInput, signal: AbortSignal): Promise<OptimizerResult> {
    const params = {
      ...DEFAULT_FULL_GRID_PARAMS,
      earlyN: input.eval.nEarly,
      finalN: input.eval.nFinal,
      ci95Threshold: input.eval.ci95Stop
    };
    
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

    const realMaxDistanceYards = input.eval.maxDistanceYards || (input.maxDistanceMeters / 0.9144);
    let bufferDistanceMeters = input.maxDistanceMeters; // This already includes 30-yard buffer
    
    console.log(`[FullGrid] Adaptive terrain-aware search starting with ${(bufferDistanceMeters / 0.9144).toFixed(0)} yards`);
    
    // Phase 1: Terrain sampling with feeler points (adaptive search boundary)
    try {
      const feelerStep = 5; // degrees
      const feelerPoints: Array<{ bearing: number; maxValidRadius: number }> = [];
      
      for (let bearing = 0; bearing < 360; bearing += feelerStep) {
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
      
      // Use conservative estimate but don't go below 70% of original radius
      const adaptiveRadius = Math.max(minValidRadius * 1.1, avgValidRadius * 0.9);
      bufferDistanceMeters = Math.min(bufferDistanceMeters, adaptiveRadius);
      
      console.log(`[FullGrid] Adaptive search: Avg valid radius ${(avgValidRadius/0.9144).toFixed(0)}y, min ${(minValidRadius/0.9144).toFixed(0)}y, using ${(bufferDistanceMeters/0.9144).toFixed(0)}y`);
      
    } catch (error) {
      console.warn(`[FullGrid] Adaptive search failed, using original buffer:`, error);
    }
    
    // Phase 2: Generate ALL candidates within adaptive buffer distance (no elevation filtering)
    const gridCandidates = this.generateGridCandidatesWithBuffer(input, params, toLL, bufferDistanceMeters);
    console.log(`[FullGrid] Generated ${gridCandidates.length} grid candidates within buffer`);
    
    // Phase 3: Evaluate ALL candidates with Expected Strokes (no elevation filtering yet)
    const evaluatedCandidates = await this.evaluateAllCandidates(
      gridCandidates, 
      input, 
      params, 
      signal,
      (progress) => {
        // Progress reporting would go here in a worker
        console.log(`[FullGrid] Evaluated ${Math.floor(progress * gridCandidates.length / 100)}/${gridCandidates.length} candidates`);
      }
    );
    
    if (signal.aborted) throw new Error('Optimization aborted');
    
    // Phase 4: Sort by Expected Strokes (best first)
    evaluatedCandidates.sort((a, b) => a.es - b.es);
    console.log(`[FullGrid] Sorted ${evaluatedCandidates.length} candidates by Expected Strokes`);
    
    // Phase 5: Return top candidates for main thread filtering
    // NOTE: Elevation filtering moved to main thread where Cesium is accessible
    console.log(`[FullGrid] Returning top 100 candidates for main thread elevation filtering`);
    
    return {
      candidates: evaluatedCandidates.slice(0, 100).map(c => ({ // Return top 100 for main thread filtering
        lon: c.lon,
        lat: c.lat,
        es: c.es,
        esCi95: c.esCi95
      })),
      evalCount: evaluatedCandidates.length,
      diagnostics: {
        gridSpacing: params.gridSpacingM,
        totalGridPoints: gridCandidates.length,
        evaluatedPoints: evaluatedCandidates.length,
        returnedForFiltering: Math.min(100, evaluatedCandidates.length)
      }
    };
  }

  /**
   * Generate grid candidates within buffer distance (no elevation filtering)
   */
  private generateGridCandidatesWithBuffer(
    input: OptimizerInput, 
    params: FullGridParameters,
    toLL: (xy: { x: number; y: number }) => LL,
    bufferDistanceMeters: number
  ): LL[] {
    const candidates: LL[] = [];
    const gridSpacing = params.gridSpacingM;
    
    // Calculate grid bounds
    const gridSize = Math.ceil(bufferDistanceMeters / gridSpacing);
    
    for (let x = -gridSize; x <= gridSize; x++) {
      for (let y = -gridSize; y <= gridSize; y++) {
        const xMeters = x * gridSpacing;
        const yMeters = y * gridSpacing;
        const distance = Math.sqrt(xMeters * xMeters + yMeters * yMeters);
        
        // Within buffer distance (surface distance only)
        if (distance <= bufferDistanceMeters) {
          const candidate = toLL({ x: xMeters, y: yMeters });
          
          // Basic validity check (no elevation filtering)
          if (this.isBasicValidCandidate(candidate, input, bufferDistanceMeters)) {
            candidates.push(candidate);
          }
        }
      }
    }
    
    return candidates;
  }


  /**
   * Evaluate aim point with progressive statistics and early exit
   * Uses same sampling as CesiumCanvas for consistency
   */
  private async evaluateAimPointProgressive(
    aim: LL, 
    input: OptimizerInput, 
    maxSamples: number,
    ci95Threshold: number,
    signal: AbortSignal
  ): Promise<{ es: number; ci95: number; conditionBreakdown?: Record<number, number> }> {
    const stats = new ProgressiveStats();
    const conditionBreakdown: Record<number, number> = {};
    
    // Calculate distance from start to aim point
    const distance = this.calculateDistance(input.start, aim) / 0.9144; // Convert to yards
    
    // Calculate ellipse parameters (same as CesiumCanvas/DispersionInspector)
    const distanceErrorPct = input.skill.distPct;
    const lateralErrorDeg = input.skill.offlineDeg;
    
    // Ellipse semi-axes calculations (same as ellipseAxes function)
    let a = distance * (distanceErrorPct / 100); // distance axis
    let b = distance * Math.tan(lateralErrorDeg * Math.PI / 180); // lateral axis
    
    // Apply roll condition multipliers to ellipse dimensions
    a = a * input.rollMultipliers.depthMultiplier;
    b = b * input.rollMultipliers.widthMultiplier;
    
    // Calculate bearing from start to aim (same as CesiumCanvas)
    const bearing = Math.atan2(
      (aim.lon - input.start.lon) * Math.cos((input.start.lat + aim.lat) / 2 * Math.PI / 180),
      aim.lat - input.start.lat
    );
    
    // Generate samples using SAME function as CesiumCanvas
    // Note: CesiumCanvas uses (semiMajor=lateral, semiMinor=distance) but ellipseAxes returns (a=distance, b=lateral)
    // So we swap them: semiMajor=b (lateral), semiMinor=a (distance)
    const samplePoints = generateEllipseSamples(maxSamples, b, a, bearing, aim, 1);
    
    // Create mock mask buffer for classification
    const mockMaskBuffer = {
      width: input.mask.width,
      height: input.mask.height,
      bbox: input.mask.bbox,
      data: input.mask.classes
    };
    
    // Evaluate each sample point
    for (let i = 0; i < maxSamples; i++) {
      if (signal.aborted) break;
      
      // Extract point coordinates from Float64Array
      const landingLon = samplePoints[i * 2];
      const landingLat = samplePoints[i * 2 + 1];
      
      // Classify landing point using same function as CesiumCanvas
      const classId = sampleRasterPixel(landingLon, landingLat, mockMaskBuffer);
      
      // Track condition breakdown for debugging
      conditionBreakdown[classId] = (conditionBreakdown[classId] || 0) + 1;
      
      // Convert to condition and calculate distance to pin
      const { condition, penalty } = this.classToCondition(classId);
      const distanceToPin = this.calculateDistance({ lon: landingLon, lat: landingLat }, input.pin) / 0.9144; // Convert to yards
      
      // Calculate expected strokes for this outcome
      const es = ES.calculate(distanceToPin, condition) + penalty;
      stats.add(es);
      
      // Early exit if CI is tight enough and we have enough samples
      if (i >= 50 && stats.getConfidenceInterval95() <= ci95Threshold) {
        console.log(`[FullGrid] Early exit at ${i + 1} samples, CI95=${stats.getConfidenceInterval95().toFixed(4)}`);
        break;
      }
    }
    
    return {
      es: stats.getMean(),
      ci95: stats.getConfidenceInterval95(),
      conditionBreakdown
    };
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private calculateDistance(p1: LL, p2: LL): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // meters
  }


  /**
   * Convert class ID to condition for ES calculation
   */
  private classToCondition(classId: number): { condition: 'green'|'fairway'|'rough'|'sand'|'recovery'|'water'; penalty: number } {
    switch (classId) {
      case 5: return { condition: 'green', penalty: 0 };
      case 6: return { condition: 'fairway', penalty: 0 };
      case 4: return { condition: 'sand', penalty: 0 }; // bunker
      case 2: return { condition: 'water', penalty: 0 };
      case 7: return { condition: 'recovery', penalty: 0 };
      case 1: return { condition: 'rough', penalty: 2 }; // OB
      case 3: return { condition: 'rough', penalty: 1 }; // hazard
      default: return { condition: 'rough', penalty: 0 }; // 0,8,9 -> rough
    }
  }

  /**
   * Basic validity check (no elevation filtering)
   */
  private isBasicValidCandidate(candidate: LL, input: OptimizerInput, bufferDistanceMeters: number): boolean {
    const surfaceDistance = this.calculateDistance(input.start, candidate);
    
    // Must be within buffer distance
    if (surfaceDistance > bufferDistanceMeters) {
      return false;
    }
    
    // Don't allow aims farther from pin than start (optional constraint)
    if (input.constraints?.disallowFartherThanPin) {
      const candidateToPinDist = this.calculateDistance(candidate, input.pin);
      const startToPinDist = this.calculateDistance(input.start, input.pin);
      if (candidateToPinDist > startToPinDist) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Evaluate all candidates with Expected Strokes (no elevation filtering)
   */
  private async evaluateAllCandidates(
    candidates: LL[],
    input: OptimizerInput,
    params: FullGridParameters,
    signal: AbortSignal,
    onProgress: (progress: number) => void
  ): Promise<Candidate[]> {
    const results: Candidate[] = [];
    
    for (let i = 0; i < candidates.length; i++) {
      if (signal.aborted) break;
      
      const candidate = candidates[i];
      const result = await this.evaluateAimPointProgressive(candidate, input, params.earlyN, params.ci95Threshold, signal);
      
      results.push({
        lon: candidate.lon,
        lat: candidate.lat,
        es: result.es,
        esCi95: result.ci95,
        conditionBreakdown: result.conditionBreakdown
      });
      
      // Update progress every 100 candidates
      if (i % 100 === 0) {
        const progress = ((i + 1) / candidates.length) * 100;
        onProgress(progress);
      }
    }
    
    return results;
  }

  /**
   * Filter candidates by plays-like distance using live elevation sampling
   */
  private async filterByPlaysLikeDistance(
    candidates: Candidate[],
    input: OptimizerInput,
    maxDistanceYards: number,
    signal: AbortSignal
  ): Promise<Candidate[]> {
    const validCandidates: Candidate[] = [];
    
    console.log(`[FullGrid] 🏔️ Checking top ${candidates.length} candidates with live elevation sampling:`);
    console.log(`[FullGrid] 📏 Max distance constraint: ${maxDistanceYards} yards plays-like`);
    
    for (let i = 0; i < candidates.length; i++) {
      if (signal.aborted) break;
      
      const candidate = candidates[i];
      const candidateLL = { lon: candidate.lon, lat: candidate.lat };
      
      // Calculate surface distance
      const surfaceDistanceMeters = this.calculateDistance(input.start, candidateLL);
      const surfaceDistanceYards = surfaceDistanceMeters / 0.9144;
      
      // Sample live elevation data (most accurate)
      const playsLikeDistance = await this.calculatePlaysLikeDistanceLive(input.start, candidateLL);
      const isValid = playsLikeDistance <= maxDistanceYards;
      
      // Log detailed results for top 100 (reduced verbosity)
      if (i < 10 || isValid) { // Only log top 10 or valid candidates
        console.log(`[FullGrid] #${(i+1).toString().padStart(3, ' ')}: ES=${candidate.es.toFixed(3)}, Surface=${surfaceDistanceYards.toFixed(1)}y, PlaysLike=${playsLikeDistance.toFixed(1)}y, Valid=${isValid ? '✅' : '❌'}`);
      }
      
      if (isValid) {
        validCandidates.push(candidate);
        
        // Stop once we have enough valid candidates
        if (validCandidates.length >= 8) {
          console.log(`[FullGrid] Found 8 valid candidates, stopping search`);
          break;
        }
      }
    }
    
    return validCandidates;
  }

  /**
   * Calculate plays-like distance using worker-to-main-thread communication
   */
  private async calculatePlaysLikeDistanceLive(start: LL, aim: LL): Promise<number> {
    try {
      // Request elevation data from main thread
      const elevationData = await this.requestElevationFromMainThread(start, aim);
      
      // Calculate surface distance
      const surfaceDistanceMeters = this.calculateDistance(start, aim);
      const surfaceDistanceYards = surfaceDistanceMeters / 0.9144;
      
      // If elevation sampling failed, return surface distance
      if (!elevationData || typeof elevationData.startElevation !== 'number' || typeof elevationData.aimElevation !== 'number') {
        console.log(`[FullGrid] Elevation sampling failed, using surface distance: ${surfaceDistanceYards.toFixed(1)}y`);
        return surfaceDistanceYards;
      }
      
      // Calculate elevation change and apply plays-like adjustment
      const elevationChangeMeters = elevationData.aimElevation - elevationData.startElevation;
      const elevationChangeYards = elevationChangeMeters * 1.09361; // meters to yards
      
      // Apply elevation adjustment: uphill adds distance, downhill subtracts
      const playsLikeYards = surfaceDistanceYards + elevationChangeYards;
      
      console.log(`[FullGrid] Elevation: Start=${elevationData.startElevation.toFixed(1)}m, Aim=${elevationData.aimElevation.toFixed(1)}m, Change=${elevationChangeYards.toFixed(1)}y, PlaysLike=${playsLikeYards.toFixed(1)}y vs Surface=${surfaceDistanceYards.toFixed(1)}y`);
      
      return playsLikeYards;
      
    } catch (error) {
      console.warn(`[FullGrid] Live elevation sampling failed:`, error);
      // Fallback to surface distance
      const surfaceDistanceMeters = this.calculateDistance(start, aim);
      return surfaceDistanceMeters / 0.9144;
    }
  }

  /**
   * Request elevation data from main thread via postMessage
   */
  private async requestElevationFromMainThread(start: LL, aim: LL): Promise<{ startElevation: number; aimElevation: number } | null> {
    // Check if we're in a worker environment
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).substring(7);
        
        // Set up listener for response
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'elevationResponse' && event.data.requestId === requestId) {
            self.removeEventListener('message', handleMessage);
            resolve(event.data.data);
          }
        };
        
        self.addEventListener('message', handleMessage);
        
        // Send request to main thread
        self.postMessage({
          type: 'elevationRequest',
          requestId,
          data: { start, aim }
        });
        
        // Timeout after 3 seconds
        setTimeout(() => {
          self.removeEventListener('message', handleMessage);
          console.warn(`[FullGrid] Elevation request timeout for ${requestId}`);
          resolve(null);
        }, 3000);
      });
    } else {
      // Running on main thread - this shouldn't happen for optimizers
      console.warn('[FullGrid] Not in worker environment, cannot request elevation');
      return null;
    }
  }

}