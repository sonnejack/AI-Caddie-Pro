// client/src/lib/shortGameEngine.ts
// Advanced short game engine with slope-based modifier lookup integration

import type { LatLon } from '@shared/types';
import type { EnhancedMaskBuffer, SlopeData } from './slopeCalculator';
import type { GreenCoverageResult } from './greenCoverage';
import { readSlopeFromMask } from './slopeCalculator';
import { calculateGreenCoverage, coverageCategoryToKey } from './greenCoverage';
import shortGameModifiers from '../../shared/shortGameModifiers.json';

export interface ShortGameAnalysis {
  slopeAtSample: SlopeClassification;
  slopeAtPin: SlopeClassification;
  elevationChange: ElevationClassification;
  greenCoverage: GreenCoverageResult;
  modifierKey: string;
  modifier: number;
  difficulty: number;
  rationale: string;
}

export type SlopeClassification = 'flat' | 'uphill' | 'downhill' | 'sidehill';
export type ElevationClassification = 'flat' | 'uphill' | 'downhill';

/**
 * Perform complete short game analysis for a sample point
 */
export function analyzeShortGame(
  samplePoint: LatLon,
  pinPoint: LatLon,
  maskBuffer: EnhancedMaskBuffer
): ShortGameAnalysis | null {
  if (!maskBuffer.hasSlopeData) {
    console.warn('⚠️ No slope data available in mask buffer');
    return null;
  }
  
  // Get slope data at sample point
  const sampleSlope = readSlopeFromMask(samplePoint.lon, samplePoint.lat, maskBuffer);
  if (!sampleSlope) return null;
  
  // Get slope data at pin
  const pinSlope = readSlopeFromMask(pinPoint.lon, pinPoint.lat, maskBuffer);
  if (!pinSlope) return null;
  
  // Calculate shot bearing (from sample to pin)
  const shotBearing = calculateBearing(samplePoint, pinPoint);
  
  // Classify slopes relative to shot direction
  const slopeAtSample = classifySlope(sampleSlope, shotBearing);
  const slopeAtPin = classifySlope(pinSlope, shotBearing);
  
  // Determine elevation change
  const elevationChange = determineElevationChange(samplePoint, pinPoint, maskBuffer);
  
  // Calculate green coverage
  const greenCoverage = calculateGreenCoverage(samplePoint, pinPoint, maskBuffer);
  
  // Build lookup key
  const coverageKey = coverageCategoryToKey(greenCoverage.category);
  const modifierKey = buildModifierKey(slopeAtSample, slopeAtPin, elevationChange, coverageKey);
  
  // Look up modifier
  const modifierData = lookupModifier(modifierKey);
  
  return {
    slopeAtSample,
    slopeAtPin,
    elevationChange,
    greenCoverage,
    modifierKey,
    modifier: modifierData.modifier,
    difficulty: modifierData.difficulty,
    rationale: modifierData.rationale
  };
}

/**
 * Batch analyze short game for multiple sample points
 */
export function batchAnalyzeShortGame(
  samplePoints: LatLon[],
  pinPoint: LatLon,
  maskBuffer: EnhancedMaskBuffer
): (ShortGameAnalysis | null)[] {
  console.log(`🎯 Batch analyzing short game for ${samplePoints.length} points`);
  
  const results: (ShortGameAnalysis | null)[] = [];
  const startTime = performance.now();
  
  for (const samplePoint of samplePoints) {
    results.push(analyzeShortGame(samplePoint, pinPoint, maskBuffer));
  }
  
  const endTime = performance.now();
  console.log(`✅ Short game analysis completed in ${(endTime - startTime).toFixed(1)}ms`);
  
  return results;
}

/**
 * Classify slope relative to shot direction
 */
function classifySlope(slope: SlopeData, shotBearing: number): SlopeClassification {
  // If slope is very gentle, consider it flat
  if (slope.percentage < 1) {
    return 'flat';
  }
  
  // Calculate angle between slope direction and shot direction
  const angleDiff = normalizeAngleDifference(slope.direction - shotBearing);
  
  // Classify based on angle relationship
  if (Math.abs(angleDiff) <= 45) {
    return 'uphill'; // Slope goes in same direction as shot
  } else if (Math.abs(angleDiff) >= 135) {
    return 'downhill'; // Slope goes opposite to shot direction
  } else {
    return 'sidehill'; // Slope is perpendicular to shot
  }
}

/**
 * Determine elevation change between sample point and pin
 */
function determineElevationChange(
  samplePoint: LatLon,
  pinPoint: LatLon,
  maskBuffer: EnhancedMaskBuffer
): ElevationClassification {
  // For this implementation, we'll estimate elevation change using slope data
  // In a more advanced version, you could sample actual elevations
  
  const sampleSlope = readSlopeFromMask(samplePoint.lon, samplePoint.lat, maskBuffer);
  const pinSlope = readSlopeFromMask(pinPoint.lon, pinPoint.lat, maskBuffer);
  
  if (!sampleSlope || !pinSlope) return 'flat';
  
  // Simple heuristic based on relative slope percentages and directions
  const shotBearing = calculateBearing(samplePoint, pinPoint);
  const sampleRelativeSlope = classifySlope(sampleSlope, shotBearing);
  
  // If the sample point slope indicates uphill toward pin, it's uphill
  if (sampleRelativeSlope === 'uphill' && sampleSlope.percentage > 2) {
    return 'uphill';
  } else if (sampleRelativeSlope === 'downhill' && sampleSlope.percentage > 2) {
    return 'downhill';
  } else {
    return 'flat';
  }
}

/**
 * Build modifier key in the format expected by lookup table
 */
function buildModifierKey(
  slopeAtSample: SlopeClassification,
  slopeAtPin: SlopeClassification,
  elevationChange: ElevationClassification,
  greenCoverage: string
): string {
  // Convert classifications to lookup format with leading spaces/underscores
  const sampleKey = slopeAtSample === 'flat' ? 'flat' : ` ${slopeAtSample}`;
  const pinKey = slopeAtPin === 'flat' ? 'flat' : ` ${slopeAtPin}`;
  const elevationKey = elevationChange === 'flat' ? 'flat' : ` ${elevationChange}`;
  
  return `${sampleKey}_${pinKey}_${elevationKey}_${greenCoverage}`;
}

/**
 * Look up modifier from the imported JSON data
 */
function lookupModifier(key: string): { modifier: number; difficulty: number; rationale: string } {
  const modifierData = (shortGameModifiers as any)[key];
  
  if (modifierData) {
    return {
      modifier: modifierData.modifier,
      difficulty: modifierData.difficulty,
      rationale: modifierData.rationale || ''
    };
  }
  
  // Fallback: try variations of the key
  const fallbackKeys = generateKeyVariations(key);
  for (const fallbackKey of fallbackKeys) {
    const fallbackData = (shortGameModifiers as any)[fallbackKey];
    if (fallbackData) {
      console.log(`📝 Using fallback key: ${fallbackKey} for ${key}`);
      return {
        modifier: fallbackData.modifier,
        difficulty: fallbackData.difficulty,
        rationale: fallbackData.rationale || ''
      };
    }
  }
  
  // Final fallback: no modifier
  console.warn(`⚠️ No modifier found for key: ${key}`);
  return { modifier: 0, difficulty: 5, rationale: 'No modifier data available' };
}

/**
 * Generate key variations for fallback lookups
 */
function generateKeyVariations(originalKey: string): string[] {
  const parts = originalKey.split('_');
  if (parts.length !== 4) return [];
  
  const [sample, pin, elevation, coverage] = parts;
  
  // Try variations with different slope classifications
  const variations = [
    // Try with flat slopes
    `flat_${pin}_${elevation}_${coverage}`,
    `${sample}_flat_${elevation}_${coverage}`,
    `flat_flat_${elevation}_${coverage}`,
    
    // Try with different elevation
    `${sample}_${pin}_flat_${coverage}`,
    
    // Try with different coverage
    `${sample}_${pin}_${elevation}_20-45%`,
    `${sample}_${pin}_${elevation}_>45%`,
    
    // Most generic fallback
    'flat_flat_flat_>45%'
  ];
  
  return variations.filter(v => v !== originalKey);
}

/**
 * Calculate bearing from point A to point B in degrees
 */
function calculateBearing(from: LatLon, to: LatLon): number {
  const dLon = (to.lon - from.lon) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360; // Normalize to 0-360
  
  return bearing;
}

/**
 * Normalize angle difference to -180 to +180 range
 */
function normalizeAngleDifference(angle: number): number {
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}

/**
 * Get available modifier keys for debugging
 */
export function getAvailableModifierKeys(): string[] {
  return Object.keys(shortGameModifiers);
}

/**
 * Test modifier lookup with a specific key
 */
export function testModifierLookup(key: string): any {
  return (shortGameModifiers as any)[key];
}