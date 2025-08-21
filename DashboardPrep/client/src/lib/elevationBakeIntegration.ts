// elevationBakeIntegration.ts
// Integration layer for elevation baking with course loading

import type { MaskBuffer, ElevationBake } from './maskBuffer';

// Elevation baking is enabled by default (runs in web worker to prevent UI blocking)
// Disable with: localStorage.setItem('enableElevationBaking', 'false')
const ELEVATION_BAKING_ENABLED = localStorage.getItem('enableElevationBaking') !== 'false';

declare const window: any;

/**
 * Bake elevation data into the mask buffer
 * This runs after createMaskFromFeatures() and before any optimizer/ES evaluation
 */
export async function bakeElevationIntoMask(
  viewer: any,
  maskBuffer: MaskBuffer,
  onProgress?: (phase: string, progress: number, message?: string) => void
): Promise<void> {
  console.log('[ElevationBake] 🚀 Function called with:', {
    hasViewer: !!viewer,
    hasMaskBuffer: !!maskBuffer,
    hasOnProgress: !!onProgress,
    elevationBakingEnabled: ELEVATION_BAKING_ENABLED,
    localStorage: localStorage.getItem('enableElevationBaking')
  });
  
  // Check if elevation baking is enabled
  if (!ELEVATION_BAKING_ENABLED) {
    console.log('[ElevationBake] ❌ Disabled. Enable with: localStorage.removeItem("enableElevationBaking")');
    return;
  }

  try {
    // Check if terrain provider is available
    if (!viewer?.terrainProvider) {
      console.warn('[ElevationBake] No terrain provider available, skipping elevation bake');
      return;
    }

    console.log('[ElevationBake] Starting elevation baking for mask:', {
      width: maskBuffer.width,
      height: maskBuffer.height,
      bbox: maskBuffer.bbox
    });

    // Start elevation baking in web worker
    const startTime = Date.now();
    const result = await bakeElevationInWorker(maskBuffer, viewer, onProgress);

    if (result) {
      // Attach elevation bake to mask buffer
      maskBuffer.elevationBake = result;
      
      const elapsed = Date.now() - startTime;
      console.log(`[ElevationBake] ✅ Complete in ${elapsed}ms`);
      console.log(`[ElevationBake] 📊 Sampled ${result.meta.sampledCount} points`);
      console.log(`[ElevationBake] 📊 Grid: ${result.width}×${result.height} pixels`);
      console.log(`[ElevationBake] 🎯 MaskBuffer now has elevationBake:`, !!maskBuffer.elevationBake);
      
      // Validate the result
      validateElevationBake(result);
      
    } else {
      console.warn('[ElevationBake] ⚠️ Baking failed or was cancelled');
    }

  } catch (error) {
    console.error('[ElevationBake] ❌ Failed:', error);
    // Don't throw - allow course loading to continue without elevation data
  }
}

/**
 * Run elevation baking on main thread with real Cesium terrain sampling
 * (The web worker approach was getting stuck with Cesium integration)
 */
async function bakeElevationInWorker(
  maskBuffer: MaskBuffer,
  viewer: any,
  onProgress?: (phase: string, progress: number, message?: string) => void
): Promise<ElevationBake | null> {
  if (!viewer?.terrainProvider) {
    console.warn('[ElevationBake] No Cesium terrain provider available');
    return null;
  }

  console.log('[ElevationBake] Using provided Cesium viewer for terrain sampling');

  try {
    // Phase 1: Generate sampling sites
    onProgress?.('collecting', 0, 'Generating sampling sites...');
    
    const samplingData = generateSamplingSites({
      bbox: maskBuffer.bbox,
      width: maskBuffer.width,
      height: maskBuffer.height,
      maskData: maskBuffer.data,
      strideFeatureM: 10,
      strideNonFeatureM: 20,
      batchSize: 512
    });
    
    onProgress?.('collecting', 100, `Generated ${samplingData.sites.length} sampling sites`);

    // Phase 2: Sample terrain heights
    onProgress?.('sampling', 0, 'Sampling terrain heights...');
    
    const heights = await sampleTerrainHeights(viewer, samplingData.sites, (progress) => {
      onProgress?.('sampling', progress, `Sampled ${Math.floor(progress * samplingData.sites.length / 100)}/${samplingData.sites.length} sites`);
    });

    // Phase 3: Smooth and upsample
    onProgress?.('smoothing', 0, 'Smoothing and upsampling...');
    
    const heightMeters = await smoothAndUpsample(samplingData, heights, {
      bbox: maskBuffer.bbox,
      width: maskBuffer.width,
      height: maskBuffer.height,
      maskData: maskBuffer.data,
      strideFeatureM: 10,
      strideNonFeatureM: 20,
      batchSize: 512
    });

    onProgress?.('smoothing', 100, 'Smoothing complete');

    const result: ElevationBake = {
      width: maskBuffer.width,
      height: maskBuffer.height,
      bbox: maskBuffer.bbox,
      heightMeters,
      meta: {
        strideFeatureM: 10,
        strideNonFeatureM: 20,
        sigmaPx: 2.0,
        sampledCount: samplingData.sites.length,
        provider: 'CesiumTerrain'
      }
    };

    return result;
    
  } catch (error) {
    console.error('[ElevationBake] Terrain sampling failed:', error);
    onProgress?.('error', 0, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

// Feature classes (10m sampling)
const FEATURE_CLASSES = new Set([4, 5, 6, 7, 9]); // bunker, green, fairway, recovery, tee

function generateSamplingSites(config: {
  bbox: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  maskData: Uint8ClampedArray;
  strideFeatureM: number;
  strideNonFeatureM: number;
  batchSize: number;
}) {
  const sites: Array<{ lon: number; lat: number; px: number; py: number }> = [];
  
  // Generate exactly 1000 uniformly distributed random points across the bounding box
  const numSamples = 1000;
  console.log(`[ElevationBake] Generating ${numSamples} random sample points across bounding box`);
  
  const lonRange = config.bbox.east - config.bbox.west;
  const latRange = config.bbox.north - config.bbox.south;
  
  for (let i = 0; i < numSamples; i++) {
    // Generate uniform random position within bounding box
    const lon = config.bbox.west + Math.random() * lonRange;
    const lat = config.bbox.south + Math.random() * latRange;
    
    // Convert to pixel coordinates for reference
    const px = Math.floor(((lon - config.bbox.west) / lonRange) * config.width);
    const py = Math.floor(((config.bbox.north - lat) / latRange) * config.height);
    
    sites.push({
      lon,
      lat,
      px: Math.max(0, Math.min(config.width - 1, px)),
      py: Math.max(0, Math.min(config.height - 1, py))
    });
  }
  
  console.log(`[ElevationBake] Generated ${sites.length} sampling sites`);
  return { sites, config };
}

async function sampleTerrainHeights(
  viewer: any, 
  sites: Array<{ lon: number; lat: number; px: number; py: number }>,
  onProgress: (progress: number) => void
): Promise<Float32Array> {
  const Cesium = (window as any).Cesium;
  if (!Cesium) {
    throw new Error('Cesium not available');
  }

  const heights = new Float32Array(sites.length);
  const batchSize = 256;
  
  for (let i = 0; i < sites.length; i += batchSize) {
    const batch = sites.slice(i, Math.min(i + batchSize, sites.length));
    
    // Convert to Cesium positions
    const positions = batch.map(site => 
      Cesium.Cartographic.fromDegrees(site.lon, site.lat)
    );
    
    try {
      // Sample terrain provider
      const sampledPositions = await Cesium.sampleTerrainMostDetailed(
        viewer.terrainProvider,
        positions
      );
      
      // Store heights
      for (let j = 0; j < sampledPositions.length; j++) {
        const height = sampledPositions[j].height;
        heights[i + j] = Number.isFinite(height) ? height : 0;
      }
      
    } catch (error) {
      console.warn(`[ElevationBake] Batch ${i}-${i + batch.length} failed, using default heights:`, error);
      // Fill with default height if sampling fails
      for (let j = 0; j < batch.length; j++) {
        heights[i + j] = 0;
      }
    }
    
    // Update progress
    const progress = Math.min(100, ((i + batch.length) / sites.length) * 100);
    onProgress(progress);
    
    // Small delay to prevent blocking
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  
  return heights;
}

async function smoothAndUpsample(
  samplingData: { sites: Array<{ lon: number; lat: number; px: number; py: number }> },
  heights: Float32Array,
  config: {
    bbox: { west: number; south: number; east: number; north: number };
    width: number;
    height: number;
    maskData: Uint8ClampedArray;
    strideFeatureM: number;
    strideNonFeatureM: number;
    batchSize: number;
  }
): Promise<Float32Array> {
  console.log(`[ElevationBake] Upsampling from ${samplingData.sites.length} samples to ${config.width}×${config.height} pixels`);
  
  // Create per-pixel height grid
  const result = new Float32Array(config.width * config.height);
  const degPerPxLon = (config.bbox.east - config.bbox.west) / config.width;
  const degPerPxLat = (config.bbox.north - config.bbox.south) / config.height;
  
  // Use inverse distance weighting for smoother interpolation
  const maxNeighbors = 8; // Use up to 8 nearest neighbors for interpolation
  
  // Process in chunks to avoid blocking the UI
  const chunkSize = 100; // Process 100 rows at a time
  
  for (let chunkStart = 0; chunkStart < config.height; chunkStart += chunkSize) {
    const chunkEnd = Math.min(chunkStart + chunkSize, config.height);
    
    // Process this chunk of rows
    for (let py = chunkStart; py < chunkEnd; py++) {
      for (let px = 0; px < config.width; px++) {
        const lon = config.bbox.west + px * degPerPxLon;
        const lat = config.bbox.north - py * degPerPxLat;
        
        // Find nearest sample points with distances
        const neighbors: Array<{ dist: number; height: number }> = [];
        
        for (let i = 0; i < samplingData.sites.length; i++) {
          const site = samplingData.sites[i];
          const dist = Math.sqrt(
            Math.pow((site.lon - lon) / degPerPxLon, 2) + 
            Math.pow((site.lat - lat) / degPerPxLat, 2)
          );
          
          neighbors.push({ dist, height: heights[i] });
        }
        
        // Sort by distance and take closest neighbors
        neighbors.sort((a, b) => a.dist - b.dist);
        const closeNeighbors = neighbors.slice(0, maxNeighbors);
        
        // If we have a point very close (within 1 pixel), use it directly
        if (closeNeighbors[0].dist < 1.0) {
          result[py * config.width + px] = closeNeighbors[0].height;
        } else {
          // Inverse distance weighted interpolation
          let weightedSum = 0;
          let totalWeight = 0;
          
          for (const neighbor of closeNeighbors) {
            const weight = 1.0 / Math.max(0.1, neighbor.dist * neighbor.dist); // Prevent division by zero
            weightedSum += neighbor.height * weight;
            totalWeight += weight;
          }
          
          result[py * config.width + px] = weightedSum / totalWeight;
        }
      }
    }
    
    // Progress logging and yield control to event loop
    const progress = (chunkEnd / config.height) * 100;
    console.log(`[ElevationBake] Upsampling progress: ${progress.toFixed(0)}%`);
    
    // Yield control to the event loop every chunk to prevent freezing
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  
  console.log(`[ElevationBake] Upsampling complete`);
  return result;
}

// Track active worker for cancellation
let activeWorker: Worker | null = null;

/**
 * Cancel any running elevation bake operation
 */
export function cancelElevationBaking(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
    console.log('[ElevationBake] Cancelled');
  }
}

/**
 * Validate elevation bake result
 */
function validateElevationBake(bake: ElevationBake): void {
  // Check array length
  const expectedLength = bake.width * bake.height;
  if (bake.heightMeters.length !== expectedLength) {
    console.error(`[ElevationBake] ❌ Invalid array length: ${bake.heightMeters.length}, expected ${expectedLength}`);
    return;
  }

  // Check for NaNs
  let nanCount = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  
  for (let i = 0; i < bake.heightMeters.length; i++) {
    const h = bake.heightMeters[i];
    if (isNaN(h)) {
      nanCount++;
    } else {
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
    }
  }

  if (nanCount > 0) {
    console.error(`[ElevationBake] ❌ Found ${nanCount} NaN values in height data`);
  } else {
    console.log(`[ElevationBake] ✅ Validation passed: ${expectedLength} heights, range [${minHeight.toFixed(1)}m, ${maxHeight.toFixed(1)}m]`);
  }

  // Test a sample bilinear read
  const centerLon = (bake.bbox.west + bake.bbox.east) / 2;
  const centerLat = (bake.bbox.south + bake.bbox.north) / 2;
  
  // Simple nearest neighbor test
  const centerX = Math.floor(bake.width / 2);
  const centerY = Math.floor(bake.height / 2);
  const centerHeight = bake.heightMeters[centerY * bake.width + centerX];
  
  if (Number.isFinite(centerHeight)) {
    console.log(`[ElevationBake] ✅ Center sample (${centerLon.toFixed(6)}, ${centerLat.toFixed(6)}): ${centerHeight.toFixed(1)}m`);
  } else {
    console.error(`[ElevationBake] ❌ Center sample returned non-finite height: ${centerHeight}`);
  }
}

/**
 * Check if elevation data is available for a mask
 */
export function hasElevationBake(maskBuffer: MaskBuffer): boolean {
  return !!(maskBuffer.elevationBake?.heightMeters?.length === maskBuffer.width * maskBuffer.height);
}

/**
 * Get memory usage of elevation bake
 */
export function getElevationBakeMemoryUsage(maskBuffer: MaskBuffer): number {
  if (!maskBuffer.elevationBake) return 0;
  return maskBuffer.elevationBake.heightMeters.byteLength;
}

/**
 * Clear elevation bake data to free memory
 */
export function clearElevationBake(maskBuffer: MaskBuffer): void {
  if (maskBuffer.elevationBake) {
    delete maskBuffer.elevationBake;
    console.log('[ElevationBake] Cleared elevation data');
  }
}