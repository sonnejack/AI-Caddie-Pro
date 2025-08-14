// client/src/lib/geo.ts
// Geographic utility functions

export function bearingRad(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const Δλ = (lon2 - lon1) * Math.PI/180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return Math.atan2(y, x); // -π..π, 0=east, CCW positive
}

export function bearingDeg(lon1: number, lat1: number, lon2: number, lat2: number): number {
  return bearingRad(lon1, lat1, lon2, lat2) * 180 / Math.PI;
}