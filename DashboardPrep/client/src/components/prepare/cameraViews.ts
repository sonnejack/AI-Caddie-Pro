declare const window: any;
import { bearingRad } from "@/lib/geo";

const getCesium = () => (window as any).Cesium;

function fly(viewer: any, destination: any, headingRad: number, pitchRad: number, duration = 0.35) {
  const Cesium = getCesium();
  viewer.camera.flyTo({
    destination,
    orientation: { heading: Cesium.Math.zeroToTwoPi(headingRad), pitch: pitchRad, roll: 0 },
    duration
  });
}

export async function flyTeeView(
  viewer: any,
  teeLL: {lon:number; lat:number},
  pinLL: {lon:number; lat:number},
  holeLengthMeters: number
) {
  const Cesium = getCesium();
  const heading = bearingRad(teeLL.lon, teeLL.lat, pinLL.lon, pinLL.lat);
  const offsetBack = Math.max(25, Math.min(80, 0.12 * holeLengthMeters)); // behind tee
  const height = Math.max(60, Math.min(220, 0.20 * holeLengthMeters));    // above ground
  const R = 6378137.0;
  const dLat = (offsetBack * Math.cos(heading + Math.PI)) / R;
  const dLon = (offsetBack * Math.sin(heading + Math.PI)) / (R * Math.cos(teeLL.lat * Math.PI/180));
  const camLat = teeLL.lat + (dLat * 180/Math.PI);
  const camLon = teeLL.lon + (dLon * 180/Math.PI);

  // sample terrain height at cam point
  const carto = Cesium.Cartographic.fromDegrees(camLon, camLat);
  const h = viewer.scene.globe.getHeight(carto) ?? 0;
  const dest = Cesium.Cartesian3.fromDegrees(camLon, camLat, h + height);

  // look toward pin (comfortable default pitch)
  const pitch = Cesium.Math.toRadians(-20);
  fly(viewer, dest, heading, pitch, 0.35);
}

export function flyFairwayView(
  viewer: any,
  midLL: {lon:number; lat:number},
  pinLL: {lon:number; lat:number},
  teeLL: {lon:number; lat:number},
  holeLengthMeters: number
) {
  const Cesium = getCesium();
  const heading = bearingRad(midLL.lon, midLL.lat, pinLL.lon, pinLL.lat);
  const height = Math.max(40, Math.min(160, 0.14 * holeLengthMeters));
  const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(midLL.lon, midLL.lat)) ?? 0;
  const dest = Cesium.Cartesian3.fromDegrees(midLL.lon, midLL.lat, h + height);
  const pitch = Cesium.Math.toRadians(-18);
  fly(viewer, dest, heading, pitch, 0.35);
}

export function flyGreenView(
  viewer: any,
  greenCenterLL: {lon:number; lat:number},
  teeLL: {lon:number; lat:number}
) {
  const Cesium = getCesium();
  // Heading so that "front" of green (from tee) is at bottom of screen
  const heading = bearingRad(teeLL.lon, teeLL.lat, greenCenterLL.lon, greenCenterLL.lat);
  const h = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(greenCenterLL.lon, greenCenterLL.lat)) ?? 0;
  const dest = Cesium.Cartesian3.fromDegrees(greenCenterLL.lon, greenCenterLL.lat, h + 120); // top-down altitude
  const pitch = Cesium.Math.toRadians(-90); // straight down
  fly(viewer, dest, heading, pitch, 0.35);
}

export async function flyShotPOVView(
  viewer: any,
  startLL: {lon:number; lat:number},
  aimLL: {lon:number; lat:number}
) {
  const Cesium = getCesium();
  
  // Calculate heading from start to aim point
  const heading = bearingRad(startLL.lon, startLL.lat, aimLL.lon, aimLL.lat);
  
  // Calculate camera position 20 meters behind start position
  const offsetBack = 20; // 20 meters behind the start position
  const R = 6378137.0; // Earth radius in meters
  const dLat = (offsetBack * Math.cos(heading + Math.PI)) / R;
  const dLon = (offsetBack * Math.sin(heading + Math.PI)) / (R * Math.cos(startLL.lat * Math.PI/180));
  const cameraLat = startLL.lat + (dLat * 180/Math.PI);
  const cameraLon = startLL.lon + (dLon * 180/Math.PI);
  
  // Get terrain height at camera position using detailed terrain sampling
  let terrainHeight = 0;
  try {
    const [sample] = await Cesium.sampleTerrainMostDetailed(
      viewer.terrainProvider,
      [Cesium.Cartographic.fromDegrees(cameraLon, cameraLat)]
    );
    terrainHeight = sample.height || 0;
  } catch (e) {
    console.warn('terrain sample failed for Shot POV', e);
    // Fallback to globe height if detailed sampling fails
    terrainHeight = viewer.scene.globe.getHeight(Cesium.Cartographic.fromDegrees(cameraLon, cameraLat)) ?? 0;
  }
  
  // Position camera 6 meters above terrain at camera position (eye level)
  const cameraHeight = terrainHeight + 6;
  
  // Set camera to view from 20m behind start position towards aim point
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(cameraLon, cameraLat, cameraHeight),
    orientation: {
      heading: heading,  // Look towards aim point
      pitch: Cesium.Math.toRadians(-2),  // Look 2 degrees down
      roll: 0  // No roll
    },
    duration: 1.0
  });
}