import type { MaskBuffer, ClassId } from './maskBuffer';
import type { ImportResponse } from '@shared/overpass';

/**
 * Client-side mask painter for generating raster masks from GeoJSON features
 */
export class MaskPainter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    this.ctx = ctx;
  }

  /**
   * Paint a mask from GeoJSON feature collections
   * Priority order: OB > Water > Hazard > Bunker > Green > Fairway > Recovery > Rough
   */
  paintMask(
    features: ImportResponse['holes'][0]['features'],
    bbox: { west: number; south: number; east: number; north: number },
    options: { width?: number; height?: number; metersPerPixel?: number } = {}
  ): MaskBuffer {
    // Calculate dimensions
    const { width, height } = this.calculateDimensions(bbox, options);
    
    // Setup canvas
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.clearRect(0, 0, width, height);
    
    // Paint features in priority order (lowest to highest priority)
    const paintOrder: Array<[keyof typeof features, ClassId]> = [
      ['rough', 8],      // Lowest priority
      ['recovery', 7],
      ['fairways', 6],
      ['greens', 5],
      ['bunkers', 4],
      ['hazards', 3],
      ['water', 2],
      ['ob', 1]          // Highest priority
    ];

    for (const [featureType, classId] of paintOrder) {
      const featureCollection = features[featureType];
      if (featureCollection.features.length > 0) {
        this.paintFeatureCollection(featureCollection, classId, bbox, width, height);
      }
    }

    // Extract image data
    const imageData = this.ctx.getImageData(0, 0, width, height);
    
    return {
      width,
      height,
      bbox,
      data: imageData.data
    };
  }

  private calculateDimensions(
    bbox: { west: number; south: number; east: number; north: number },
    options: { width?: number; height?: number; metersPerPixel?: number }
  ): { width: number; height: number } {
    if (options.width && options.height) {
      return { width: options.width, height: options.height };
    }

    // Calculate based on meters per pixel (default 1m/px)
    const metersPerPixel = options.metersPerPixel || 1;
    const metersPerDegree = 111000; // Approximate meters per degree at mid latitudes
    
    const widthMeters = (bbox.east - bbox.west) * metersPerDegree * Math.cos((bbox.north + bbox.south) / 2 * Math.PI / 180);
    const heightMeters = (bbox.north - bbox.south) * metersPerDegree;
    
    const width = Math.max(512, Math.min(2048, Math.round(widthMeters / metersPerPixel)));
    const height = Math.max(512, Math.min(2048, Math.round(heightMeters / metersPerPixel)));
    
    return { width, height };
  }

  private paintFeatureCollection(
    featureCollection: GeoJSON.FeatureCollection,
    classId: ClassId,
    bbox: { west: number; south: number; east: number; north: number },
    width: number,
    height: number
  ): void {
    // Set fill color (class ID in red channel)
    this.ctx.fillStyle = `rgb(${classId}, 0, 0)`;
    this.ctx.strokeStyle = `rgb(${classId}, 0, 0)`;
    this.ctx.lineWidth = 1;

    for (const feature of featureCollection.features) {
      if (!feature.geometry) continue;
      
      try {
        this.paintGeometry(feature.geometry, bbox, width, height);
      } catch (error) {
        console.warn('Failed to paint geometry:', error);
      }
    }
  }

  private paintGeometry(
    geometry: GeoJSON.Geometry,
    bbox: { west: number; south: number; east: number; north: number },
    width: number,
    height: number
  ): void {
    switch (geometry.type) {
      case 'Polygon':
        this.paintPolygon(geometry.coordinates, bbox, width, height);
        break;
      case 'MultiPolygon':
        for (const polygon of geometry.coordinates) {
          this.paintPolygon(polygon, bbox, width, height);
        }
        break;
      case 'LineString':
        this.paintLineString(geometry.coordinates, bbox, width, height);
        break;
      case 'MultiLineString':
        for (const lineString of geometry.coordinates) {
          this.paintLineString(lineString, bbox, width, height);
        }
        break;
      case 'Point':
        this.paintPoint(geometry.coordinates, bbox, width, height);
        break;
      case 'MultiPoint':
        for (const point of geometry.coordinates) {
          this.paintPoint(point, bbox, width, height);
        }
        break;
    }
  }

  private paintPolygon(
    coordinates: number[][][],
    bbox: { west: number; south: number; east: number; north: number },
    width: number,
    height: number
  ): void {
    // Paint exterior ring
    if (coordinates.length > 0) {
      this.ctx.beginPath();
      const exterior = coordinates[0];
      
      for (let i = 0; i < exterior.length; i++) {
        const [lon, lat] = exterior[i];
        const x = ((lon - bbox.west) / (bbox.east - bbox.west)) * width;
        const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
        
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      
      this.ctx.closePath();
      this.ctx.fill();
      
      // Handle holes (interior rings)
      for (let i = 1; i < coordinates.length; i++) {
        const hole = coordinates[i];
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        
        for (let j = 0; j < hole.length; j++) {
          const [lon, lat] = hole[j];
          const x = ((lon - bbox.west) / (bbox.east - bbox.west)) * width;
          const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
          
          if (j === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  private paintLineString(
    coordinates: number[][],
    bbox: { west: number; south: number; east: number; north: number },
    width: number,
    height: number
  ): void {
    if (coordinates.length < 2) return;
    
    this.ctx.beginPath();
    
    for (let i = 0; i < coordinates.length; i++) {
      const [lon, lat] = coordinates[i];
      const x = ((lon - bbox.west) / (bbox.east - bbox.west)) * width;
      const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    
    this.ctx.stroke();
  }

  private paintPoint(
    coordinates: number[],
    bbox: { west: number; south: number; east: number; north: number },
    width: number,
    height: number
  ): void {
    const [lon, lat] = coordinates;
    const x = ((lon - bbox.west) / (bbox.east - bbox.west)) * width;
    const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * height;
    
    this.ctx.beginPath();
    this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
    this.ctx.fill();
  }
}

/**
 * Convenience function to create a mask from features
 */
export function createMaskFromFeatures(
  features: ImportResponse['holes'][0]['features'],
  bbox: { west: number; south: number; east: number; north: number },
  options?: { width?: number; height?: number; metersPerPixel?: number }
): MaskBuffer {
  const painter = new MaskPainter();
  return painter.paintMask(features, bbox, options);
}