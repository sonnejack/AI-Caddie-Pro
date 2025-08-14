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