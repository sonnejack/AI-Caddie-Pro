// Version constants for raster generation
// Increment these when changing mask generation logic to ensure compatibility

export const RASTER_VERSIONS = {
  // Class map version - increment when class IDs or rules change
  CLASS_MAP_VERSION: 1,
  
  // Smoothing version - increment when rasterization algorithm changes  
  SMOOTHING_VERSION: 1,
  
  // Maximum raster dimensions to prevent memory issues
  MAX_RASTER_WIDTH: 4096,
  MAX_RASTER_HEIGHT: 4096,
  
  // Maximum polygon complexity to prevent DoS
  MAX_POLYGON_VERTICES: 1000,
  MAX_POLYGONS_PER_COURSE: 100,
  
  // Storage and caching settings
  SIGNED_URL_EXPIRY: 3600, // 1 hour
  DRAFT_RETENTION_COUNT: 5, // Keep last 5 drafts per course
} as const;

// Class ID mappings for mask generation
export const CLASS_IDS = {
  UNKNOWN: 0,
  OB: 1,
  WATER: 2, 
  HAZARD: 3,
  BUNKER: 4,
  GREEN: 5,
  FAIRWAY: 6,
  RECOVERY: 7,
  ROUGH: 8,
  TEE: 9
} as const;

// Condition name to class ID mapping
export const CONDITION_TO_CLASS: Record<string, number> = {
  'unknown': CLASS_IDS.UNKNOWN,
  'ob': CLASS_IDS.OB,
  'water': CLASS_IDS.WATER,
  'hazard': CLASS_IDS.HAZARD,
  'bunker': CLASS_IDS.BUNKER,
  'green': CLASS_IDS.GREEN,
  'fairway': CLASS_IDS.FAIRWAY,
  'recovery': CLASS_IDS.RECOVERY,
  'rough': CLASS_IDS.ROUGH,
  'tee': CLASS_IDS.TEE
} as const;