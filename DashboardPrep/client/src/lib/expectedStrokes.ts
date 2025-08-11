import { ClassId } from './types';

// Expected Strokes Engine - Preserve as black box as specified
export class ExpectedStrokesEngine {
  private cache: Map<string, number> = new Map();

  // Condition mapping: mask class ID -> engine condition
  private mapCondition(classId: ClassId): string {
    switch (classId) {
      case 0: return 'rough'; // unknown -> rough
      case 1: return 'rough'; // OB -> rough + 2 (handled by penalty)
      case 2: return 'water'; // water (engine adds +1)
      case 3: return 'rough'; // hazard -> rough + 1 (handled by penalty)
      case 4: return 'sand';  // bunker -> sand
      case 5: return 'green'; // green
      case 6: return 'fairway'; // fairway
      case 7: return 'recovery'; // recovery
      case 8: return 'rough'; // rough
      default: return 'rough';
    }
  }

  private getPenalty(classId: ClassId): number {
    switch (classId) {
      case 1: return 2; // OB
      case 3: return 1; // Hazard
      default: return 0;
    }
  }

  // Core calculation method - keep as black box
  calculateExpectedStrokes(distanceYards: number, condition: string): number {
    const cacheKey = `${distanceYards}-${condition}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let expectedStrokes: number;

    switch (condition) {
      case 'green':
        // Putting 6th-degree polynomial with range guards
        if (distanceYards <= 50) {
          const d = distanceYards;
          expectedStrokes = 1.0 + 
            0.0234 * d +
            -0.00078 * d * d +
            0.000014 * d * d * d +
            -0.00000012 * d * d * d * d +
            0.0000000005 * d * d * d * d * d +
            -0.000000000001 * d * d * d * d * d * d;
        } else {
          expectedStrokes = 3.2; // Linear extrapolation guard
        }
        break;

      case 'fairway':
        // Fairway 6th-degree + linear tails
        if (distanceYards <= 300) {
          const d = distanceYards;
          expectedStrokes = 2.1 +
            0.0089 * d +
            -0.000034 * d * d +
            0.00000008 * d * d * d +
            -0.00000000009 * d * d * d * d +
            0.00000000000005 * d * d * d * d * d +
            -0.000000000000000012 * d * d * d * d * d * d;
        } else {
          // Linear tail
          expectedStrokes = 3.8 + (distanceYards - 300) * 0.002;
        }
        break;

      case 'sand':
        // Bunker poly + tail slope
        if (distanceYards <= 200) {
          const d = distanceYards;
          expectedStrokes = 2.8 +
            0.012 * d +
            -0.000045 * d * d +
            0.00000012 * d * d * d;
        } else {
          expectedStrokes = 4.2 + (distanceYards - 200) * 0.003;
        }
        break;

      case 'recovery':
        if (distanceYards <= 250) {
          const d = distanceYards;
          expectedStrokes = 2.5 +
            0.011 * d +
            -0.000038 * d * d +
            0.0000001 * d * d * d;
        } else {
          expectedStrokes = 4.0 + (distanceYards - 250) * 0.0025;
        }
        break;

      case 'rough':
        if (distanceYards <= 280) {
          const d = distanceYards;
          expectedStrokes = 2.3 +
            0.010 * d +
            -0.000032 * d * d +
            0.000000085 * d * d * d;
        } else {
          expectedStrokes = 3.9 + (distanceYards - 280) * 0.0028;
        }
        break;

      case 'water':
        // Water = rough + 1 (engine adds penalty)
        expectedStrokes = this.calculateExpectedStrokes(distanceYards, 'rough') + 1;
        break;

      default:
        expectedStrokes = this.calculateExpectedStrokes(distanceYards, 'rough');
    }

    // Cache and return
    this.cache.set(cacheKey, expectedStrokes);
    return Math.max(1.0, expectedStrokes); // Ensure minimum 1 stroke
  }

  // Public method for mask-based calculations
  calculateExpectedStrokesFromMask(distanceYards: number, classId: ClassId): number {
    const condition = this.mapCondition(classId);
    const baseES = this.calculateExpectedStrokes(distanceYards, condition);
    const penalty = this.getPenalty(classId);
    return baseES + penalty;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// Global instance
export const strokesEngine = new ExpectedStrokesEngine();
