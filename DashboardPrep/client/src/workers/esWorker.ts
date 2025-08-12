// Expected Strokes Worker - Progressive Monte Carlo with mask sampling
// Uses real expected-strokes.js engine via adapter

// Import the real expected strokes engine
// Since we're in a web worker, we need to import the ES engine differently
// We'll load it via importScripts and then create the adapter

let ExpectedStrokesEngineClass: any = null;

// Load the expected strokes engine
try {
  // Import the engine - in a worker we need to use importScripts or inline it
  // For now, we'll inline a reference to load it dynamically
  importScripts('/shared/expected-strokes.js');
  ExpectedStrokesEngineClass = (self as any).ExpectedStrokesEngine;
} catch (error) {
  console.warn('Could not load expected-strokes.js via importScripts, falling back to inline');
  
  // Fallback: inline the actual engine class from expected-strokes.js
  class ExpectedStrokesEngine {
    cache: Map<string, number>;
    CACHE_SIZE_LIMIT: number;
    
    constructor() {
      this.cache = new Map();
      this.CACHE_SIZE_LIMIT = 1000;
    }

    calculateExpectedStrokes(distanceYards: number, courseCondition = 'fairway'): number {
      const cacheKey = `${distanceYards}_${courseCondition}`;
      
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      let expectedStrokes: number;

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

    calculatePuttingStrokes(distance: number): number {
      if (distance <= 0) return 1.0;
      if (distance < 0.333) return 1.001;
      if (distance > 33.39) return this.calculateFairwayStrokes(distance);

      const coefficients = [
        8.22701978e-01, 3.48808959e-01, -4.45111801e-02, 
        3.05771434e-03, -1.12243654e-04, 2.09685358e-06, -1.57305673e-08
      ];

      return this.evaluatePolynomial(distance, coefficients);
    }

    calculateFairwayStrokes(distance: number): number {
      if (distance <= 0) return 1.0;

      if (distance < 7.43) {
        const firstY = this.evaluatePolynomial(7.43, [
          1.87505684, 3.44179367e-02, -5.63306650e-04, 
          4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
        ]);
        const slope = (firstY - 1.0) / (7.43 - 0) || 0;
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

    calculateRoughStrokes(distance: number): number {
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

    calculateSandStrokes(distance: number): number {
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

    calculateRecoveryStrokes(distance: number): number {
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

    calculateWaterStrokes(distance: number): number {
      return this.calculateRoughStrokes(distance) + 1.0;
    }

    evaluatePolynomial(x: number, coefficients: number[]): number {
      let result = 0;
      for (let i = 0; i < coefficients.length; i++) {
        result += coefficients[i] * Math.pow(x, i);
      }
      return Math.max(1.0, result);
    }

    cacheResult(key: string, value: number): void {
      if (this.cache.size >= this.CACHE_SIZE_LIMIT) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(key, value);
    }

    clearCache(): void {
      this.cache.clear();
    }

    getCacheStats(): { size: number; limit: number } {
      return {
        size: this.cache.size,
        limit: this.CACHE_SIZE_LIMIT
      };
    }
  }

  ExpectedStrokesEngineClass = ExpectedStrokesEngine;
}

// Create adapter (matches the shared/expectedStrokesAdapter.ts interface)
const strokesEngine = new ExpectedStrokesEngineClass();

const ES = {
  calculate(distanceYds: number, cond: "green"|"fairway"|"rough"|"sand"|"recovery"|"water"): number {
    return strokesEngine.calculateExpectedStrokes(distanceYds, cond);
  }
};

// Welford's online algorithm for running statistics
class WelfordStats {
  count = 0;
  mean = 0;
  m2 = 0;

  add(value: number) {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  get variance() {
    return this.count < 2 ? 0 : this.m2 / (this.count - 1);
  }

  get stddev() {
    return Math.sqrt(this.variance);
  }

  get ci95() {
    if (this.count < 2) return 0;
    const tValue = this.count < 30 ? 2.045 : 1.96; // Approximate t-distribution
    return (tValue * this.stddev) / Math.sqrt(this.count);
  }
}

// Mask buffer interface
interface MaskBuffer {
  width: number;
  height: number;
  bbox: { west: number; south: number; east: number; north: number; };
  data: Uint8ClampedArray;
}

type ClassId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface ESWorkerInput {
  pin: { lat: number; lon: number };
  points: Array<{ lat: number; lon: number }>;
  mask: MaskBuffer;
  minSamples: number;
  maxSamples: number;
  epsilon: number;
}

interface ESWorkerOutput {
  mean: number;
  ci95: number;
  n: number;
  pointsLL: Float64Array;   // [lon0,lat0, lon1,lat1, ...] length=2n
  distsYds: Float32Array;   // distance to pin per sample, length=n
  classes: Uint8Array;      // raster class per sample, length=n
}

// Remove old engine reference

// Sample class from mask
function sampleClassFromMask(lon: number, lat: number, mask: MaskBuffer): ClassId {
  const x = Math.floor(((lon - mask.bbox.west) / (mask.bbox.east - mask.bbox.west)) * mask.width);
  const y = Math.floor(((mask.bbox.north - lat) / (mask.bbox.north - mask.bbox.south)) * mask.height);
  
  const clampedX = Math.max(0, Math.min(mask.width - 1, x));
  const clampedY = Math.max(0, Math.min(mask.height - 1, y));
  
  const pixelIndex = (clampedY * mask.width + clampedX) * 4;
  const classId = mask.data[pixelIndex] as ClassId;
  
  return Math.max(0, Math.min(8, classId)) as ClassId;
}

// Map class to condition
function classToCondition(classId: ClassId): { condition: string; penalty: number; } {
  switch (classId) {
    case 1: return { condition: "rough", penalty: 2 }; // OB
    case 2: return { condition: "water", penalty: 0 }; // Water
    case 3: return { condition: "rough", penalty: 1 }; // Hazard
    case 4: return { condition: "sand", penalty: 0 }; // Bunker
    case 5: return { condition: "green", penalty: 0 }; // Green
    case 6: return { condition: "fairway", penalty: 0 }; // Fairway
    case 7: return { condition: "recovery", penalty: 0 }; // Recovery
    case 8: return { condition: "rough", penalty: 0 }; // Rough
    case 0: default: return { condition: "rough", penalty: 0 }; // Unknown
  }
}

// Calculate distance using equirectangular approximation
function calculateDistance(p1: { lat: number; lon: number }, p2: { lat: number; lon: number }): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + 
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.09361; // Convert to yards
}

self.addEventListener('message', (event: MessageEvent<ESWorkerInput>) => {
  const { pin, points, mask, minSamples, maxSamples, epsilon } = event.data;
  
  const stats = new WelfordStats();
  const resultPointsLL: number[] = [];
  const resultDistsYds: number[] = [];
  const resultClasses: number[] = [];
  
  try {
    // Process each point
    let processedCount = 0;
    for (let i = 0; i < points.length && i < maxSamples; i++) {
      const point = points[i];
      
      // Sample class from mask
      const classId = sampleClassFromMask(point.lon, point.lat, mask);
      
      // Map to condition and penalty  
      const { condition, penalty } = classToCondition(classId);
      
      // Calculate distance to pin in yards
      const distanceYards = calculateDistance(point, pin);
      
      // Calculate expected strokes using real ES engine
      const baseES = ES.calculate(distanceYards, condition as "green"|"fairway"|"rough"|"sand"|"recovery"|"water");
      const finalES = baseES + penalty;
      
      // Add to statistics
      stats.add(finalES);
      
      // Store sample data for return
      resultPointsLL.push(point.lon, point.lat);
      resultDistsYds.push(distanceYards);
      resultClasses.push(classId);
      
      processedCount++;
      
      // Check early stopping condition
      if (processedCount >= minSamples && stats.ci95 <= epsilon) {
        break;
      }
    }
    
    // Convert to typed arrays for efficient transfer
    const pointsLL = new Float64Array(resultPointsLL);
    const distsYds = new Float32Array(resultDistsYds);
    const classes = new Uint8Array(resultClasses);
    
    const result: ESWorkerOutput = {
      mean: stats.mean,
      ci95: stats.ci95,
      n: stats.count,
      pointsLL,
      distsYds,
      classes
    };
    
    // Transfer typed arrays for efficiency
    self.postMessage(result, [pointsLL.buffer, distsYds.buffer, classes.buffer]);
  } catch (error) {
    self.postMessage({ 
      error: `ES Worker error: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});