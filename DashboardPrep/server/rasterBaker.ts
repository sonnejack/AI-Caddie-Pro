import { createHash } from "crypto";
import { randomUUID } from "crypto";
import type { ImportResponse } from "@shared/overpass";
import type { CourseRasterVersion } from "@shared/schema";
import { RASTER_VERSIONS, CLASS_IDS, CONDITION_TO_CLASS } from "@shared/constants";

export interface ServerRasterMetadata {
  courseId: string;
  courseName: string;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  contributorId: string;
}

export interface ServerUserPolygon {
  condition: string;
  coordinates: Array<{ lat: number; lon: number }>;
}

export interface ServerMaskBuffer {
  width: number;
  height: number;
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  data: Uint8Array; // Class IDs
}

export class ServerRasterBaker {
  
  // Create raster version from base features + user polygons on server
  async createRasterVersion(
    metadata: ServerRasterMetadata,
    baseFeatures: ImportResponse['features'],
    userPolygons: ServerUserPolygon[]
  ): Promise<{ versionId: string; rasterData: ServerMaskBuffer; checksum: string }> {
    console.log('🎨 Server-side raster baking for course:', metadata.courseId);
    
    // Server-side mask creation (deterministic)
    const mask = this.createMaskFromFeatures(baseFeatures, metadata.bbox);
    const enhancedMask = this.applyUserPolygonsToMask(mask, userPolygons);
    
    // Generate version ID and checksum
    const versionId = randomUUID();
    const checksum = this.calculateChecksum(enhancedMask.data);
    
    console.log('✅ Server-side raster baking complete:', {
      versionId,
      dimensions: `${enhancedMask.width}x${enhancedMask.height}`,
      checksum: checksum.substring(0, 8) + '...'
    });
    
    return {
      versionId,
      rasterData: enhancedMask,
      checksum
    };
  }
  
  // Server-side deterministic mask creation
  private createMaskFromFeatures(
    features: ImportResponse['features'],
    bbox: { west: number; south: number; east: number; north: number }
  ): ServerMaskBuffer {
    // Deterministic dimensions calculation with safety limits
    const aspectRatio = (bbox.east - bbox.west) / (bbox.north - bbox.south);
    const maxDim = Math.min(RASTER_VERSIONS.MAX_RASTER_WIDTH, 1024); // Start conservative
    let width: number, height: number;
    
    if (aspectRatio > 1) {
      width = maxDim;
      height = Math.round(maxDim / aspectRatio);
    } else {
      height = maxDim;
      width = Math.round(maxDim * aspectRatio);
    }
    
    // Ensure dimensions are valid
    width = Math.max(1, Math.min(width, maxDim));
    height = Math.max(1, Math.min(height, maxDim));
    
    console.log(`🎨 Server mask dimensions: ${width}x${height}, aspect: ${aspectRatio.toFixed(4)}`);
    
    // Create mask buffer (initialize to rough/unknown = 0)
    const data = new Uint8Array(width * height);
    data.fill(0); // All pixels start as rough
    
    // Paint features in order (water, bunkers, greens, fairways, tees) using constants
    this.paintFeatureCollection(data, width, height, bbox, features.water, CLASS_IDS.WATER);
    this.paintFeatureCollection(data, width, height, bbox, features.bunkers, CLASS_IDS.BUNKER);
    this.paintFeatureCollection(data, width, height, bbox, features.greens, CLASS_IDS.GREEN);
    this.paintFeatureCollection(data, width, height, bbox, features.fairways, CLASS_IDS.FAIRWAY);
    
    if (features.tees) {
      this.paintFeatureCollection(data, width, height, bbox, features.tees, CLASS_IDS.TEE);
    }
    
    return {
      width,
      height,
      bbox,
      data
    };
  }
  
  // Apply user polygons to existing mask
  private applyUserPolygonsToMask(
    baseMask: ServerMaskBuffer,
    userPolygons: ServerUserPolygon[]
  ): ServerMaskBuffer {
    if (userPolygons.length === 0) {
      return baseMask;
    }
    
    console.log(`🎨 Applying ${userPolygons.length} user polygons to server mask`);
    
    // Create copy of mask data
    const data = new Uint8Array(baseMask.data);
    
    // Apply each user polygon
    userPolygons.forEach(polygon => {
      const classId = this.getConditionClassId(polygon.condition);
      if (classId !== undefined) {
        this.paintPolygon(data, baseMask.width, baseMask.height, baseMask.bbox, polygon.coordinates, classId);
      }
    });
    
    return {
      ...baseMask,
      data
    };
  }
  
  // Paint a feature collection onto the mask
  private paintFeatureCollection(
    data: Uint8Array,
    width: number,
    height: number,
    bbox: { west: number; south: number; east: number; north: number },
    featureCollection: GeoJSON.FeatureCollection,
    classId: number
  ): void {
    for (const feature of featureCollection.features) {
      if (!feature.geometry) continue;
      
      if (feature.geometry.type === 'Polygon') {
        const coordinates = feature.geometry.coordinates[0]; // Outer ring
        this.paintPolygon(data, width, height, bbox, 
          coordinates.map(([lon, lat]) => ({ lon, lat })), classId);
      } else if (feature.geometry.type === 'MultiPolygon') {
        for (const polygon of feature.geometry.coordinates) {
          const coordinates = polygon[0]; // Outer ring of each polygon
          this.paintPolygon(data, width, height, bbox, 
            coordinates.map(([lon, lat]) => ({ lon, lat })), classId);
        }
      }
    }
  }
  
  // Paint a single polygon using scan-line algorithm
  private paintPolygon(
    data: Uint8Array,
    width: number,
    height: number,
    bbox: { west: number; south: number; east: number; north: number },
    coordinates: Array<{ lon: number; lat: number }>,
    classId: number
  ): void {
    if (coordinates.length < 3) return;
    
    // Convert coordinates to pixel space
    const pixels = coordinates.map(coord => ({
      x: Math.round(((coord.lon - bbox.west) / (bbox.east - bbox.west)) * width),
      y: Math.round(((bbox.north - coord.lat) / (bbox.north - bbox.south)) * height)
    }));
    
    // Simple bounding box fill (can be improved with proper polygon rasterization)
    const minX = Math.max(0, Math.min(...pixels.map(p => p.x)));
    const maxX = Math.min(width - 1, Math.max(...pixels.map(p => p.x)));
    const minY = Math.max(0, Math.min(...pixels.map(p => p.y)));
    const maxY = Math.min(height - 1, Math.max(...pixels.map(p => p.y)));
    
    // Point-in-polygon test for each pixel in bounding box
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.pointInPolygon({ x, y }, pixels)) {
          const index = y * width + x;
          data[index] = classId;
        }
      }
    }
  }
  
  // Point-in-polygon test using ray casting algorithm
  private pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    const n = polygon.length;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
          (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
        inside = !inside;
      }
    }
    
    return inside;
  }
  
  // Map condition names to class IDs using constants
  private getConditionClassId(condition: string): number | undefined {
    return CONDITION_TO_CLASS[condition.toLowerCase()];
  }
  
  // Calculate deterministic checksum
  private calculateChecksum(data: Uint8Array): string {
    const hash = createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }
  
  // Convert mask buffer to PNG for preview
  async createPngBuffer(maskBuffer: ServerMaskBuffer): Promise<Buffer> {
    // This would require a server-side Canvas implementation
    // For now, return a placeholder
    console.log('📸 PNG preview generation not implemented on server');
    return Buffer.alloc(0);
  }
}

export const serverRasterBaker = new ServerRasterBaker();