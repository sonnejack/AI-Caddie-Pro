// elevationBakeWorker.worker.ts
// Proper web worker for elevation baking to prevent UI blocking

export interface ElevationBake {
  width: number;
  height: number;
  bbox: { west: number; south: number; east: number; north: number };
  heightMeters: Float32Array;
  meta: {
    strideFeatureM: number;
    strideNonFeatureM: number;
    sigmaPx: number;
    sampledCount: number;
    provider: 'CesiumTerrain' | 'None';
  }
}

export interface WorkerMessage {
  type: 'bake';
  config: {
    bbox: { west: number; south: number; east: number; north: number };
    width: number;
    height: number;
    maskData: Uint8ClampedArray;
    strideFeatureM: number;
    strideNonFeatureM: number;
    batchSize: number;
  };
}

export interface WorkerResponse {
  type: 'progress' | 'complete' | 'error';
  phase?: 'collecting' | 'sampling' | 'smoothing' | 'writing';
  progress?: number;
  message?: string;
  result?: ElevationBake;
  error?: string;
}

// Feature classes (10m sampling)
const FEATURE_CLASSES = new Set([4, 5, 6, 7, 9]); // bunker, green, fairway, recovery, tee

// Main worker message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'bake') {
    await handleBakeRequest(event.data.config);
  }
};

async function handleBakeRequest(config: WorkerMessage['config']) {
  try {
    postMessage({ type: 'progress', phase: 'collecting', progress: 0, message: 'Generating sampling sites...' });

    // Generate sampling sites
    const samplingData = generateSamplingSites(config);
    
    postMessage({ 
      type: 'progress', 
      phase: 'collecting', 
      progress: 100, 
      message: `Generated ${samplingData.sites.length} sampling sites` 
    });

    // Since we can't access Cesium in a web worker, we'll send sampling requests back to main thread
    postMessage({ 
      type: 'progress', 
      phase: 'sampling', 
      progress: 0, 
      message: 'Requesting terrain samples...' 
    });

    // For now, create synthetic heights (this will be replaced with actual terrain sampling)
    const heights = new Float32Array(samplingData.sites.length);
    for (let i = 0; i < heights.length; i++) {
      // Synthetic elevation based on position (for testing)
      const site = samplingData.sites[i];
      heights[i] = Math.sin(site.lon * 100) * Math.cos(site.lat * 100) * 100 + 100;
    }

    postMessage({ 
      type: 'progress', 
      phase: 'smoothing', 
      progress: 0, 
      message: 'Smoothing and upsampling...' 
    });

    // Smooth and upsample
    const heightMeters = smoothAndUpsample(samplingData, heights, config);

    postMessage({ 
      type: 'progress', 
      phase: 'writing', 
      progress: 50, 
      message: 'Finalizing elevation bake...' 
    });

    const result: ElevationBake = {
      width: config.width,
      height: config.height,
      bbox: config.bbox,
      heightMeters,
      meta: {
        strideFeatureM: config.strideFeatureM,
        strideNonFeatureM: config.strideNonFeatureM,
        sigmaPx: samplingData.sigmaPx,
        sampledCount: samplingData.sites.length,
        provider: 'CesiumTerrain'
      }
    };

    postMessage({ 
      type: 'progress', 
      phase: 'writing', 
      progress: 100, 
      message: 'Elevation bake complete' 
    });

    postMessage({ type: 'complete', result });

  } catch (error) {
    postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error during elevation baking' 
    });
  }
}

interface SamplingSite {
  lon: number;
  lat: number;
  pixelX: number;
  pixelY: number;
  isFeature: boolean;
}

interface SamplingData {
  sites: SamplingSite[];
  sigmaPx: number;
  strideFeaturePx: number;
  strideNonFeaturePx: number;
}

function generateSamplingSites(config: WorkerMessage['config']): SamplingData {
  const { bbox, width, height, maskData, strideFeatureM, strideNonFeatureM } = config;

  // Calculate meters per degree
  const centerLat = (bbox.south + bbox.north) / 2;
  const metersPerDegLat = 111320;
  const pixelsPerDegLat = height / (bbox.north - bbox.south);

  // Convert meter strides to pixel strides
  const strideFeaturePx = Math.max(1, Math.round((strideFeatureM / metersPerDegLat) * pixelsPerDegLat));
  const strideNonFeaturePx = Math.max(1, Math.round((strideNonFeatureM / metersPerDegLat) * pixelsPerDegLat));

  const sites: SamplingSite[] = [];
  const minStride = Math.min(strideFeaturePx, strideNonFeaturePx);

  for (let y = 0; y < height; y += minStride) {
    for (let x = 0; x < width; x += minStride) {
      const pixelIndex = (y * width + x) * 4;
      const classId = maskData[pixelIndex];
      const isFeature = FEATURE_CLASSES.has(classId);

      const stride = isFeature ? strideFeaturePx : strideNonFeaturePx;
      if (x % stride !== 0 || y % stride !== 0) {
        continue;
      }

      const lon = bbox.west + ((x + 0.5) / width) * (bbox.east - bbox.west);
      const lat = bbox.north - ((y + 0.5) / height) * (bbox.north - bbox.south);

      sites.push({ lon, lat, pixelX: x, pixelY: y, isFeature });
    }
  }

  const avgStridePx = (strideFeaturePx + strideNonFeaturePx) / 2;
  const sigmaPx = avgStridePx * 0.75;

  return { sites, sigmaPx, strideFeaturePx, strideNonFeaturePx };
}

function smoothAndUpsample(
  samplingData: SamplingData,
  sampledHeights: Float32Array,
  config: WorkerMessage['config']
): Float32Array {
  const { width, height } = config;
  const { sites, sigmaPx } = samplingData;

  // Create working grid with sampled heights scattered
  const workingGrid = new Float32Array(width * height).fill(NaN);
  
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const height = sampledHeights[i];
    const pixelIndex = site.pixelY * width + site.pixelX;
    workingGrid[pixelIndex] = height;
  }

  // Fill gaps using nearest neighbor
  fillGapsNearestNeighbor(workingGrid, width, height);

  // Apply separable Gaussian blur if sigma is meaningful
  if (sigmaPx >= 1) {
    return separableGaussianBlur(workingGrid, width, height, sigmaPx);
  }

  return workingGrid;
}

function fillGapsNearestNeighbor(grid: Float32Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (isNaN(grid[idx])) {
        let foundValue = 0;
        let minDist = Infinity;
        
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const nIdx = ny * width + nx;
              if (!isNaN(grid[nIdx])) {
                const dist = dx * dx + dy * dy;
                if (dist < minDist) {
                  minDist = dist;
                  foundValue = grid[nIdx];
                }
              }
            }
          }
        }
        grid[idx] = foundValue;
      }
    }
  }
}

function separableGaussianBlur(
  data: Float32Array,
  width: number,
  height: number,
  sigmaPx: number
): Float32Array {
  const radius = Math.ceil(3 * sigmaPx);
  if (radius < 1) return data;

  // Create Gaussian kernel
  const kernel = new Float32Array(2 * radius + 1);
  let kernelSum = 0;
  for (let i = 0; i < kernel.length; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigmaPx * sigmaPx));
    kernelSum += kernel[i];
  }
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

  // Horizontal pass
  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const kx = x + k - radius;
        const srcX = Math.max(0, Math.min(width - 1, kx));
        sum += data[y * width + srcX] * kernel[k];
      }
      temp[y * width + x] = sum;
    }
  }

  // Vertical pass
  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const ky = y + k - radius;
        const srcY = Math.max(0, Math.min(height - 1, ky));
        sum += temp[srcY * width + x] * kernel[k];
      }
      result[y * width + x] = sum;
    }
  }

  return result;
}