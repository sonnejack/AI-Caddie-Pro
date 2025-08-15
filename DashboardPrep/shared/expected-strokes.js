// AI-Caddie Expected Strokes Calculation Engine
// Extracted from AI-Caddie project ai_caddie_golf_module.js with correct polynomial coefficients

class ExpectedStrokesEngine {
  constructor() {
    this.cache = new Map();
    this.CACHE_SIZE_LIMIT = 1000;
  }

  /**
   * Calculate expected strokes for a given distance and course condition
   * Uses 6th degree polynomial regression based on PGA Tour data
   */
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
        expectedStrokes = this.calculateFairwayStrokes(distanceYards); // No penalty for hitting tees
        break;
      default:
        expectedStrokes = this.calculateRoughStrokes(distanceYards); // Default to rough
    }

    // Cache the result
    this.cacheResult(cacheKey, expectedStrokes);
    
    return expectedStrokes;
  }

  /**
   * Calculate putting strokes (green condition)
   * Range: 0.33-33.39 yards
   */
  calculatePuttingStrokes(distance) {
    if (distance <= 0) return 1.0;
    if (distance < 0.333) return 1.001;
    if (distance > 33.39) return this.calculateFairwayStrokes(distance);

    // 6th degree polynomial for putting (correct coefficients from AI-Caddie)
    const coefficients = [
      8.22701978e-01, 3.48808959e-01, -4.45111801e-02, 
      3.05771434e-03, -1.12243654e-04, 2.09685358e-06, -1.57305673e-08
    ];

    return this.evaluatePolynomial(distance, coefficients);
  }

  /**
   * Calculate fairway strokes
   * Range: 7.43-348.9 yards with linear extrapolation beyond
   */
  calculateFairwayStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 7.43) {
      // Linear extrapolation from (0, 1) to first point
      const firstY = this.evaluatePolynomial(7.43, [
        1.87505684, 3.44179367e-02, -5.63306650e-04, 
        4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
      ]);
      const slope = (firstY - 1.0) / (7.43 - 0);
      return 1.0 + slope * distance;
    } else if (distance <= 348.9) {
      // 6th degree polynomial for fairway (correct coefficients from AI-Caddie)
      const coefficients = [
        1.87505684, 3.44179367e-02, -5.63306650e-04, 
        4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
      ];
      return this.evaluatePolynomial(distance, coefficients);
    } else {
      // Linear extrapolation from last point to (600, 5.25)
      const baseDistance = 348.9;
      const baseStrokes = this.evaluatePolynomial(baseDistance, [
        1.87505684, 3.44179367e-02, -5.63306650e-04, 
        4.70425536e-06, -2.02041273e-08, 4.38015739e-11, -3.78163505e-14
      ]);
      const slope = (5.25 - baseStrokes) / (600 - 348.9);
      return baseStrokes + (distance - baseDistance) * slope;
    }
  }

  /**
   * Calculate rough strokes
   * Range: 7.76-348.9 yards + penalty factors
   */
  calculateRoughStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 7.76) {
      // Linear extrapolation from (0, 1.5) to first point
      const firstY = this.evaluatePolynomial(7.76, [
        2.01325284, 3.73834464e-02, -6.08542541e-04, 
        5.01193038e-06, -2.08847962e-08, 4.32228049e-11, -3.53899274e-14
      ]);
      const slope = (firstY - 1.5) / (7.76 - 0);
      return 1.5 + slope * distance;
    } else if (distance <= 348.9) {
      // 6th degree polynomial for rough (correct coefficients from AI-Caddie)
      const coefficients = [
        2.01325284, 3.73834464e-02, -6.08542541e-04, 
        5.01193038e-06, -2.08847962e-08, 4.32228049e-11, -3.53899274e-14
      ];
      return this.evaluatePolynomial(distance, coefficients);
    } else {
      // Linear extrapolation from last point to (600, 5.4)
      const baseDistance = 348.9;
      const baseStrokes = this.evaluatePolynomial(baseDistance, [
        2.01325284, 3.73834464e-02, -6.08542541e-04, 
        5.01193038e-06, -2.08847962e-08, 4.32228049e-11, -3.53899274e-14
      ]);
      const slope = (5.4 - baseStrokes) / (600 - 348.9);
      return baseStrokes + (distance - baseDistance) * slope;
    }
  }

  /**
   * Calculate sand/bunker strokes
   * Range: 7.96-600 yards
   */
  calculateSandStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 7.96) {
      // Linear extrapolation from (0, 2) to first point
      const firstY = this.evaluatePolynomial(7.96, [
        2.14601649, 2.61044155e-02, -2.69537153e-04, 
        1.48010114e-06, -3.99813977e-09, 5.24740763e-12, -2.67577455e-15
      ]);
      const slope = (firstY - 2.0) / (7.96 - 0);
      return 2.0 + slope * distance;
    } else if (distance <= 600) {
      // 6th degree polynomial for sand (correct coefficients from AI-Caddie)
      const coefficients = [
        2.14601649, 2.61044155e-02, -2.69537153e-04, 
        1.48010114e-06, -3.99813977e-09, 5.24740763e-12, -2.67577455e-15
      ];
      return this.evaluatePolynomial(distance, coefficients);
    } else {
      // Linear extrapolation for very long bunker shots (use polynomial at 600)
      const baseDistance = 600;
      const baseStrokes = this.evaluatePolynomial(baseDistance, [
        2.14601649, 2.61044155e-02, -2.69537153e-04, 
        1.48010114e-06, -3.99813977e-09, 5.24740763e-12, -2.67577455e-15
      ]);
      const slope = 0.004; // Higher slope for sand
      return baseStrokes + (distance - baseDistance) * slope;
    }
  }

  /**
   * Calculate recovery strokes (trees/thick rough)
   * Range: 100-600 yards
   */
  calculateRecoveryStrokes(distance) {
    if (distance <= 0) return 1.0;

    if (distance < 100) {
      // Linear extrapolation from (0, 3) to first point
      const firstY = this.evaluatePolynomial(100, [
        1.34932958, 6.39685426e-02, -6.38754410e-04, 
        3.09148159e-06, -7.60396073e-09, 9.28546297e-12, -4.46945896e-15
      ]);
      const slope = (firstY - 3.0) / (100 - 0);
      return 3.0 + slope * distance;
    } else {
      // 6th degree polynomial for recovery (correct coefficients from AI-Caddie)
      const coefficients = [
        1.34932958, 6.39685426e-02, -6.38754410e-04, 
        3.09148159e-06, -7.60396073e-09, 9.28546297e-12, -4.46945896e-15
      ];
      return this.evaluatePolynomial(distance, coefficients);
    }
  }

  /**
   * Calculate water hazard strokes
   * Rough formula + 1 penalty stroke
   */
  calculateWaterStrokes(distance) {
    return this.calculateRoughStrokes(distance) + 1.0;
  }

  /**
   * Evaluate polynomial with given coefficients
   */
  evaluatePolynomial(x, coefficients) {
    let result = 0;
    for (let i = 0; i < coefficients.length; i++) {
      result += coefficients[i] * Math.pow(x, i);
    }
    return Math.max(1.0, result); // Minimum 1 stroke
  }

  /**
   * Cache management
   */
  cacheResult(key, value) {
    if (this.cache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      limit: this.CACHE_SIZE_LIMIT
    };
  }
}

// Export for ES modules
export default ExpectedStrokesEngine;

// Export for CommonJS (Node.js compatibility)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExpectedStrokesEngine;
}

// Make globally available (browser only)
if (typeof window !== 'undefined') {
  window.ExpectedStrokesEngine = ExpectedStrokesEngine;
}

console.log('Expected Strokes Engine loaded successfully');