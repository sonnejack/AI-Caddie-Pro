import type { LatLon } from '@shared/types';
import type { MaskBuffer } from '@/lib/maskBuffer';

interface HoleFeature {
  type: 'tee' | 'green' | 'fairway' | 'bunker' | 'water' | 'recovery' | 'rough';
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
}

/**
 * Calculate distance between two lat/lon points in yards
 */
export function calculateDistance(p1: LatLon, p2: LatLon): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1.09361; // Convert to yards
}

/**
 * Calculate bearing from one point to another in radians
 */
export function calculateBearing(from: LatLon, to: LatLon): number {
  const dLon = (to.lon - from.lon) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  return Math.atan2(y, x);
}

/**
 * Find the centroid of a polygon
 */
export function calculatePolygonCentroid(coordinates: number[][][]): LatLon {
  let totalLat = 0;
  let totalLon = 0;
  let pointCount = 0;
  
  // Handle multi-ring polygons by using the first (outer) ring
  const ring = coordinates[0];
  
  for (const coord of ring) {
    totalLon += coord[0];
    totalLat += coord[1];
    pointCount++;
  }
  
  return {
    lat: totalLat / pointCount,
    lon: totalLon / pointCount
  };
}

/**
 * Find green features and calculate their centroid
 */
export function findGreenCentroid(features: HoleFeature[]): LatLon | null {
  const greenFeatures = features.filter(f => f.type === 'green');
  
  if (greenFeatures.length === 0) return null;
  
  // If multiple greens, find the largest one
  let largestGreen = greenFeatures[0];
  let largestArea = 0;
  
  for (const green of greenFeatures) {
    if (green.geometry.type === 'Polygon' || green.geometry.type === 'MultiPolygon') {
      // Rough area calculation - count coordinate points
      const coords = green.geometry.type === 'Polygon' 
        ? green.geometry.coordinates 
        : green.geometry.coordinates[0];
      
      const area = coords[0].length; // Simple approximation
      if (area > largestArea) {
        largestArea = area;
        largestGreen = green;
      }
    }
  }
  
  if (largestGreen.geometry.type === 'Polygon') {
    return calculatePolygonCentroid(largestGreen.geometry.coordinates);
  } else if (largestGreen.geometry.type === 'MultiPolygon') {
    return calculatePolygonCentroid(largestGreen.geometry.coordinates[0]);
  }
  
  return null;
}

/**
 * Find fairway polyline endpoints to determine tee and green ends
 */
export function findFairwayEndpoints(features: HoleFeature[]): { start: LatLon | null, end: LatLon | null } {
  const fairwayFeatures = features.filter(f => f.type === 'fairway');
  
  if (fairwayFeatures.length === 0) {
    return { start: null, end: null };
  }
  
  // Find the longest fairway feature (main playing line)
  let longestFairway = fairwayFeatures[0];
  let longestLength = 0;
  
  for (const fairway of fairwayFeatures) {
    if (fairway.geometry.type === 'LineString') {
      const length = fairway.geometry.coordinates.length;
      if (length > longestLength) {
        longestLength = length;
        longestFairway = fairway;
      }
    } else if (fairway.geometry.type === 'Polygon') {
      // For polygon fairways, approximate as the diagonal
      const coords = fairway.geometry.coordinates[0];
      if (coords.length > longestLength) {
        longestLength = coords.length;
        longestFairway = fairway;
      }
    }
  }
  
  if (longestFairway.geometry.type === 'LineString') {
    const coords = longestFairway.geometry.coordinates;
    return {
      start: { lon: coords[0][0], lat: coords[0][1] },
      end: { lon: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] }
    };
  } else if (longestFairway.geometry.type === 'Polygon') {
    // For polygons, find the two farthest points
    const coords = longestFairway.geometry.coordinates[0];
    let maxDistance = 0;
    let startPoint = coords[0];
    let endPoint = coords[0];
    
    for (let i = 0; i < coords.length; i++) {
      for (let j = i + 1; j < coords.length; j++) {
        const p1 = { lon: coords[i][0], lat: coords[i][1] };
        const p2 = { lon: coords[j][0], lat: coords[j][1] };
        const distance = calculateDistance(p1, p2);
        
        if (distance > maxDistance) {
          maxDistance = distance;
          startPoint = coords[i];
          endPoint = coords[j];
        }
      }
    }
    
    return {
      start: { lon: startPoint[0], lat: startPoint[1] },
      end: { lon: endPoint[0], lat: endPoint[1] }
    };
  }
  
  return { start: null, end: null };
}

/**
 * Calculate distance along a polyline path from start to a point
 */
export function distanceAlongPolyline(polyline: LatLon[], targetPoint: LatLon): number {
  if (polyline.length < 2) return 0;
  
  let totalDistance = 0;
  let closestDistance = Infinity;
  let distanceToClosest = 0;
  
  // Find the closest segment and calculate distance along path
  for (let i = 0; i < polyline.length - 1; i++) {
    const segmentStart = polyline[i];
    const segmentEnd = polyline[i + 1];
    
    // Distance from target point to this segment
    const distanceToSegment = pointToSegmentDistance(targetPoint, segmentStart, segmentEnd);
    
    if (distanceToSegment < closestDistance) {
      closestDistance = distanceToSegment;
      // Calculate how far along this segment the closest point is
      const segmentLength = calculateDistance(segmentStart, segmentEnd);
      const projectionFactor = calculateProjectionFactor(targetPoint, segmentStart, segmentEnd);
      distanceToClosest = totalDistance + (segmentLength * Math.max(0, Math.min(1, projectionFactor)));
    }
    
    totalDistance += calculateDistance(segmentStart, segmentEnd);
  }
  
  return distanceToClosest;
}

/**
 * Calculate the distance from a point to a line segment
 */
function pointToSegmentDistance(point: LatLon, segmentStart: LatLon, segmentEnd: LatLon): number {
  const A = calculateDistance(point, segmentStart);
  const B = calculateDistance(point, segmentEnd);
  const C = calculateDistance(segmentStart, segmentEnd);
  
  if (C === 0) return A; // Degenerate segment
  
  // Use the cross track distance formula
  const s = (A + B + C) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - A) * (s - B) * (s - C)));
  return (2 * area) / C;
}

/**
 * Calculate how far along a segment (0-1) the closest point to target lies
 */
function calculateProjectionFactor(point: LatLon, segmentStart: LatLon, segmentEnd: LatLon): number {
  const dx = segmentEnd.lon - segmentStart.lon;
  const dy = segmentEnd.lat - segmentStart.lat;
  
  if (dx === 0 && dy === 0) return 0;
  
  const t = ((point.lon - segmentStart.lon) * dx + (point.lat - segmentStart.lat) * dy) / (dx * dx + dy * dy);
  return t;
}

/**
 * Auto-set hole navigation points based on features
 */
export function autoSetHolePoints(features: HoleFeature[]): {
  start: LatLon | null;
  aim: LatLon | null;
  pin: LatLon | null;
} {
  const fairwayEndpoints = findFairwayEndpoints(features);
  const greenCentroid = findGreenCentroid(features);
  
  // Find tee features for start position
  const teeFeatures = features.filter(f => f.type === 'tee');
  let startPosition = fairwayEndpoints.start;
  
  if (teeFeatures.length > 0) {
    const tee = teeFeatures[0];
    if (tee.geometry.type === 'Point') {
      startPosition = { lon: tee.geometry.coordinates[0], lat: tee.geometry.coordinates[1] };
    } else if (tee.geometry.type === 'Polygon') {
      startPosition = calculatePolygonCentroid(tee.geometry.coordinates);
    }
  }
  
  // Use green centroid as pin, fairway end as aim point
  let aimPosition = fairwayEndpoints.end;
  let pinPosition = greenCentroid;
  
  // If no specific green found, use aim position as pin
  if (!pinPosition && aimPosition) {
    pinPosition = aimPosition;
  }
  
  // If no fairway endpoints, try to use positions relative to green
  if (!aimPosition && pinPosition) {
    // Set aim point slightly before the green (rough approximation)
    aimPosition = pinPosition;
  }
  
  return {
    start: startPosition,
    aim: aimPosition,
    pin: pinPosition
  };
}

/**
 * Calculate optimal camera position for hole view
 */
export function calculateHoleCameraPosition(start: LatLon | null, pin: LatLon | null): {
  position: LatLon;
  heading: number;
  pitch: number;
  height: number;
} | null {
  if (!start || !pin) return null;
  
  // Calculate midpoint between start and pin
  const midLat = (start.lat + pin.lat) / 2;
  const midLon = (start.lon + pin.lon) / 2;
  
  // Calculate distance for appropriate height
  const holeLength = calculateDistance(start, pin);
  const height = Math.max(100, holeLength * 0.8); // Height proportional to hole length
  
  // Calculate bearing from start to pin for camera heading
  const bearing = calculateBearing(start, pin);
  
  // Position camera slightly behind the start position
  const behindDistance = holeLength * 0.1; // 10% of hole length behind start
  const behindLat = start.lat - (behindDistance / 111000) * Math.cos(bearing + Math.PI);
  const behindLon = start.lon - (behindDistance / (111000 * Math.cos(start.lat * Math.PI / 180))) * Math.sin(bearing + Math.PI);
  
  return {
    position: { lat: behindLat, lon: behindLon },
    heading: bearing, // Look toward the pin
    pitch: -0.3, // Slightly downward angle
    height
  };
}