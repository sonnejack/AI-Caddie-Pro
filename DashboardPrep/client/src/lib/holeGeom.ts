import type { LatLon } from '@shared/types';

declare const Cesium: any;

export interface HolePolyline {
  holeId: string;
  positions: { lon: number; lat: number }[];
  ref?: string | number;
}

export interface Endpoints {
  teeLL: { lon: number; lat: number };
  greenLL: { lon: number; lat: number };
  primaryGreen: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/**
 * Validate hole polyline data
 * Throws error if invalid or missing
 */
export function validateHolePolyline(hp: any): asserts hp is HolePolyline {
  if (!hp || typeof hp !== 'object') {
    throw {
      code: 'MISSING_HOLE_POLYLINE',
      holeId: hp?.holeId || 'unknown',
      message: 'Hole polyline data is missing or invalid'
    };
  }

  if (!hp.holeId || typeof hp.holeId !== 'string') {
    throw {
      code: 'MISSING_HOLE_POLYLINE',
      holeId: hp.holeId || 'unknown',
      message: 'Hole polyline missing valid holeId'
    };
  }

  if (!hp.positions || !Array.isArray(hp.positions) || hp.positions.length < 2) {
    throw {
      code: 'MISSING_HOLE_POLYLINE',
      holeId: hp.holeId,
      message: `Hole polyline for ${hp.holeId} has insufficient positions (need >=2, got ${hp.positions?.length || 0})`
    };
  }

  // Validate each position
  for (let i = 0; i < hp.positions.length; i++) {
    const pos = hp.positions[i];
    if (
      !pos ||
      typeof pos.lon !== 'number' ||
      typeof pos.lat !== 'number' ||
      !isFinite(pos.lon) ||
      !isFinite(pos.lat)
    ) {
      throw {
        code: 'MISSING_HOLE_POLYLINE',
        holeId: hp.holeId,
        message: `Hole polyline for ${hp.holeId} has invalid position at index ${i}: ${JSON.stringify(pos)}`
      };
    }
  }
}

/**
 * Calculate centroid of a polygon (handles Polygon and MultiPolygon)
 */
export function centroidOfPolygon(poly: GeoJSON.Polygon | GeoJSON.MultiPolygon): { lon: number; lat: number } {
  if (poly.type === 'Polygon') {
    return centroidOfRing(poly.coordinates[0]);
  } else if (poly.type === 'MultiPolygon') {
    // Use the largest polygon in the multipolygon
    let largestRing = poly.coordinates[0][0];
    let largestArea = 0;
    
    for (const polygon of poly.coordinates) {
      const ring = polygon[0];
      const area = calculateRingArea(ring);
      if (area > largestArea) {
        largestArea = area;
        largestRing = ring;
      }
    }
    
    return centroidOfRing(largestRing);
  }
  
  throw new Error(`Unsupported polygon type: ${(poly as any).type}`);
}

/**
 * Calculate centroid of a ring (array of coordinates)
 */
function centroidOfRing(ring: number[][]): { lon: number; lat: number } {
  let totalLon = 0;
  let totalLat = 0;
  let count = 0;
  
  // Skip last coordinate if it duplicates the first (closed ring)
  const endIndex = ring.length > 1 && 
    ring[0][0] === ring[ring.length - 1][0] && 
    ring[0][1] === ring[ring.length - 1][1] 
    ? ring.length - 1 
    : ring.length;
  
  for (let i = 0; i < endIndex; i++) {
    totalLon += ring[i][0];
    totalLat += ring[i][1];
    count++;
  }
  
  return {
    lon: totalLon / count,
    lat: totalLat / count
  };
}

/**
 * Calculate approximate area of a ring (for comparison)
 */
function calculateRingArea(ring: number[][]): number {
  if (ring.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const j = (i + 1) % ring.length;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  
  return Math.abs(area) / 2;
}

/**
 * Find the largest polygon by area in a feature collection
 */
export function largestPolygonByArea(fc: GeoJSON.FeatureCollection): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!fc.features || fc.features.length === 0) return null;
  
  let largestPoly: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
  let largestArea = 0;
  
  for (const feature of fc.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const area = calculatePolygonArea(feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
      if (area > largestArea) {
        largestArea = area;
        largestPoly = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
      }
    }
  }
  
  return largestPoly;
}

/**
 * Calculate area of polygon
 */
function calculatePolygonArea(poly: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  if (poly.type === 'Polygon') {
    return calculateRingArea(poly.coordinates[0]);
  } else if (poly.type === 'MultiPolygon') {
    let totalArea = 0;
    for (const polygon of poly.coordinates) {
      totalArea += calculateRingArea(polygon[0]);
    }
    return totalArea;
  }
  return 0;
}

/**
 * Calculate total length of polyline in yards
 */
export function polylineLengthYds(positions: { lon: number; lat: number }[]): number {
  if (positions.length < 2) return 0;
  
  let totalDistance = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    totalDistance += distanceYards(positions[i], positions[i + 1]);
  }
  
  return totalDistance;
}

/**
 * Get point at specific distance along polyline (in yards from start)
 */
export function pointAlongPolylineYds(
  positions: { lon: number; lat: number }[], 
  distanceYds: number
): { lon: number; lat: number } {
  if (positions.length === 0) {
    throw new Error('Cannot get point along empty polyline');
  }
  
  if (positions.length === 1 || distanceYds <= 0) {
    return positions[0];
  }
  
  let remainingDistance = distanceYds;
  
  for (let i = 0; i < positions.length - 1; i++) {
    const segmentStart = positions[i];
    const segmentEnd = positions[i + 1];
    const segmentLength = distanceYards(segmentStart, segmentEnd);
    
    if (remainingDistance <= segmentLength) {
      // Point lies within this segment
      const ratio = remainingDistance / segmentLength;
      return {
        lon: segmentStart.lon + (segmentEnd.lon - segmentStart.lon) * ratio,
        lat: segmentStart.lat + (segmentEnd.lat - segmentStart.lat) * ratio
      };
    }
    
    remainingDistance -= segmentLength;
  }
  
  // Distance exceeds polyline length, return end point
  return positions[positions.length - 1];
}

/**
 * Great-circle bearing in degrees from (lon1,lat1) to (lon2,lat2)
 */
export function bearingDeg(lon1:number, lat1:number, lon2:number, lat2:number): number {
  const λ1 = lon1 * Math.PI/180, φ1 = lat1 * Math.PI/180;
  const λ2 = lon2 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const θ = Math.atan2(y, x) * 180/Math.PI;
  return (θ + 360) % 360;
}

/**
 * Move from lon/lat by distance (m) along bearing (deg) -> new lon/lat
 */
export function offsetLL(lon:number, lat:number, distMeters:number, bearingDeg:number) {
  const R = 6378137; // WGS84
  const br = bearingDeg * Math.PI/180;
  const φ1 = lat * Math.PI/180, λ1 = lon * Math.PI/180;
  const δ = distMeters / R;
  const φ2 = Math.asin(Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(br));
  const λ2 = λ1 + Math.atan2(Math.sin(br)*Math.sin(δ)*Math.cos(φ1),
                              Math.cos(δ) - Math.sin(φ1)*Math.sin(φ2));
  return { lon: λ2*180/Math.PI, lat: φ2*180/Math.PI };
}

/**
 * Midpoint along a linestring by cumulative distance
 */
export function midpointAlong(poly: Array<{lon:number;lat:number}>): {lon:number;lat:number} {
  if (poly.length < 2) return poly[0] || { lon: 0, lat: 0 };
  
  // Calculate total length in meters
  let totalLength = 0;
  const segmentLengths: number[] = [];
  
  for (let i = 0; i < poly.length - 1; i++) {
    const segLen = distanceMeters(poly[i], poly[i + 1]);
    segmentLengths.push(segLen);
    totalLength += segLen;
  }
  
  // Find midpoint distance
  const halfLength = totalLength / 2;
  let accumulatedLength = 0;
  
  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    
    if (accumulatedLength + segmentLength >= halfLength) {
      // Midpoint is in this segment
      const remainingDistance = halfLength - accumulatedLength;
      const ratio = remainingDistance / segmentLength;
      
      const start = poly[i];
      const end = poly[i + 1];
      
      return {
        lon: start.lon + (end.lon - start.lon) * ratio,
        lat: start.lat + (end.lat - start.lat) * ratio
      };
    }
    
    accumulatedLength += segmentLength;
  }
  
  // Fallback to last point
  return poly[poly.length - 1];
}

/**
 * Hole length in meters
 */
export function holeLengthMeters(poly: Array<{lon:number;lat:number}>): number {
  if (poly.length < 2) return 0;
  
  let totalLength = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    totalLength += distanceMeters(poly[i], poly[i + 1]);
  }
  
  return totalLength;
}

/**
 * Largest green centroid (already available in your green matching)
 */
export function greenCentroid(green: GeoJSON.Polygon|GeoJSON.MultiPolygon): {lon:number;lat:number} {
  return centroidOfPolygon(green);
}

/**
 * Estimate green radius in meters from polygon area
 */
export function greenRadiusMeters(green: GeoJSON.Polygon|GeoJSON.MultiPolygon): number {
  const area = calculatePolygonArea(green);
  // Assume circular area: A = πr², so r = √(A/π)
  // Convert from degree² to approximate meters² using rough conversion
  const areaM2 = area * 111320 * 111320; // very rough conversion
  const radius = Math.sqrt(areaM2 / Math.PI);
  
  // Clamp to reasonable green size (5-50 meters)
  return Math.min(50, Math.max(5, radius));
}

/**
 * Calculate distance between two points in meters using Cesium geodesic
 */
function distanceMeters(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const geodesic = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(a.lon, a.lat),
    Cesium.Cartographic.fromDegrees(b.lon, b.lat)
  );
  
  return geodesic.surfaceDistance; // meters
}

/**
 * Calculate distance between two points in yards using Cesium geodesic
 */
function distanceYards(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  return distanceMeters(a, b) * 1.09361; // meters to yards
}

/**
 * Calculate distance from point to all polygon centroids, return minimum
 */
function minDistanceToPolygonCentroids(
  point: { lon: number; lat: number },
  fc: GeoJSON.FeatureCollection
): number {
  if (!fc.features || fc.features.length === 0) return Infinity;
  
  let minDistance = Infinity;
  
  for (const feature of fc.features) {
    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
      const centroid = centroidOfPolygon(feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon);
      const distance = distanceYards(point, centroid);
      minDistance = Math.min(minDistance, distance);
    }
  }
  
  return minDistance;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
function pointInPolygon(point: { lon: number; lat: number }, polygon: number[][]): boolean {
  const x = point.lon;
  const y = point.lat;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Find which green polygon contains the given point
 */
export function findGreenContainingPoint(
  point: { lon: number; lat: number },
  greensFC: GeoJSON.FeatureCollection
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!greensFC.features || greensFC.features.length === 0) return null;

  for (const feature of greensFC.features) {
    if (feature.geometry.type === 'Polygon') {
      const polygon = feature.geometry as GeoJSON.Polygon;
      // Check the outer ring
      if (pointInPolygon(point, polygon.coordinates[0])) {
        return polygon;
      }
    } else if (feature.geometry.type === 'MultiPolygon') {
      const multiPolygon = feature.geometry as GeoJSON.MultiPolygon;
      for (const polygonCoords of multiPolygon.coordinates) {
        // Check the outer ring of each polygon
        if (pointInPolygon(point, polygonCoords[0])) {
          return multiPolygon;
        }
      }
    }
  }

  return null;
}

/**
 * Assign endpoints of hole polyline to tee and green based on proximity
 */
export function assignEndpoints(
  holePolyline: { positions: { lon: number; lat: number }[] },
  teesFC: GeoJSON.FeatureCollection,
  greensFC: GeoJSON.FeatureCollection
): Endpoints {
  const positions = holePolyline.positions;
  
  if (positions.length < 2) {
    throw {
      code: 'MISSING_HOLE_POLYLINE',
      holeId: 'unknown',
      message: 'Hole polyline must have at least 2 positions'
    };
  }
  
  // Get primary green (largest by area)
  const primaryGreen = largestPolygonByArea(greensFC);
  if (!primaryGreen) {
    throw {
      code: 'MISSING_FEATURES',
      missing: ['greens'],
      holeId: 'unknown',
      message: 'No green polygons found for hole'
    };
  }
  
  if (!teesFC.features || teesFC.features.length === 0) {
    throw {
      code: 'MISSING_FEATURES',
      missing: ['tees'],
      holeId: 'unknown',
      message: 'No tee polygons found for hole'
    };
  }
  
  const e0 = positions[0];
  const e1 = positions[positions.length - 1];
  
  // Calculate distances to tees and greens
  const e0_dTee = minDistanceToPolygonCentroids(e0, teesFC);
  const e0_dGreen = minDistanceToPolygonCentroids(e0, greensFC);
  const e1_dTee = minDistanceToPolygonCentroids(e1, teesFC);
  const e1_dGreen = minDistanceToPolygonCentroids(e1, greensFC);
  
  let teeEndpoint: { lon: number; lat: number };
  let greenEndpoint: { lon: number; lat: number };
  
  // Assign based on minimum distances
  if (e0_dTee < e1_dTee) {
    // E0 is closer to tees
    teeEndpoint = e0;
    greenEndpoint = e1;
  } else if (e1_dTee < e0_dTee) {
    // E1 is closer to tees
    teeEndpoint = e1;
    greenEndpoint = e0;
  } else {
    // Tie-breaker: assign endpoint closer to primary green as green endpoint
    const primaryGreenCentroid = centroidOfPolygon(primaryGreen);
    const e0_dPrimaryGreen = distanceYards(e0, primaryGreenCentroid);
    const e1_dPrimaryGreen = distanceYards(e1, primaryGreenCentroid);
    
    if (e0_dPrimaryGreen < e1_dPrimaryGreen) {
      teeEndpoint = e1;
      greenEndpoint = e0;
    } else if (e1_dPrimaryGreen < e0_dPrimaryGreen) {
      teeEndpoint = e0;
      greenEndpoint = e1;
    } else {
      // Final tie-breaker: bearing to primary green
      const e0_bearing = Math.abs(bearingDeg(e0.lon, e0.lat, primaryGreenCentroid.lon, primaryGreenCentroid.lat));
      const e1_bearing = Math.abs(bearingDeg(e1.lon, e1.lat, primaryGreenCentroid.lon, primaryGreenCentroid.lat));
      
      if (e0_bearing < e1_bearing) {
        teeEndpoint = e1;
        greenEndpoint = e0;
      } else {
        teeEndpoint = e0;
        greenEndpoint = e1;
      }
    }
  }
  
  return {
    teeLL: teeEndpoint,
    greenLL: greenEndpoint,
    primaryGreen
  };
}