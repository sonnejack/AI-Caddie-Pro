// elevationBake.ts
// Prebaked elevation system with adaptive resolution

import { GridHeightProvider, GridData, FinePatch, BBox, GridMeta } from './heightProvider';
import { MaskBuffer, expandBBox, makeDegToPxMapper } from './maskBuffer';

declare const window: any;
const getCesium = () => (window as any).Cesium;

// Feature collection type (simplified for greens detection)
export interface FeatureCollection {
  features: Array<{
    geometry: {
      type: string;
      coordinates: number[][][] | number[][]; // polygon coordinates
    };
    properties?: any;
  }>;
}

export interface BakeFeatures {
  greens: FeatureCollection;
  fairways: FeatureCollection;
  bunkers: FeatureCollection;
  tees: FeatureCollection;
  water: FeatureCollection;
}

// Baking parameters
const ROUGH_SPACING_M = 18.288; // 20 meters for rough/no features
const FEATURE_SPACING_M = 9.144; // 10 meters for fairway, bunker, tee, water
const GREEN_SPACING_M = 2.0; // 2 meters for greens
const GREEN_HALO_M = 45.72; // 50 yards in meters
const FEATHER_M = 10; // Feather zone in meters
const BATCH_SIZE = 256; // Cesium batch size for terrain sampling
const BBOX_MARGIN = 0.01; // 1% margin same as mask

/**
 * Bake hole elevation with adaptive resolution
 */
export async function bakeHoleElevation(
  viewer: any,
  holeMask: MaskBuffer,
  features: BakeFeatures
): Promise<GridHeightProvider> {
  console.log('🏔️ Starting elevation baking...');
  const startTime = Date.now();

  // Use mask bbox with same 1% margin
  const bbox = expandBBox(holeMask.bbox, BBOX_MARGIN);
  
  // Calculate meters per degree at bbox center for consistent scaling
  const centerLat = (bbox.south + bbox.north) / 2;
  const metersPerDegLat = 111320; // meters per degree latitude (constant)
  const metersPerDegLon = 111320 * Math.cos(centerLat * Math.PI / 180); // varies by latitude

  // Build coarse grid (using feature spacing for now, will be refined with adaptive)
  console.log('🗺️ Building coarse grid...');
  const coarseGrid = await buildCoarseGrid(viewer, bbox, metersPerDegLat, metersPerDegLon);

  // Build fine green patches
  console.log('🟢 Building fine green patches...');
  const patches = await buildGreenPatches(viewer, bbox, features.greens, metersPerDegLat, metersPerDegLon);

  // Create grid data
  const gridData: GridData = {
    bbox,
    coarseGrid: coarseGrid.data,
    coarseMeta: coarseGrid.meta,
    patches,
    featherMeters: FEATHER_M,
    metersPerDegLat,
    metersPerDegLon
  };

  const elapsed = Date.now() - startTime;
  console.log(`✅ Elevation baking complete in ${elapsed}ms`);
  console.log(`📊 Coarse grid: ${coarseGrid.meta.width}×${coarseGrid.meta.height} (${coarseGrid.data.length} points)`);
  console.log(`📊 Fine patches: ${patches.length} patches (${patches.reduce((sum, p) => sum + p.data.length, 0)} points)`);

  return new GridHeightProvider(gridData);
}

/**
 * Build coarse elevation grid covering entire hole bbox
 */
async function buildCoarseGrid(
  viewer: any,
  bbox: BBox,
  metersPerDegLat: number,
  metersPerDegLon: number
): Promise<{ data: Float32Array; meta: GridMeta }> {
  // Calculate grid dimensions
  const bboxWidthM = (bbox.east - bbox.west) * metersPerDegLon;
  const bboxHeightM = (bbox.north - bbox.south) * metersPerDegLat;
  
  const width = Math.ceil(bboxWidthM / FEATURE_SPACING_M) + 1;
  const height = Math.ceil(bboxHeightM / FEATURE_SPACING_M) + 1;
  
  console.log(`🗺️ Coarse grid: ${width}×${height} at ${FEATURE_SPACING_M}m spacing`);

  // Generate sample positions
  const positions: Array<{ lon: number; lat: number; idx: number }> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lon = bbox.west + (x / (width - 1)) * (bbox.east - bbox.west);
      const lat = bbox.south + (y / (height - 1)) * (bbox.north - bbox.south);
      positions.push({ lon, lat, idx: y * width + x });
    }
  }

  // Sample heights from Cesium
  const heights = await sampleHeightsInBatches(viewer, positions);

  // Apply Gaussian smoothing
  const smoothedHeights = gaussianBlur2D(heights, width, height, FEATURE_SPACING_M, 9.0); // sigma = 9m ≈ 1px

  const meta: GridMeta = {
    bbox,
    width,
    height,
    spacingMeters: FEATURE_SPACING_M,
    sigmaMeters: 9.0,
    version: '1.0'
  };

  return { data: smoothedHeights, meta };
}

/**
 * Build fine elevation patches around greens
 */
async function buildGreenPatches(
  viewer: any,
  holeBbox: BBox,
  greens: FeatureCollection,
  metersPerDegLat: number,
  metersPerDegLon: number
): Promise<FinePatch[]> {
  const patches: FinePatch[] = [];

  for (let i = 0; i < greens.features.length; i++) {
    const green = greens.features[i];
    console.log(`🟢 Processing green ${i + 1}/${greens.features.length}`);

    // Calculate green bbox
    const greenBbox = calculatePolygonBbox(green.geometry.coordinates);
    if (!greenBbox) continue;

    // Expand by green halo distance
    const haloLon = GREEN_HALO_M / metersPerDegLon;
    const haloLat = GREEN_HALO_M / metersPerDegLat;
    
    const expandedBbox: BBox = {
      west: Math.max(holeBbox.west, greenBbox.west - haloLon),
      south: Math.max(holeBbox.south, greenBbox.south - haloLat),
      east: Math.min(holeBbox.east, greenBbox.east + haloLon),
      north: Math.min(holeBbox.north, greenBbox.north + haloLat)
    };

    // Calculate fine grid dimensions
    const patchWidthM = (expandedBbox.east - expandedBbox.west) * metersPerDegLon;
    const patchHeightM = (expandedBbox.north - expandedBbox.south) * metersPerDegLat;
    
    const width = Math.ceil(patchWidthM / GREEN_SPACING_M) + 1;
    const height = Math.ceil(patchHeightM / GREEN_SPACING_M) + 1;

    console.log(`🟢 Fine patch ${i + 1}: ${width}×${height} at ${GREEN_SPACING_M}m spacing`);

    // Generate sample positions
    const positions: Array<{ lon: number; lat: number; idx: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const lon = expandedBbox.west + (x / (width - 1)) * (expandedBbox.east - expandedBbox.west);
        const lat = expandedBbox.south + (y / (height - 1)) * (expandedBbox.north - expandedBbox.south);
        positions.push({ lon, lat, idx: y * width + x });
      }
    }

    // Sample heights
    const heights = await sampleHeightsInBatches(viewer, positions);

    // Apply fine Gaussian smoothing
    const smoothedHeights = gaussianBlur2D(heights, width, height, GREEN_SPACING_M, 2.0); // sigma = 2m ≈ 1px

    // Create patch
    const patch: FinePatch = {
      bbox: expandedBbox,
      width,
      height,
      spacingMeters: GREEN_SPACING_M,
      data: smoothedHeights,
      metersPerDegLat,
      metersPerDegLon
    };

    patches.push(patch);
  }

  return patches;
}

/**
 * Sample terrain heights in batches to avoid overwhelming Cesium
 */
async function sampleHeightsInBatches(
  viewer: any,
  positions: Array<{ lon: number; lat: number; idx: number }>
): Promise<Float32Array> {
  const Cesium = getCesium();
  const heights = new Float32Array(positions.length);

  // Process in batches
  for (let start = 0; start < positions.length; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, positions.length);
    const batch = positions.slice(start, end);
    
    console.log(`📡 Sampling heights batch ${Math.floor(start / BATCH_SIZE) + 1}/${Math.ceil(positions.length / BATCH_SIZE)}`);

    try {
      // Convert to Cartographic
      const cartographics = batch.map(pos => 
        Cesium.Cartographic.fromDegrees(pos.lon, pos.lat)
      );

      // Sample terrain
      const samples = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartographics);
      
      // Store results
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        const pos = batch[i];
        const height = Number.isFinite(sample.height) ? sample.height : 0;
        heights[pos.idx] = height;
      }
    } catch (error) {
      console.warn('Terrain sampling batch failed:', error);
      // Fill with zeros on error
      for (const pos of batch) {
        heights[pos.idx] = 0;
      }
    }
  }

  return heights;
}

/**
 * Apply separable Gaussian blur to 2D height grid
 */
function gaussianBlur2D(
  data: Float32Array,
  width: number,
  height: number,
  spacingMeters: number,
  sigmaMeters: number
): Float32Array {
  const sigmaPx = sigmaMeters / spacingMeters;
  const radius = Math.ceil(3 * sigmaPx);
  
  if (radius < 1) return data; // No blur needed

  // Create Gaussian kernel
  const kernel = new Float32Array(2 * radius + 1);
  let kernelSum = 0;
  for (let i = 0; i < kernel.length; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigmaPx * sigmaPx));
    kernelSum += kernel[i];
  }
  // Normalize kernel
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= kernelSum;
  }

  // Separable blur: horizontal pass
  const temp = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const kx = x + k - radius;
        const srcX = Math.max(0, Math.min(width - 1, kx)); // clamp
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
        const srcY = Math.max(0, Math.min(height - 1, ky)); // clamp
        sum += temp[srcY * width + x] * kernel[k];
      }
      result[y * width + x] = sum;
    }
  }

  return result;
}

/**
 * Calculate bbox of a polygon from its coordinates
 */
function calculatePolygonBbox(coordinates: number[][][] | number[][]): BBox | null {
  try {
    // Handle both Polygon and MultiPolygon geometries
    const rings = Array.isArray(coordinates[0][0]) 
      ? coordinates as number[][][] // Polygon
      : [coordinates as number[][]]; // Treat as single ring

    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const ring of rings) {
      for (const coord of ring) {
        const [lon, lat] = coord;
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }

    if (!isFinite(minLon)) return null;

    return {
      west: minLon,
      south: minLat,
      east: maxLon,
      north: maxLat
    };
  } catch (error) {
    console.warn('Failed to calculate polygon bbox:', error);
    return null;
  }
}