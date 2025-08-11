export interface MaskBakingConfig {
  holeId: string;
  width: number;
  height: number;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export interface ClassId {
  FAIRWAY: 1;
  GREEN: 2;
  TEE: 3;
  BUNKER: 4;
  ROUGH: 5;
  WATER: 6;
  TREES: 7;
  CART_PATH: 8;
}

export const CLASS_IDS: ClassId = {
  FAIRWAY: 1,
  GREEN: 2,
  TEE: 3,
  BUNKER: 4,
  ROUGH: 5,
  WATER: 6,
  TREES: 7,
  CART_PATH: 8,
};

export class MaskBaker {
  async bakeMask(config: MaskBakingConfig): Promise<{
    palettePngUrl: string;
    slopePngUrl: string;
    paletteVersion: number;
  }> {
    // Placeholder implementation
    // In a real system, this would:
    // 1. Rasterize OSM features to a bitmap
    // 2. Apply palette colors based on feature types
    // 3. Generate slope data from elevation
    // 4. Upload to cloud storage
    // 5. Return URLs
    
    const baseUrl = `https://storage.example.com/masks/${config.holeId}`;
    
    return {
      palettePngUrl: `${baseUrl}/palette_v1.png`,
      slopePngUrl: `${baseUrl}/slope_v1.png`,
      paletteVersion: 1,
    };
  }
  
  getClassColor(classId: number): [number, number, number] {
    const colors: Record<number, [number, number, number]> = {
      [CLASS_IDS.FAIRWAY]: [34, 139, 34],   // Forest Green
      [CLASS_IDS.GREEN]: [0, 100, 0],       // Dark Green  
      [CLASS_IDS.TEE]: [50, 205, 50],       // Lime Green
      [CLASS_IDS.BUNKER]: [238, 203, 173],  // Bisque
      [CLASS_IDS.ROUGH]: [107, 142, 35],    // Olive Drab
      [CLASS_IDS.WATER]: [0, 191, 255],     // Deep Sky Blue
      [CLASS_IDS.TREES]: [0, 100, 0],       // Dark Green
      [CLASS_IDS.CART_PATH]: [105, 105, 105], // Dim Gray
    };
    
    return colors[classId] || [128, 128, 128]; // Default gray
  }
}

export const maskBaker = new MaskBaker();