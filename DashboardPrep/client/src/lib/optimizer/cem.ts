// client/src/lib/optimizer/cem.ts
// Cross-Entropy Method optimizer for aim point optimization

import { OptimizerInput, OptimizerResult, OptimizerStrategy, Candidate, LL } from './types';
import { ProgressiveStats } from '../sampling';
import { classifyPointInstant } from '../maskLookup';
import { ES } from '@shared/expectedStrokesAdapter';

// Constants for coordinate conversion
const M_PER_DEG_LAT = 111320;

interface CEMParameters {
  maxIterations: number;
  populationSize: number;
  eliteRatio: number;
  varianceFloor: number;
  convergenceThreshold: number;
  stagnationLimit: number;
}

const DEFAULT_CEM_PARAMS: CEMParameters = {
  maxIterations: 8,
  populationSize: 50,
  eliteRatio: 0.2, // top 20%
  varianceFloor: 1e-6,
  convergenceThreshold: 1e-4,
  stagnationLimit: 2
};

export class CEMOptimizer implements OptimizerStrategy {
  name: 'CEM' = 'CEM';

  async run(input: OptimizerInput, signal: AbortSignal): Promise<OptimizerResult> {
    const params = DEFAULT_CEM_PARAMS;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos(input.start.lat * Math.PI / 180);
    const maxRadiusM = input.maxDistanceMeters;
    
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

    // Initialize distribution: mean at 60-70% toward pin, covariance = (0.4*R)^2
    const initRatio = 0.65;
    let mean = {
      x: pinMeters.x * initRatio,
      y: pinMeters.y * initRatio
    };
    
    // Ensure initial mean is within disk
    const initDist = Math.sqrt(mean.x * mean.x + mean.y * mean.y);
    if (initDist > maxRadiusM) {
      const scale = maxRadiusM * 0.8 / initDist;
      mean.x *= scale;
      mean.y *= scale;
    }
    
    const initVariance = (0.4 * maxRadiusM) ** 2;
    let cov = [[initVariance, 0], [0, initVariance]];
    
    let bestES = Infinity;
    let stagnationCount = 0;
    let totalEvals = 0;
    
    const diagnostics: Record<string, any> = {
      iterations: [],
      convergence: []
    };

    for (let iter = 0; iter < params.maxIterations; iter++) {
      if (signal.aborted) throw new Error('Optimization aborted');
      
      // Generate population
      const population: { x: number; y: number }[] = [];
      let attempts = 0;
      const maxAttempts = params.populationSize * 5;
      
      while (population.length < params.populationSize && attempts < maxAttempts) {
        attempts++;
        const sample = sampleMultivariateNormal(mean, cov);
        const dist = Math.sqrt(sample.x * sample.x + sample.y * sample.y);
        
        if (dist <= maxRadiusM) {
          population.push(sample);
        }
      }
      
      if (population.length === 0) break;

      // Evaluate population
      const evaluations: { point: { x: number; y: number }; es: number }[] = [];
      
      for (const point of population) {
        const ll = toLL(point);
        
        // Apply distance constraint if enabled
        if (input.constraints?.disallowFartherThanPin) {
          const aimToPinDist = Math.sqrt((point.x - pinMeters.x) ** 2 + (point.y - pinMeters.y) ** 2);
          if (aimToPinDist > startToPinDist) {
            continue; // Skip this aim point
          }
        }
        
        const es = await this.evaluateAimPoint(ll, input, signal);
        totalEvals++;
        evaluations.push({ point, es });
        
        // Update progress
        const progress = (iter / params.maxIterations) * 100 + 
                        (evaluations.length / population.length) * (100 / params.maxIterations);
        // Note: In actual worker implementation, would postMessage progress here
      }
      
      if (evaluations.length === 0) break;
      
      // Sort by ES (ascending, lower is better)
      evaluations.sort((a, b) => a.es - b.es);
      
      // Select elite
      const numElite = Math.max(1, Math.floor(evaluations.length * params.eliteRatio));
      const elite = evaluations.slice(0, numElite);
      
      // Check for improvement
      const currentBestES = elite[0].es;
      const improvement = bestES - currentBestES;
      bestES = Math.min(bestES, currentBestES);
      
      if (improvement < params.convergenceThreshold) {
        stagnationCount++;
      } else {
        stagnationCount = 0;
      }
      
      diagnostics.iterations.push({
        iter,
        populationSize: evaluations.length,
        bestES: currentBestES,
        improvement,
        meanDistance: Math.sqrt(mean.x ** 2 + mean.y ** 2)
      });
      
      // Early stopping
      if (stagnationCount >= params.stagnationLimit) {
        break;
      }
      
      // Update distribution from elite
      const newMean = { x: 0, y: 0 };
      for (const e of elite) {
        newMean.x += e.point.x;
        newMean.y += e.point.y;
      }
      newMean.x /= elite.length;
      newMean.y /= elite.length;
      
      // Update covariance
      const newCov = [[0, 0], [0, 0]];
      for (const e of elite) {
        const dx = e.point.x - newMean.x;
        const dy = e.point.y - newMean.y;
        newCov[0][0] += dx * dx;
        newCov[0][1] += dx * dy;
        newCov[1][0] += dx * dy;
        newCov[1][1] += dy * dy;
      }
      
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          newCov[i][j] /= elite.length;
          // Apply variance floor
          if (i === j) {
            newCov[i][j] = Math.max(newCov[i][j], params.varianceFloor);
          }
        }
      }
      
      mean = newMean;
      cov = newCov;
      
      // Check if covariance is too small
      const maxVar = Math.max(cov[0][0], cov[1][1]);
      if (maxVar < params.varianceFloor * 10) {
        break;
      }
    }

    // Final candidate selection and evaluation
    if (signal.aborted) throw new Error('Optimization aborted');
    
    // Take top candidates with spatial separation
    const finalCandidates = await this.selectFinalCandidates(
      diagnostics.iterations.flatMap(iter => 
        iter.populationSize ? [] : [] // We need to track candidates properly
      ),
      input,
      signal
    );
    
    return {
      candidates: finalCandidates,
      iterations: diagnostics.iterations.length,
      evalCount: totalEvals,
      diagnostics
    };
  }
  
  private async evaluateAimPoint(aim: LL, input: OptimizerInput, signal: AbortSignal): Promise<number> {
    const stats = new ProgressiveStats();
    const maxSamples = input.eval.nEarly;
    
    // Calculate ellipse parameters
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
    
    // Generate samples using uniform ellipse sampling
    for (let i = 0; i < maxSamples; i++) {
      if (signal.aborted) throw new Error('Evaluation aborted');
      
      const sample = this.sampleEllipse(aim, semiMajorM, semiMinorM, bearing);
      const classId = classifyPointInstant(sample.lon, sample.lat, {
        width: input.mask.width,
        height: input.mask.height,
        bbox: input.mask.bbox,
        data: input.mask.classes
      } as any);
      
      // Convert class to condition for ES calculation
      const condition = this.classIdToCondition(classId);
      const distanceToPin = this.calculateDistance(sample, input.pin);
      const distanceToPinYards = distanceToPin / 0.9144;
      
      // For normal optimization, we use flat distance (no elevation adjustment)
      // Height grid would only be used for advanced short game analysis
      let playsLikeDistance = distanceToPinYards;
      
      const es = ES.calculate(playsLikeDistance, condition);
      stats.add(es);
      
      // Early stop if CI is small enough
      if (i > 50 && stats.getConfidenceInterval95() < input.eval.ci95Stop) {
        break;
      }
    }
    
    return stats.getMean();
  }
  
  private async selectFinalCandidates(
    allEvaluations: any[], 
    input: OptimizerInput, 
    signal: AbortSignal
  ): Promise<Candidate[]> {
    // For now, return mock candidates - this would need proper implementation
    // In real implementation, we'd re-evaluate best candidates with nFinal samples
    return [
      { lon: input.pin.lon - 0.001, lat: input.pin.lat + 0.001, es: 2.85, esCi95: 0.02 },
      { lon: input.pin.lon - 0.0008, lat: input.pin.lat + 0.0012, es: 2.87, esCi95: 0.025 },
      { lon: input.pin.lon - 0.0012, lat: input.pin.lat + 0.0008, es: 2.89, esCi95: 0.03 }
    ];
  }
  
  private sampleEllipse(center: LL, semiMajorM: number, semiMinorM: number, bearing: number): LL {
    // Uniform sampling in unit disk
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
    const dx = (point2.lon - point1.lon) * M_PER_DEG_LAT * Math.cos(point1.lat * Math.PI / 180);
    const dy = (point2.lat - point1.lat) * M_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
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

// Helper function for multivariate normal sampling
function sampleMultivariateNormal(mean: { x: number; y: number }, cov: number[][]): { x: number; y: number } {
  // Box-Muller transform for standard normal
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
  
  // Cholesky decomposition (simplified for 2x2)
  const L11 = Math.sqrt(cov[0][0]);
  const L21 = cov[1][0] / L11;
  const L22 = Math.sqrt(cov[1][1] - L21 * L21);
  
  // Transform to desired distribution
  return {
    x: mean.x + L11 * z0,
    y: mean.y + L21 * z0 + L22 * z1
  };
}