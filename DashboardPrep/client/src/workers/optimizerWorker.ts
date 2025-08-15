// client/src/workers/optimizerWorker.ts
// Optimizer worker that runs pluggable optimization strategies
// Uses importScripts pattern similar to esWorker.ts

// Embedded Expected Strokes Engine (real AI-Caddie polynomials)
class ExpectedStrokesEngine {
  constructor() {
    this.cache = new Map();
    this.CACHE_SIZE_LIMIT = 1000;
  }

  calculateExpectedStrokes(distanceYards, courseCondition = 'fairway') {
    const cacheKey = `${distanceYards}_${courseCondition}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let expectedStrokes;

    switch (courseCondition.toLowerCase()) {
      case 'green':
        expectedStrokes = this.calculatePuttingStrokes(distanceYards);
        break;
      case 'fairway':
        expectedStrokes = this.calculateFairwayStrokes(distanceYards);
        break;
      case 'rough':
        expectedStrokes = this.calculateRoughStrokes(distanceYards);
        break;
      case 'sand':
      case 'bunker':
        expectedStrokes = this.calculateSandStrokes(distanceYards);
        break;
      case 'water':
        expectedStrokes = this.calculateWaterStrokes(distanceYards);
        break;
      case 'recovery':
        expectedStrokes = this.calculateRecoveryStrokes(distanceYards);
        break;
      case 'tee':
        expectedStrokes = this.calculateFairwayStrokes(distanceYards);
        break;
      default:
        expectedStrokes = this.calculateRoughStrokes(distanceYards);
    }

    this.cacheResult(cacheKey, expectedStrokes);
    return expectedStrokes;
  }

  calculatePuttingStrokes(distance) {
    if (distance <= 0) return 1.0;
    if (distance < 0.333) return 1.001;
    if (distance > 33.39) return this.calculateFairwayStrokes(distance);

    const coefficients = [
      8.22701978e-01, 3.48808959e-01, -4.45111801e-02, 
      3.05771434e-03, -1.12243654e-04, 2.09685358e-06, -1.57305673e-08
    ];

    return this.evaluatePolynomial(distance, coefficients);
  }

  calculateFairwayStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 7.43) {
      const firstY = this.evaluatePolynomial(7.43, [
        1.87505684, 3.44179367e-02, -5.63306650e-04, 
        4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
      ]);
      const slope = (firstY - 1.0) / (7.43 - 0);
      return 1.0 + slope * distance;
    } else if (distance <= 348.9) {
      const coefficients = [
        1.87505684, 3.44179367e-02, -5.63306650e-04, 
        4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
      ];
      return this.evaluatePolynomial(distance, coefficients);
    } else {
      const baseDistance = 348.9;
      const baseStrokes = this.evaluatePolynomial(baseDistance, [
        1.87505684, 3.44179367e-02, -5.63306650e-04, 
        4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
      ]);
      const slope = (5.25 - baseStrokes) / (600 - 348.9);
      return baseStrokes + (distance - baseDistance) * slope;
    }
  }

  calculateRoughStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 7.76) {
      const firstY = this.evaluatePolynomial(7.76, [
        2.01325284, 3.73834464e-02, -6.08542541e-04, 
        5.01193038e-06, -2.08847962e-08, 4.32228049e-11, -3.53899274e-14
      ]);
      const slope = (firstY - 1.5) / (7.76 - 0);
      return 1.5 + slope * distance;
    } else if (distance <= 348.9) {
      const coefficients = [
        2.01325284, 3.73834464e-02, -6.08542541e-04, 
        5.01193038e-06, -2.08847962e-08, 4.32228049e-11, -3.53899274e-14
      ];
      return this.evaluatePolynomial(distance, coefficients);
    } else {
      const baseDistance = 348.9;
      const baseStrokes = this.evaluatePolynomial(baseDistance, [
        2.01325284, 3.73834464e-02, -6.08542541e-04, 
        5.01193038e-06, -2.08847962e-08, 4.32228049e-11, -3.53899274e-14
      ]);
      const slope = (5.4 - baseStrokes) / (600 - 348.9);
      return baseStrokes + (distance - baseDistance) * slope;
    }
  }

  calculateSandStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 7.96) {
      const firstY = this.evaluatePolynomial(7.96, [
        2.14601649, 2.61044155e-02, -2.69537153e-04, 
        1.48010114e-06, -3.99813977e-09, 5.24740763e-12, -2.67577455e-15
      ]);
      const slope = (firstY - 2.0) / (7.96 - 0);
      return 2.0 + slope * distance;
    } else if (distance <= 600) {
      const coefficients = [
        2.14601649, 2.61044155e-02, -2.69537153e-04, 
        1.48010114e-06, -3.99813977e-09, 5.24740763e-12, -2.67577455e-15
      ];
      return this.evaluatePolynomial(distance, coefficients);
    } else {
      const baseDistance = 600;
      const baseStrokes = this.evaluatePolynomial(baseDistance, [
        2.14601649, 2.61044155e-02, -2.69537153e-04, 
        1.48010114e-06, -3.99813977e-09, 5.24740763e-12, -2.67577455e-15
      ]);
      const slope = 0.004;
      return baseStrokes + (distance - baseDistance) * slope;
    }
  }

  calculateRecoveryStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 100) {
      const firstY = this.evaluatePolynomial(100, [
        1.34932958, 6.39685426e-02, -6.38754410e-04, 
        3.09148159e-06, -7.60396073e-09, 9.28546297e-12, -4.46945896e-15
      ]);
      const slope = (firstY - 3.0) / (100 - 0);
      return 3.0 + slope * distance;
    } else {
      const coefficients = [
        1.34932958, 6.39685426e-02, -6.38754410e-04, 
        3.09148159e-06, -7.60396073e-09, 9.28546297e-12, -4.46945896e-15
      ];
      return this.evaluatePolynomial(distance, coefficients);
    }
  }

  calculateWaterStrokes(distance) {
    return this.calculateRoughStrokes(distance) + 1.0;
  }

  evaluatePolynomial(x, coefficients) {
    let result = 0;
    for (let i = 0; i < coefficients.length; i++) {
      result += coefficients[i] * Math.pow(x, i);
    }
    return Math.max(1.0, result);
  }

  cacheResult(key, value) {
    if (this.cache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const ExpectedStrokesEngineClass = ExpectedStrokesEngine;

// Create engine instance
const strokesEngine = new ExpectedStrokesEngineClass();

// ES adapter
const ES = {
  calculate(distanceYds: number, cond: string): number {
    return strokesEngine.calculateExpectedStrokes(distanceYds, cond);
  }
};

// Message types
type OptimizeMsg =
  | { type: 'run', strategy: 'CEM'|'RingGrid', input: OptimizerInput }
  | { type: 'cancel' };

type ProgressMsg = { type:'progress', pct:number, note?:string };
type DoneMsg = { type:'done', result: OptimizerResult };
type ErrorMsg = { type:'error', error:string };

// Optimizer types (inlined to avoid import issues)
interface LL { lon: number; lat: number; }
interface Skill { offlineDeg: number; distPct: number; }
interface OptimizerInput {
  start: LL;
  pin: LL;
  maxDistanceMeters: number;
  skill: Skill;
  mask: {
    width: number;
    height: number;
    bbox: { west: number; south: number; east: number; north: number };
    classes: Uint8ClampedArray;
  };
  heightGrid?: any;
  eval: {
    nEarly: number;
    nFinal: number;
    ci95Stop: number;
  };
  constraints?: {
    disallowFartherThanPin?: boolean;
    minSeparationMeters?: number;
  };
}

interface Candidate {
  lon: number;
  lat: number;
  es: number;
  esCi95?: number;
}

interface OptimizerResult {
  candidates: Candidate[];
  iterations?: number;
  evalCount?: number;
  diagnostics?: Record<string, any>;
}

// Progressive stats (inlined)
class ProgressiveStats {
  private count = 0;
  private mean = 0;
  private m2 = 0;

  add(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  getMean(): number {
    return this.mean;
  }

  getVariance(): number {
    return this.count < 2 ? 0 : this.m2 / (this.count - 1);
  }

  getStandardError(): number {
    return Math.sqrt(this.getVariance() / this.count);
  }

  getConfidenceInterval95(): number {
    return 1.96 * this.getStandardError();
  }

  reset(): void {
    this.count = 0;
    this.mean = 0;
    this.m2 = 0;
  }
}

// Utility functions
function classifyPointInstant(lon: number, lat: number, mask: OptimizerInput['mask']): number {
  // Calculate pixel coordinates
  const x = Math.floor(((lon - mask.bbox.west) / (mask.bbox.east - mask.bbox.west)) * mask.width);
  const y = Math.floor(((mask.bbox.north - lat) / (mask.bbox.north - mask.bbox.south)) * mask.height);
  
  // Clamp to bounds
  const clampedX = Math.max(0, Math.min(mask.width - 1, x));
  const clampedY = Math.max(0, Math.min(mask.height - 1, y));
  
  // Get pixel data (red channel contains class)
  const pixelIndex = (clampedY * mask.width + clampedX) * 4;
  let classId = mask.classes[pixelIndex];
  
  // Handle in-between colors by rounding to nearest valid class
  if (classId > 0 && classId < 255) {
    const validClasses = [0,1,2,3,4,5,6,7,8,9];
    classId = validClasses.reduce((prev, curr) => 
      Math.abs(curr - classId) < Math.abs(prev - classId) ? curr : prev
    );
  }
  
  // Return class, defaulting to 8 (rough) for unknown/transparent
  return classId === 0 ? 8 : Math.max(0, Math.min(9, classId));
}

function calculateDistance(point1: LL, point2: LL): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lon - point1.lon) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + 
           Math.cos(point1.lat * Math.PI/180) * Math.cos(point2.lat * Math.PI/180) * 
           Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // meters
}

function classIdToCondition(classId: number): 'green'|'fairway'|'rough'|'sand'|'recovery'|'water' {
  switch (classId) {
    case 5: return 'green';
    case 6: return 'fairway';
    case 4: return 'sand'; // bunker
    case 2: return 'water';
    case 7: return 'recovery';
    default: return 'rough'; // 0,1,3,8,9 -> rough
  }
}

// Simple CEM implementation
async function runCEMOptimization(input: OptimizerInput, signal: AbortSignal): Promise<OptimizerResult> {
  const M_PER_DEG_LAT = 111320;
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

  // Initialize distribution: mean at 65% toward pin
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
  
  const maxIterations = 6;
  const populationSize = 40;
  const eliteRatio = 0.2;
  const varianceFloor = 1e-6;
  
  let totalEvals = 0;
  const allCandidates: { ll: LL; es: number }[] = [];
  
  for (let iter = 0; iter < maxIterations; iter++) {
    if (signal.aborted) throw new Error('Optimization aborted');
    
    // Generate population
    const population: { x: number; y: number }[] = [];
    let attempts = 0;
    const maxAttempts = populationSize * 3;
    
    while (population.length < populationSize && attempts < maxAttempts) {
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
      if (signal.aborted) throw new Error('Optimization aborted');
      
      const ll = toLL(point);
      
      // Apply distance constraint if enabled
      if (input.constraints?.disallowFartherThanPin) {
        const aimToPinDist = Math.sqrt((point.x - pinMeters.x) ** 2 + (point.y - pinMeters.y) ** 2);
        if (aimToPinDist > startToPinDist) {
          continue; // Skip this aim point
        }
      }
      
      const es = await evaluateAimPoint(ll, input, signal);
      totalEvals++;
      evaluations.push({ point, es });
      allCandidates.push({ ll, es });
      
      // Update progress
      const progress = (iter / maxIterations) * 80 + 
                      (evaluations.length / population.length) * (80 / maxIterations);
      const progressMsg: ProgressMsg = {
        type: 'progress',
        pct: progress,
        note: `CEM iteration ${iter + 1}/${maxIterations}, evaluated ${evaluations.length}/${population.length}`
      };
      self.postMessage(progressMsg);
    }
    
    if (evaluations.length === 0) break;
    
    // Sort by ES (ascending, lower is better)
    evaluations.sort((a, b) => a.es - b.es);
    
    // Select elite
    const numElite = Math.max(1, Math.floor(evaluations.length * eliteRatio));
    const elite = evaluations.slice(0, numElite);
    
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
        if (i === j) {
          newCov[i][j] = Math.max(newCov[i][j], varianceFloor);
        }
      }
    }
    
    mean = newMean;
    cov = newCov;
    
    // Check if covariance is too small
    const maxVar = Math.max(cov[0][0], cov[1][1]);
    if (maxVar < varianceFloor * 10) {
      break;
    }
  }

  // Select final candidates with spatial separation
  const progressMsg: ProgressMsg = {
    type: 'progress',
    pct: 90,
    note: 'Selecting final candidates...'
  };
  self.postMessage(progressMsg);

  // Sort all candidates by ES
  allCandidates.sort((a, b) => a.es - b.es);
  
  // Select top candidates with spatial separation
  const finalCandidates: Candidate[] = [];
  const minSeparationM = input.constraints?.minSeparationMeters || 2.74;
  
  for (const candidate of allCandidates) {
    if (finalCandidates.length >= 8) break; // Max 8 candidates
    
    // Check separation from existing candidates
    let tooClose = false;
    for (const existing of finalCandidates) {
      const dist = calculateDistance(candidate.ll, { lon: existing.lon, lat: existing.lat });
      if (dist < minSeparationM) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      finalCandidates.push({
        lon: candidate.ll.lon,
        lat: candidate.ll.lat,
        es: candidate.es,
        esCi95: 0.025 // Mock CI for now
      });
    }
  }
  
  return {
    candidates: finalCandidates,
    iterations: maxIterations,
    evalCount: totalEvals,
    diagnostics: { totalCandidatesEvaluated: allCandidates.length }
  };
}

async function evaluateAimPoint(aim: LL, input: OptimizerInput, signal: AbortSignal): Promise<number> {
  const stats = new ProgressiveStats();
  const conditionCounts = {
    green: 0, fairway: 0, rough: 0, sand: 0, recovery: 0, water: 0, ob: 0, hazard: 0, tee: 0, unknown: 0
  };
  const maxSamples = Math.min(input.eval.nEarly, 100); // Keep it fast for demo
  
  // Calculate ellipse parameters
  const aimToStart = {
    x: (input.start.lon - aim.lon) * 111320 * Math.cos(aim.lat * Math.PI / 180),
    y: (input.start.lat - aim.lat) * 111320
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
    
    const sample = sampleEllipse(aim, semiMajorM, semiMinorM, bearing);
    const classId = classifyPointInstant(sample.lon, sample.lat, input.mask);
    
    // Convert class to condition for ES calculation
    const condition = classIdToCondition(classId);
    const conditionName = getConditionName(classId);
    conditionCounts[conditionName]++;
    
    const distanceToPin = calculateDistance(sample, input.pin);
    const distanceToPinYards = distanceToPin / 0.9144;
    
    const es = ES.calculate(distanceToPinYards, condition);
    stats.add(es);
    
    // Early stop if CI is small enough
    if (i > 30 && stats.getConfidenceInterval95() < input.eval.ci95Stop) {
      break;
    }
  }
  
  return stats.getMean();
}

function getConditionName(classId: number): 'green'|'fairway'|'rough'|'sand'|'recovery'|'water'|'ob'|'hazard'|'tee'|'unknown' {
  switch (classId) {
    case 5: return 'green';
    case 6: return 'fairway';
    case 4: return 'sand'; // bunker
    case 2: return 'water';
    case 7: return 'recovery';
    case 1: return 'ob';
    case 3: return 'hazard';
    case 9: return 'tee';
    case 8: return 'rough';
    default: return 'unknown'; // class 0
  }
}

function sampleEllipse(center: LL, semiMajorM: number, semiMinorM: number, bearing: number): LL {
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
  const mPerDegLon = 111320 * Math.cos(center.lat * Math.PI / 180);
  return {
    lon: center.lon + x_rot / mPerDegLon,
    lat: center.lat + y_rot / 111320
  };
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

// Worker state
let currentAbortController: AbortController | null = null;

// Worker message handler
self.onmessage = async function(e: MessageEvent<OptimizeMsg>) {
  const { type, strategy, input } = e.data;
  console.log('🎯 Worker received message:', type, strategy);

  try {
    switch (type) {
      case 'run':
        console.log('🎯 Worker starting optimization with strategy:', strategy);
        // Cancel any running optimization
        if (currentAbortController) {
          currentAbortController.abort();
        }
        
        currentAbortController = new AbortController();
        
        let result: OptimizerResult;
        
        if (strategy === 'RingGrid') {
          // Use the new Ring Grid optimizer implementation
          const { RingGridOptimizer } = await import('../lib/optimizer/ringGrid');
          const optimizer = new RingGridOptimizer();
          result = await optimizer.run(input, currentAbortController.signal);
        } else {
          // Use existing CEM optimizer
          result = await runCEMOptimization(input, currentAbortController.signal);
        }
        
        if (!currentAbortController.signal.aborted) {
          const progressMsg: ProgressMsg = {
            type: 'progress',
            pct: 100,
            note: 'Optimization complete'
          };
          self.postMessage(progressMsg);

          console.log('🎯 Worker: Optimization completed, sending result:', result);
          console.log('🎯 Worker: Candidates:', result.candidates);
          
          const doneMsg: DoneMsg = {
            type: 'done',
            result
          };
          self.postMessage(doneMsg);
        }
        break;

      case 'cancel':
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    const errorMsg: ErrorMsg = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    self.postMessage(errorMsg);
  } finally {
    if (currentAbortController && !currentAbortController.signal.aborted) {
      currentAbortController = null;
    }
  }
};

export {};