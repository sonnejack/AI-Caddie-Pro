// Enhanced Expected Strokes engine with short game modifier integration
// Extends the base Expected Strokes calculations with slope-based adjustments

import ExpectedStrokesEngine from './expected-strokes.js';
import type { LatLon } from './types';
import shortGameModifiers from './shortGameModifiers.json';

// Re-export types from short game system
export interface SlopeData {
  percentage: number;  // 0-25.5%
  direction: number;   // 0-360 degrees
}

export interface EnhancedMaskBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  bbox: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
  hasSlopeData: boolean;
}

export interface ShortGameModification {
  baseExpectedStrokes: number;
  shortGameModifier: number;
  enhancedExpectedStrokes: number;
  rationale: string;
  difficulty: number;
}

export type SlopeClassification = 'flat' | 'uphill' | 'downhill' | 'sidehill';
export type ElevationClassification = 'flat' | 'uphill' | 'downhill';
export type GreenCoverageCategory = 'shortsided' | 'standard' | 'lots';

export class EnhancedExpectedStrokesEngine {
  private baseEngine: ExpectedStrokesEngine;
  private cache: Map<string, number> = new Map();
  private readonly CACHE_SIZE_LIMIT = 2000;
  private readonly SHORT_GAME_DISTANCE_YARDS = 50;

  constructor() {
    this.baseEngine = new ExpectedStrokesEngine();
  }

  /**
   * Calculate expected strokes with optional short game enhancement
   */
  calculate(
    distanceYards: number,
    courseCondition: string,
    samplePoint?: LatLon,
    pinPoint?: LatLon,
    maskBuffer?: EnhancedMaskBuffer
  ): number {
    // For distances > 50 yards or when slope data unavailable, use base calculation
    if (distanceYards > this.SHORT_GAME_DISTANCE_YARDS || 
        !samplePoint || !pinPoint || !maskBuffer?.hasSlopeData) {
      return this.baseEngine.calculateExpectedStrokes(distanceYards, courseCondition);
    }

    // Generate cache key including slope context
    const cacheKey = this.generateShortGameCacheKey(
      distanceYards, 
      courseCondition, 
      samplePoint, 
      pinPoint
    );

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Calculate enhanced expected strokes with short game modifiers
    const result = this.calculateWithShortGameModifiers(
      distanceYards,
      courseCondition,
      samplePoint,
      pinPoint,
      maskBuffer
    );

    // Cache the result
    this.cacheResult(cacheKey, result.enhancedExpectedStrokes);
    
    return result.enhancedExpectedStrokes;
  }

  /**
   * Calculate expected strokes with detailed short game analysis
   */
  calculateWithShortGameModifiers(
    distanceYards: number,
    courseCondition: string,
    samplePoint: LatLon,
    pinPoint: LatLon,
    maskBuffer: EnhancedMaskBuffer
  ): ShortGameModification {
    // Get base expected strokes
    const baseExpectedStrokes = this.baseEngine.calculateExpectedStrokes(
      distanceYards, 
      courseCondition
    );

    // Get slope data at both points
    const sampleSlope = this.readSlopeFromMask(samplePoint.lon, samplePoint.lat, maskBuffer);
    const pinSlope = this.readSlopeFromMask(pinPoint.lon, pinPoint.lat, maskBuffer);

    if (!sampleSlope || !pinSlope) {
      return {
        baseExpectedStrokes,
        shortGameModifier: 0,
        enhancedExpectedStrokes: baseExpectedStrokes,
        rationale: 'No slope data available',
        difficulty: 5
      };
    }

    // Calculate shot bearing and classify slopes
    const shotBearing = this.calculateBearing(samplePoint, pinPoint);
    const slopeAtSample = this.classifySlope(sampleSlope, shotBearing);
    const slopeAtPin = this.classifySlope(pinSlope, shotBearing);
    const elevationChange = this.determineElevationChange(sampleSlope, pinSlope, shotBearing);

    // Calculate green coverage
    const greenCoverage = this.calculateGreenCoverage(
      samplePoint, 
      pinPoint, 
      maskBuffer
    );

    // Build modifier key and lookup
    const modifierKey = this.buildModifierKey(
      slopeAtSample,
      slopeAtPin,
      elevationChange,
      greenCoverage
    );

    const modifierData = this.lookupModifier(modifierKey);
    const enhancedExpectedStrokes = baseExpectedStrokes + modifierData.modifier;

    return {
      baseExpectedStrokes,
      shortGameModifier: modifierData.modifier,
      enhancedExpectedStrokes: Math.max(1.0, enhancedExpectedStrokes),
      rationale: modifierData.rationale,
      difficulty: modifierData.difficulty
    };
  }

  /**
   * Read slope data from enhanced mask buffer
   */
  private readSlopeFromMask(
    lon: number,
    lat: number,
    maskBuffer: EnhancedMaskBuffer
  ): SlopeData | null {
    if (!maskBuffer.hasSlopeData) return null;

    const x = Math.floor((lon - maskBuffer.bbox.west) / 
      (maskBuffer.bbox.east - maskBuffer.bbox.west) * maskBuffer.width);
    const y = Math.floor((maskBuffer.bbox.north - lat) / 
      (maskBuffer.bbox.north - maskBuffer.bbox.south) * maskBuffer.height);

    if (x < 0 || x >= maskBuffer.width || y < 0 || y >= maskBuffer.height) {
      return null;
    }

    const pixelIndex = (y * maskBuffer.width + x) * 4;
    const slopePercentage = maskBuffer.data[pixelIndex + 1] / 10; // G channel
    const slopeDirection = (maskBuffer.data[pixelIndex + 2] * 360) / 255; // B channel

    return {
      percentage: slopePercentage,
      direction: slopeDirection
    };
  }

  /**
   * Classify slope relative to shot direction
   */
  private classifySlope(slope: SlopeData, shotBearing: number): SlopeClassification {
    if (slope.percentage < 1) return 'flat';

    const angleDiff = this.normalizeAngleDifference(slope.direction - shotBearing);

    if (Math.abs(angleDiff) <= 45) {
      return 'uphill';
    } else if (Math.abs(angleDiff) >= 135) {
      return 'downhill';
    } else {
      return 'sidehill';
    }
  }

  /**
   * Determine elevation change classification
   */
  private determineElevationChange(
    sampleSlope: SlopeData,
    pinSlope: SlopeData,
    shotBearing: number
  ): ElevationClassification {
    const sampleRelative = this.classifySlope(sampleSlope, shotBearing);

    if (sampleRelative === 'uphill' && sampleSlope.percentage > 2) {
      return 'uphill';
    } else if (sampleRelative === 'downhill' && sampleSlope.percentage > 2) {
      return 'downhill';
    } else {
      return 'flat';
    }
  }

  /**
   * Calculate green coverage percentage along shot line
   */
  private calculateGreenCoverage(
    samplePoint: LatLon,
    pinPoint: LatLon,
    maskBuffer: EnhancedMaskBuffer
  ): GreenCoverageCategory {
    const totalDistance = this.calculateDistance(samplePoint, pinPoint);
    const numSamples = Math.max(1, Math.floor(totalDistance / 0.5)); // Sample every 0.5 yards

    let greenSamples = 0;

    for (let i = 0; i <= numSamples; i++) {
      const progress = i / numSamples;
      const lat = samplePoint.lat + (pinPoint.lat - samplePoint.lat) * progress;
      const lon = samplePoint.lon + (pinPoint.lon - samplePoint.lon) * progress;

      const classId = this.sampleClassAtPoint({ lat, lon }, maskBuffer);
      if (classId === 5) { // Class 5 = green
        greenSamples++;
      }
    }

    const percentage = (greenSamples / numSamples) * 100;

    if (percentage < 20) return 'shortsided';
    if (percentage <= 45) return 'standard';
    return 'lots';
  }

  /**
   * Sample class ID at a specific point
   */
  private sampleClassAtPoint(point: LatLon, maskBuffer: EnhancedMaskBuffer): number {
    const x = Math.floor((point.lon - maskBuffer.bbox.west) / 
      (maskBuffer.bbox.east - maskBuffer.bbox.west) * maskBuffer.width);
    const y = Math.floor((maskBuffer.bbox.north - point.lat) / 
      (maskBuffer.bbox.north - maskBuffer.bbox.south) * maskBuffer.height);

    if (x < 0 || x >= maskBuffer.width || y < 0 || y >= maskBuffer.height) {
      return 0;
    }

    const pixelIndex = (y * maskBuffer.width + x) * 4;
    return maskBuffer.data[pixelIndex]; // R channel = class ID
  }

  /**
   * Build modifier lookup key
   */
  private buildModifierKey(
    slopeAtSample: SlopeClassification,
    slopeAtPin: SlopeClassification,
    elevationChange: ElevationClassification,
    greenCoverage: GreenCoverageCategory
  ): string {
    const sampleKey = slopeAtSample === 'flat' ? 'flat' : ` ${slopeAtSample}`;
    const pinKey = slopeAtPin === 'flat' ? 'flat' : ` ${slopeAtPin}`;
    const elevationKey = elevationChange === 'flat' ? 'flat' : ` ${elevationChange}`;
    const coverageKey = this.coverageCategoryToKey(greenCoverage);

    return `${sampleKey}_${pinKey}_${elevationKey}_${coverageKey}`;
  }

  /**
   * Convert coverage category to lookup key format
   */
  private coverageCategoryToKey(category: GreenCoverageCategory): string {
    switch (category) {
      case 'shortsided': return '<20%';
      case 'standard': return '20-45%';
      case 'lots': return '>45%';
    }
  }

  /**
   * Look up modifier from JSON data
   */
  private lookupModifier(key: string): { modifier: number; difficulty: number; rationale: string } {
    const modifierData = (shortGameModifiers as any)[key];

    if (modifierData) {
      return {
        modifier: modifierData.modifier,
        difficulty: modifierData.difficulty,
        rationale: modifierData.rationale || ''
      };
    }

    // Fallback to base lookup with variations
    const fallbackKeys = this.generateKeyVariations(key);
    for (const fallbackKey of fallbackKeys) {
      const fallbackData = (shortGameModifiers as any)[fallbackKey];
      if (fallbackData) {
        return {
          modifier: fallbackData.modifier,
          difficulty: fallbackData.difficulty,
          rationale: fallbackData.rationale || ''
        };
      }
    }

    // Final fallback
    return { modifier: 0, difficulty: 5, rationale: 'No modifier data available' };
  }

  /**
   * Generate key variations for fallback lookups
   */
  private generateKeyVariations(originalKey: string): string[] {
    const parts = originalKey.split('_');
    if (parts.length !== 4) return [];

    const [sample, pin, elevation, coverage] = parts;

    return [
      `flat_${pin}_${elevation}_${coverage}`,
      `${sample}_flat_${elevation}_${coverage}`,
      `flat_flat_${elevation}_${coverage}`,
      `${sample}_${pin}_flat_${coverage}`,
      `${sample}_${pin}_${elevation}_20-45%`,
      `${sample}_${pin}_${elevation}_>45%`,
      'flat_flat_flat_>45%'
    ].filter(v => v !== originalKey);
  }

  /**
   * Calculate bearing between two points
   */
  private calculateBearing(from: LatLon, to: LatLon): number {
    const dLon = (to.lon - from.lon) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Calculate distance between two points in yards
   */
  private calculateDistance(p1: LatLon, p2: LatLon): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.09361; // Convert to yards
  }

  /**
   * Normalize angle difference to -180 to +180 range
   */
  private normalizeAngleDifference(angle: number): number {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  /**
   * Generate cache key for short game calculations
   */
  private generateShortGameCacheKey(
    distance: number,
    condition: string,
    sample: LatLon,
    pin: LatLon
  ): string {
    // Round coordinates to reasonable precision
    const sLat = Math.round(sample.lat * 100000) / 100000;
    const sLon = Math.round(sample.lon * 100000) / 100000;
    const pLat = Math.round(pin.lat * 100000) / 100000;
    const pLon = Math.round(pin.lon * 100000) / 100000;
    const dist = Math.round(distance * 10) / 10;

    return `sg_${dist}_${condition}_${sLat},${sLon}_${pLat},${pLon}`;
  }

  /**
   * Cache management
   */
  private cacheResult(key: string, value: number): void {
    if (this.cache.size >= this.CACHE_SIZE_LIMIT) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.baseEngine.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { enhanced: number; base: any; limit: number } {
    return {
      enhanced: this.cache.size,
      base: this.baseEngine.getCacheStats(),
      limit: this.CACHE_SIZE_LIMIT
    };
  }
}

// Export for easy usage
export const enhancedES = new EnhancedExpectedStrokesEngine();