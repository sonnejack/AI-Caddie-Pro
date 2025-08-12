declare const Cesium: any;

export type ClassId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

interface SamplePoint {
  position: { lon: number; lat: number };
  classId: ClassId;
}

interface SamplesLayerState {
  viewer: any;
  pointCollection: any;
  visible: boolean;
}

// Color mapping for raster classes (final specification)
const CLASS_COLORS: Record<ClassId, string> = {
  0: '#8B5E3C', // Unknown → Rough
  1: '#8E44AD', // OB → Purple
  2: '#0078FF', // Water → Blue  
  3: '#E74C3C', // Hazard → Red
  4: '#D2B48C', // Bunker → Tan
  5: '#6CFF8A', // Green → Light Green
  6: '#28B43C', // Fairway → Dark Green
  7: '#8E44AD', // Recovery → Purple (same as OB)
  8: '#8B5E3C'  // Rough → Brown
};

let currentLayer: SamplesLayerState | null = null;

/**
 * Initialize or get existing samples layer
 */
function getOrCreateSamplesLayer(viewer: any): SamplesLayerState {
  if (currentLayer && currentLayer.viewer === viewer) {
    return currentLayer;
  }

  // Clean up existing layer if viewer changed
  if (currentLayer) {
    hideSamples();
  }

  // Create new point primitive collection
  const pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  
  currentLayer = {
    viewer,
    pointCollection,
    visible: false
  };

  return currentLayer;
}

/**
 * Update samples display with new data
 */
export function updateSamples(
  viewer: any,
  points: { lon: number; lat: number }[],
  classes: Uint8Array,
  visible: boolean = false
): void {
  if (!viewer || !points || !classes || points.length !== classes.length) {
    console.warn('Invalid samples data provided');
    return;
  }

  const layer = getOrCreateSamplesLayer(viewer);
  
  try {
    // Clear existing points
    layer.pointCollection.removeAll();

    // Add new points if visible
    if (visible && points.length > 0) {
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const classId = Math.min(8, Math.max(0, classes[i])) as ClassId;
        const colorHex = CLASS_COLORS[classId];
        const cesiumColor = Cesium.Color.fromCssColorString(colorHex);

        layer.pointCollection.add({
          position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
          pixelSize: 4,
          color: cesiumColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        });
      }
    }

    layer.visible = visible;
    console.log(`Updated samples layer: ${points.length} points, visible: ${visible}`);
  } catch (error) {
    console.error('Error updating samples:', error);
  }
}

/**
 * Show samples layer
 */
export function showSamples(): void {
  if (!currentLayer) {
    console.warn('No samples layer to show');
    return;
  }

  currentLayer.pointCollection.show = true;
  currentLayer.visible = true;
}

/**
 * Hide samples layer
 */
export function hideSamples(): void {
  if (!currentLayer) return;

  try {
    currentLayer.pointCollection.show = false;
    currentLayer.visible = false;
  } catch (error) {
    console.error('Error hiding samples:', error);
  }
}

/**
 * Toggle samples visibility
 */
export function toggleSamples(): boolean {
  if (!currentLayer) {
    console.warn('No samples layer to toggle');
    return false;
  }

  const newVisible = !currentLayer.visible;
  
  if (newVisible) {
    showSamples();
  } else {
    hideSamples();
  }

  return newVisible;
}

/**
 * Check if samples are currently visible
 */
export function areSamplesVisible(): boolean {
  return currentLayer?.visible ?? false;
}

/**
 * Get current samples count
 */
export function getSamplesCount(): number {
  if (!currentLayer || !currentLayer.pointCollection) return 0;
  return currentLayer.pointCollection.length;
}

/**
 * Clear all samples and destroy layer
 */
export function destroySamplesLayer(): void {
  if (!currentLayer) return;

  try {
    if (currentLayer.pointCollection) {
      currentLayer.viewer.scene.primitives.remove(currentLayer.pointCollection);
    }
  } catch (error) {
    console.error('Error destroying samples layer:', error);
  }

  currentLayer = null;
}

/**
 * Set samples visibility without clearing data
 */
export function setSamplesVisibility(visible: boolean): void {
  if (!currentLayer) return;

  try {
    currentLayer.pointCollection.show = visible;
    currentLayer.visible = visible;
  } catch (error) {
    console.error('Error setting samples visibility:', error);
  }
}

/**
 * Get color for a specific class ID (for UI display)
 */
export function getClassColor(classId: ClassId): string {
  return CLASS_COLORS[Math.min(8, Math.max(0, classId)) as ClassId];
}

/**
 * Get class name for display
 */
export function getClassName(classId: ClassId): string {
  const names: Record<ClassId, string> = {
    0: 'Unknown',
    1: 'OB',
    2: 'Water',
    3: 'Hazard',
    4: 'Bunker',
    5: 'Green',
    6: 'Fairway',
    7: 'Recovery',
    8: 'Rough'
  };
  
  return names[Math.min(8, Math.max(0, classId)) as ClassId] || 'Unknown';
}