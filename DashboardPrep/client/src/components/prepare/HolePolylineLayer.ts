import { centroidOfPolygon } from '@/lib/holeGeom';

declare const Cesium: any;

interface HolePolylineLayerState {
  viewer: any;
  polylineEntity: any;
  teeEntity: any;
  greenEntity: any;
}

let currentLayer: HolePolylineLayerState | null = null;

/**
 * Show hole polyline on Cesium viewer with endpoint markers
 */
export function showHolePolyline(
  viewer: any,
  holeId: string,
  positions: { lon: number; lat: number }[],
  endpoints?: {
    teeLL: { lon: number; lat: number };
    greenLL: { lon: number; lat: number };
    primaryGreen: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }
): void {
  if (!viewer || !positions || positions.length < 2) {
    console.warn('Cannot show hole polyline: invalid viewer or positions');
    return;
  }

  // Clear existing layer first
  hideHolePolyline();

  try {
    // Convert positions to Cesium Cartesian3 array
    const cesiumPositions = positions.map(pos =>
      Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat)
    );

    // Create polyline entity
    const polylineEntity = viewer.entities.add({
      id: `hole-polyline-${holeId}`,
      polyline: {
        positions: cesiumPositions,
        width: 5,
        clampToGround: true,
        material: Cesium.Color.ORANGE.withAlpha(0.9),
        depthFailMaterial: Cesium.Color.ORANGE.withAlpha(0.9),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        extrudedHeight: 0
      }
    });

    let teeEntity = null;
    let greenEntity = null;

    // Add endpoint markers if endpoints are provided
    if (endpoints) {
      // Tee marker (blue)
      teeEntity = viewer.entities.add({
        id: `hole-tee-${holeId}`,
        position: Cesium.Cartesian3.fromDegrees(endpoints.teeLL.lon, endpoints.teeLL.lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.BLUE,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: 'TEE',
          font: '12pt sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -30),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });

      // Green marker (green)
      greenEntity = viewer.entities.add({
        id: `hole-green-${holeId}`,
        position: Cesium.Cartesian3.fromDegrees(endpoints.greenLL.lon, endpoints.greenLL.lat),
        point: {
          pixelSize: 12,
          color: Cesium.Color.GREEN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
          text: 'GREEN',
          font: '12pt sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -30),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
    }

    // Store current layer state
    currentLayer = {
      viewer,
      polylineEntity,
      teeEntity,
      greenEntity
    };

    console.log(`Hole polyline displayed for ${holeId} with ${positions.length} positions`);
  } catch (error) {
    console.error('Failed to show hole polyline:', error);
    hideHolePolyline(); // Clean up on error
  }
}

/**
 * Hide/remove hole polyline and markers
 */
export function hideHolePolyline(): void {
  if (!currentLayer) return;

  try {
    const { viewer, polylineEntity, teeEntity, greenEntity } = currentLayer;

    if (viewer && viewer.entities) {
      if (polylineEntity) {
        viewer.entities.remove(polylineEntity);
      }
      if (teeEntity) {
        viewer.entities.remove(teeEntity);
      }
      if (greenEntity) {
        viewer.entities.remove(greenEntity);
      }
    }
  } catch (error) {
    console.error('Error hiding hole polyline:', error);
  }

  currentLayer = null;
}

/**
 * Update hole polyline with new data
 */
export function updateHolePolyline(
  viewer: any,
  holeId: string,
  positions: { lon: number; lat: number }[],
  endpoints?: {
    teeLL: { lon: number; lat: number };
    greenLL: { lon: number; lat: number };
    primaryGreen: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }
): void {
  // Simply hide current and show new
  hideHolePolyline();
  showHolePolyline(viewer, holeId, positions, endpoints);
}

/**
 * Check if hole polyline layer is currently visible
 */
export function isHolePolylineVisible(): boolean {
  return currentLayer !== null;
}

/**
 * Get current hole polyline layer information
 */
export function getCurrentHolePolylineInfo(): { holeId: string } | null {
  if (!currentLayer || !currentLayer.polylineEntity) return null;
  
  const entityId = currentLayer.polylineEntity.id;
  const match = entityId.match(/^hole-polyline-(.+)$/);
  
  return match ? { holeId: match[1] } : null;
}