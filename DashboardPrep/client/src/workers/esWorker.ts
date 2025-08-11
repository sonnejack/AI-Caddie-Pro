// Expected Strokes Worker - Progressive Monte Carlo with mask sampling

// Inline the expected strokes engine (simplified version for worker)
class ExpectedStrokesEngine {
  calculateExpectedStrokes(distanceYards: number, courseCondition = 'fairway'): number {
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
      default:
        expectedStrokes = this.calculateRoughStrokes(distanceYards);
    }

    return Math.max(0.5, expectedStrokes);
  }

  private calculatePuttingStrokes(distance: number): number {
    const d = Math.max(0, distance);
    return 1.0 + (d * 0.0015) + (d * d * 0.000008);
  }

  private calculateFairwayStrokes(distance: number): number {
    const d = Math.max(0, distance);
    const coeffs = [2.89, -0.0012, 0.0000085, -0.000000025, 0.000000000032, -0.00000000000002, 0.000000000000000004];
    return this.polynomial(d, coeffs);
  }

  private calculateRoughStrokes(distance: number): number {
    const fairway = this.calculateFairwayStrokes(distance);
    return fairway + 0.15;
  }

  private calculateSandStrokes(distance: number): number {
    const fairway = this.calculateFairwayStrokes(distance);
    return fairway + 0.25;
  }

  private calculateWaterStrokes(distance: number): number {
    const fairway = this.calculateFairwayStrokes(distance);
    return fairway + 1.0;
  }

  private calculateRecoveryStrokes(distance: number): number {
    const fairway = this.calculateFairwayStrokes(distance);
    return fairway + 0.35;
  }

  private polynomial(x: number, coeffs: number[]): number {
    let result = 0;
    for (let i = 0; i < coeffs.length; i++) {
      result += coeffs[i] * Math.pow(x, i);
    }
    return result;
  }
}

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
  countsByClass: Record<number, number>;
}

const engine = new ExpectedStrokesEngine();

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
  const classCounts: Record<number, number> = {};
  
  try {
    // Process each point
    for (let i = 0; i < points.length && i < maxSamples; i++) {
      const point = points[i];
      
      // Sample class from mask
      const classId = sampleClassFromMask(point.lon, point.lat, mask);
      classCounts[classId] = (classCounts[classId] || 0) + 1;
      
      // Map to condition and penalty
      const { condition, penalty } = classToCondition(classId);
      
      // Calculate distance to pin
      const distanceYards = calculateDistance(point, pin);
      
      // Calculate expected strokes
      const baseES = engine.calculateExpectedStrokes(distanceYards, condition);
      const finalES = baseES + penalty;
      
      stats.add(finalES);
      
      // Check early stopping condition
      if (i >= minSamples && stats.ci95 <= epsilon) {
        break;
      }
    }
    
    const result: ESWorkerOutput = {
      mean: stats.mean,
      ci95: stats.ci95,
      n: stats.count,
      countsByClass: classCounts
    };
    
    self.postMessage(result);
  } catch (error) {
    self.postMessage({ 
      error: `ES Worker error: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});