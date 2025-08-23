import { z } from 'zod';
import { RASTER_VERSIONS } from '@shared/constants';

// Input validation schemas with safeguards

export const polygonGeometrySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(
    z.array(
      z.tuple([z.number(), z.number()]) // [lon, lat]
    ).max(RASTER_VERSIONS.MAX_POLYGON_VERTICES, 'Polygon has too many vertices')
  )
});

export const userPolygonInputSchema = z.object({
  condition: z.enum(['green', 'fairway', 'tee', 'bunker', 'water', 'hazard', 'ob', 'recovery', 'rough']),
  coordinates: z.array(
    z.object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180)
    })
  ).max(RASTER_VERSIONS.MAX_POLYGON_VERTICES, 'Too many vertices in polygon')
});

export const bboxSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90), 
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90)
}).refine(data => data.east > data.west, {
  message: "East must be greater than west"
}).refine(data => data.north > data.south, {
  message: "North must be greater than south"
}).refine(data => {
  // Prevent massive bounding boxes that could cause memory issues
  const width = data.east - data.west;
  const height = data.north - data.south;
  return width <= 1.0 && height <= 1.0; // Max 1 degree in each direction
}, {
  message: "Bounding box too large"
});

export const rebakeRequestSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  baseFeatures: z.object({
    greens: z.object({ type: z.literal('FeatureCollection'), features: z.array(z.any()) }),
    fairways: z.object({ type: z.literal('FeatureCollection'), features: z.array(z.any()) }),
    bunkers: z.object({ type: z.literal('FeatureCollection'), features: z.array(z.any()) }),
    water: z.object({ type: z.literal('FeatureCollection'), features: z.array(z.any()) }),
    tees: z.object({ type: z.literal('FeatureCollection'), features: z.array(z.any()) }).optional()
  }),
  userPolygons: z.array(userPolygonInputSchema)
    .max(RASTER_VERSIONS.MAX_POLYGONS_PER_COURSE, 'Too many polygons per course'),
  bbox: bboxSchema,
  courseName: z.string().min(1).max(100, 'Course name too long')
});

// Safeguard utilities

export function validatePolygonComplexity(coordinates: Array<{lat: number, lon: number}>): void {
  if (coordinates.length > RASTER_VERSIONS.MAX_POLYGON_VERTICES) {
    throw new Error(`Polygon has ${coordinates.length} vertices, maximum is ${RASTER_VERSIONS.MAX_POLYGON_VERTICES}`);
  }
  
  // Check for self-intersecting polygons (basic check)
  if (coordinates.length >= 4) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    const tolerance = 0.000001;
    
    if (Math.abs(first.lat - last.lat) > tolerance || Math.abs(first.lon - last.lon) > tolerance) {
      // Auto-close if not closed
      coordinates.push(first);
    }
  }
}

export function validateBboxSize(bbox: {west: number, south: number, east: number, north: number}): void {
  const width = bbox.east - bbox.west;
  const height = bbox.north - bbox.south;
  
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid bounding box: width and height must be positive');
  }
  
  if (width > 1.0 || height > 1.0) {
    throw new Error('Bounding box too large: maximum 1 degree in each direction');
  }
  
  // Estimate resulting raster size to prevent memory issues
  const estimatedWidth = width * 10000; // Rough pixels estimate
  const estimatedHeight = height * 10000;
  
  if (estimatedWidth > RASTER_VERSIONS.MAX_RASTER_WIDTH || estimatedHeight > RASTER_VERSIONS.MAX_RASTER_HEIGHT) {
    throw new Error(`Estimated raster size ${estimatedWidth}x${estimatedHeight} exceeds maximum ${RASTER_VERSIONS.MAX_RASTER_WIDTH}x${RASTER_VERSIONS.MAX_RASTER_HEIGHT}`);
  }
}

export function sanitizeCoordinates(coordinates: Array<{lat: number, lon: number}>): Array<{lat: number, lon: number}> {
  return coordinates
    .filter(coord => 
      !isNaN(coord.lat) && 
      !isNaN(coord.lon) &&
      coord.lat >= -90 && coord.lat <= 90 &&
      coord.lon >= -180 && coord.lon <= 180
    )
    .slice(0, RASTER_VERSIONS.MAX_POLYGON_VERTICES);
}