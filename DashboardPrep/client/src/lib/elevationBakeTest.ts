// elevationBakeTest.ts
// Simple test and validation functions for elevation baking

import type { MaskBuffer, ElevationBake } from './maskBuffer';
import { sampleBakedHeight } from './maskBuffer';
import { bakeElevationIntoMask } from './elevationBakeIntegration';

/**
 * Validate that an elevation bake is properly structured
 */
export function validateElevationBake(bake: ElevationBake): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check basic structure
  if (!bake.heightMeters || !(bake.heightMeters instanceof Float32Array)) {
    errors.push('heightMeters must be a Float32Array');
  }

  if (bake.width <= 0 || bake.height <= 0) {
    errors.push('Width and height must be positive');
  }

  if (bake.heightMeters && bake.heightMeters.length !== bake.width * bake.height) {
    errors.push(`heightMeters length (${bake.heightMeters.length}) does not match width×height (${bake.width * bake.height})`);
  }

  // Check for invalid values
  if (bake.heightMeters) {
    let nanCount = 0;
    let infCount = 0;
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let i = 0; i < bake.heightMeters.length; i++) {
      const h = bake.heightMeters[i];
      if (isNaN(h)) {
        nanCount++;
      } else if (!isFinite(h)) {
        infCount++;
      } else {
        minHeight = Math.min(minHeight, h);
        maxHeight = Math.max(maxHeight, h);
      }
    }

    if (nanCount > 0) {
      errors.push(`Found ${nanCount} NaN values in height data`);
    }

    if (infCount > 0) {
      errors.push(`Found ${infCount} infinite values in height data`);
    }

    // Check reasonable height range (Earth elevations are roughly -11000m to 9000m)
    if (isFinite(minHeight) && isFinite(maxHeight)) {
      if (minHeight < -12000 || maxHeight > 10000) {
        errors.push(`Height range [${minHeight.toFixed(1)}m, ${maxHeight.toFixed(1)}m] seems unrealistic`);
      }
    }
  }

  // Check bbox validity
  if (bake.bbox.west >= bake.bbox.east) {
    errors.push('bbox.west must be less than bbox.east');
  }

  if (bake.bbox.south >= bake.bbox.north) {
    errors.push('bbox.south must be less than bbox.north');
  }

  // Check metadata
  if (!bake.meta || typeof bake.meta !== 'object') {
    errors.push('meta object is required');
  } else {
    if (bake.meta.strideFeatureM <= 0 || bake.meta.strideNonFeatureM <= 0) {
      errors.push('stride values must be positive');
    }

    if (bake.meta.sampledCount <= 0) {
      errors.push('sampledCount must be positive');
    }

    if (!['CesiumTerrain', 'None'].includes(bake.meta.provider)) {
      errors.push('provider must be CesiumTerrain or None');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Test bilinear sampling at various points
 */
export function testBilinearSampling(bake: ElevationBake): { success: boolean; results: any[] } {
  const testPoints = [
    // Center of bbox
    {
      name: 'center',
      lon: (bake.bbox.west + bake.bbox.east) / 2,
      lat: (bake.bbox.south + bake.bbox.north) / 2
    },
    // Corners
    {
      name: 'southwest',
      lon: bake.bbox.west + 0.001 * (bake.bbox.east - bake.bbox.west),
      lat: bake.bbox.south + 0.001 * (bake.bbox.north - bake.bbox.south)
    },
    {
      name: 'northeast',
      lon: bake.bbox.east - 0.001 * (bake.bbox.east - bake.bbox.west),
      lat: bake.bbox.north - 0.001 * (bake.bbox.north - bake.bbox.south)
    },
    // Outside bbox (should return null)
    {
      name: 'outside',
      lon: bake.bbox.west - 0.01,
      lat: bake.bbox.south - 0.01
    }
  ];

  const results = testPoints.map(point => {
    const height = sampleBakedHeight(point.lon, point.lat, bake);
    return {
      name: point.name,
      lon: point.lon,
      lat: point.lat,
      height,
      valid: point.name === 'outside' ? height === null : height !== null && isFinite(height)
    };
  });

  const success = results.every(r => r.valid);

  return { success, results };
}

/**
 * Simple performance test of bilinear sampling
 */
export function performanceTestSampling(bake: ElevationBake, sampleCount: number = 1000): { samplesPerMs: number; totalTime: number } {
  const centerLon = (bake.bbox.west + bake.bbox.east) / 2;
  const centerLat = (bake.bbox.south + bake.bbox.north) / 2;
  const lonRange = (bake.bbox.east - bake.bbox.west) * 0.8; // Stay within 80% of bbox
  const latRange = (bake.bbox.north - bake.bbox.south) * 0.8;

  const startTime = performance.now();

  for (let i = 0; i < sampleCount; i++) {
    const lon = centerLon + (Math.random() - 0.5) * lonRange;
    const lat = centerLat + (Math.random() - 0.5) * latRange;
    sampleBakedHeight(lon, lat, bake);
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    samplesPerMs: sampleCount / totalTime,
    totalTime
  };
}

/**
 * Run all validation tests on an elevation bake
 */
export function runAllTests(bake: ElevationBake): { 
  valid: boolean; 
  structureTest: { valid: boolean; errors: string[] };
  samplingTest: { success: boolean; results: any[] };
  performanceTest: { samplesPerMs: number; totalTime: number };
} {
  console.log('[ElevationBakeTest] Running validation tests...');

  const structureTest = validateElevationBake(bake);
  console.log('[ElevationBakeTest] Structure test:', structureTest.valid ? '✅ PASS' : '❌ FAIL', structureTest.errors);

  const samplingTest = testBilinearSampling(bake);
  console.log('[ElevationBakeTest] Bilinear sampling test:', samplingTest.success ? '✅ PASS' : '❌ FAIL', samplingTest.results);

  const performanceTest = performanceTestSampling(bake, 1000);
  console.log('[ElevationBakeTest] Performance test: ✅', `${performanceTest.samplesPerMs.toFixed(1)} samples/ms (${performanceTest.totalTime.toFixed(1)}ms for 1000 samples)`);

  const valid = structureTest.valid && samplingTest.success;

  return {
    valid,
    structureTest,
    samplingTest,
    performanceTest
  };
}

/**
 * Test elevation baking with a simple synthetic mask
 */
export async function testElevationBakingWithSyntheticData(viewer: any): Promise<boolean> {
  if (!viewer?.terrainProvider) {
    console.warn('[ElevationBakeTest] No terrain provider available for testing');
    return false;
  }

  console.log('[ElevationBakeTest] Creating synthetic mask for testing...');

  // Create a small synthetic mask (50x50 pixels)
  const width = 50;
  const height = 50;
  const bbox = {
    west: -122.5,
    south: 37.7,
    east: -122.4,
    north: 37.8
  }; // San Francisco area

  // Create synthetic mask data (alternating feature/non-feature classes)
  const maskData = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Checkerboard pattern: feature (green=5) vs non-feature (rough=8) 
      const isFeature = (x + y) % 2 === 0;
      maskData[idx] = isFeature ? 5 : 8; // red channel (class id)
      maskData[idx + 1] = 0; // green
      maskData[idx + 2] = 0; // blue
      maskData[idx + 3] = 255; // alpha
    }
  }

  const testMaskBuffer: MaskBuffer = {
    width,
    height,
    bbox,
    data: maskData
  };

  console.log('[ElevationBakeTest] Running elevation bake...');

  try {
    await bakeElevationIntoMask(
      viewer,
      testMaskBuffer,
      (phase, progress, message) => {
        console.log(`[ElevationBakeTest] ${phase}: ${progress}% ${message || ''}`);
      }
    );

    if (!testMaskBuffer.elevationBake) {
      console.error('[ElevationBakeTest] ❌ No elevation bake data generated');
      return false;
    }

    // Run validation tests
    const testResults = runAllTests(testMaskBuffer.elevationBake);

    console.log('[ElevationBakeTest] Overall result:', testResults.valid ? '✅ SUCCESS' : '❌ FAILURE');

    return testResults.valid;

  } catch (error) {
    console.error('[ElevationBakeTest] ❌ Test failed with error:', error);
    return false;
  }
}