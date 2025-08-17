// client/src/components/prepare/SlopeArrowLayer.ts
// Cesium visualization layer for slope arrows with gradient coloring

import type { EnhancedMaskBuffer, SlopeData } from '../../lib/slopeCalculator';
import { readSlopeFromMask } from '../../lib/slopeCalculator';

declare const window: any;
const getCesium = () => (window as any).Cesium;

export interface SlopeArrowLayerOptions {
  visible: boolean;
  arrowLength: number; // pixels
  arrowWidth: number;  // pixels
  sampleSpacing: number; // meters between arrows
  minSlopePercent: number; // minimum slope to show arrow
}

export class SlopeArrowLayer {
  private viewer: any;
  private entities: any[] = [];
  private maskBuffer: EnhancedMaskBuffer | null = null;
  private options: SlopeArrowLayerOptions;
  private greenCenters: Array<{lat: number, lon: number}> = [];

  constructor(viewer: any, options: Partial<SlopeArrowLayerOptions> = {}) {
    this.viewer = viewer;
    this.options = {
      visible: false,
      arrowLength: 8,
      arrowWidth: 3,
      sampleSpacing: 4, // 4 meters between arrows
      minSlopePercent: 1, // Only show arrows for slopes > 1%
      ...options
    };
  }

  /**
   * Set the enhanced mask buffer with slope data
   */
  setMaskBuffer(maskBuffer: EnhancedMaskBuffer | null): void {
    this.maskBuffer = maskBuffer;
    if (this.options.visible) {
      this.refresh();
    }
  }

  /**
   * Set green center locations for arrow rendering
   */
  setGreenCenters(centers: Array<{lat: number, lon: number}>): void {
    this.greenCenters = centers;
    if (this.options.visible) {
      this.refresh();
    }
  }

  /**
   * Set current green center and radius for focused slope analysis
   */
  async setCurrentGreenArea(center: {lat: number, lon: number} | null, radiusMeters: number = 25): Promise<void> {
    this.clear(); // Clear existing arrows
    
    if (!center) {
      this.greenCenters = [];
      return;
    }
    
    if (!this.options.visible) {
      return; // Don't process if not visible
    }
    
    console.log('🎯 Building slope arrows for green area...');
    await this.buildSlopeArrowsForGreenArea(center, radiusMeters);
  }

  /**
   * Build slope arrows for a circular green area (center + radius)
   */
  private async buildSlopeArrowsForGreenArea(center: {lat: number, lon: number}, radiusMeters: number): Promise<void> {
    try {
      const Cesium = getCesium();
      
      // Calculate bounding box with buffer (50 yards for short game area)
      const totalRadiusMeters = radiusMeters + 45.72; // green radius + 50 yards buffer
      const latMid = center.lat;
      const mLat = 111132.0;
      const mLon = 111320.0 * Math.cos(Cesium.Math.toRadians(latMid));
      const dLat = totalRadiusMeters / mLat;
      const dLon = totalRadiusMeters / mLon;
      
      const west = center.lon - dLon;
      const east = center.lon + dLon;
      const south = center.lat - dLat;
      const north = center.lat + dLat;
      
      // Set up grid sampling
      const stepM = this.options.sampleSpacing; // 4 meters from options
      const stepDegLat = stepM / mLat;
      const stepDegLon = stepM / mLon;
      const nLat = Math.floor((north - south) / stepDegLat) + 1;
      const nLon = Math.floor((east - west) / stepDegLon) + 1;
      
      if (nLat < 2 || nLon < 2) return;
      
      // Create cartographics for terrain sampling
      const cartos: any[] = [];
      const mask = new Uint8Array(nLat * nLon);
      
      for (let i = 0; i < nLat; i++) {
        const lat = south + i * stepDegLat;
        for (let j = 0; j < nLon; j++) {
          const lon = west + j * stepDegLon;
          const idx = i * nLon + j;
          
          // Check if point is within total radius
          const distance = this.calculateDistance(center, {lat, lon}) * 0.9144; // Convert yards to meters
          if (distance <= totalRadiusMeters) {
            mask[idx] = 1;
            cartos.push(new Cesium.Cartographic(
              Cesium.Math.toRadians(lon), 
              Cesium.Math.toRadians(lat), 
              0
            ));
          }
        }
      }
      
      if (cartos.length === 0) return;
      
      console.log(`📏 Sampling ${cartos.length} terrain points for slope analysis`);
      
      // Sample terrain elevations
      const terrain = this.viewer.terrainProvider;
      const sampled = await Cesium.sampleTerrainMostDetailed(terrain, cartos);
      
      // Put heights back into grid
      const heights = new Float32Array(nLat * nLon);
      heights.fill(NaN);
      let k = 0;
      for (let i = 0; i < nLat; i++) {
        for (let j = 0; j < nLon; j++) {
          const idx = i * nLon + j;
          if (mask[idx]) {
            heights[idx] = sampled[k++].height;
          }
        }
      }
      
      // Simple smoothing
      const smoothed = this.smoothGrid(heights, nLat, nLon);
      
      // Create slope arrows
      const h = (i: number, j: number) => smoothed[i * nLon + j];
      
      for (let i = 1; i < nLat - 1; i++) {
        const lat = south + i * stepDegLat;
        for (let j = 1; j < nLon - 1; j++) {
          const lon = west + j * stepDegLon;
          const idx = i * nLon + j;
          if (!mask[idx]) continue;
          
          const zc = h(i, j);
          if (!Number.isFinite(zc)) continue;
          const zL = h(i, j - 1), zR = h(i, j + 1);
          const zB = h(i - 1, j), zT = h(i + 1, j);
          if (![zL, zR, zB, zT].every(Number.isFinite)) continue;
          
          // Calculate slope
          const dzdx = (zR - zL) / (2 * stepDegLon * mLon);
          const dzdy = (zT - zB) / (2 * stepDegLat * mLat);
          const sx = -dzdx, sy = -dzdy;
          const mag = Math.hypot(sx, sy);
          if (mag < 1e-6) continue;
          
          const slopePercent = mag * 100;
          
          // Skip arrows below threshold
          if (slopePercent < this.options.minSlopePercent) continue;
          
          // Calculate color based on slope percentage
          const color = this.getSlopeColor(slopePercent);
          
          // Calculate arrow direction
          const direction = Math.atan2(sy, sx) * 180 / Math.PI;
          
          // Create arrow at this position
          const position = Cesium.Cartesian3.fromDegrees(lon, lat, zc + 0.05);
          
          const arrowEntity = this.viewer.entities.add({
            position: position,
            billboard: {
              image: this.createArrowCanvas(direction, color),
              scale: 1.0,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER
            }
          });
          
          this.entities.push(arrowEntity);
        }
      }
      
      console.log(`✅ Generated ${this.entities.length} slope arrows`);
      
    } catch (error) {
      console.error('❌ Error building slope arrows:', error);
    }
  }

  /**
   * Simple grid smoothing
   */
  private smoothGrid(src: Float32Array, rows: number, cols: number): Float32Array {
    const dst = new Float32Array(src.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0, n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rows) continue;
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c + dc;
            if (cc < 0 || cc >= cols) continue;
            const v = src[rr * cols + cc];
            if (Number.isFinite(v)) {
              sum += v;
              n++;
            }
          }
        }
        dst[r * cols + c] = n ? sum / n : NaN;
      }
    }
    return dst;
  }


  /**
   * Set layer visibility
   */
  setVisible(visible: boolean): void {
    this.options.visible = visible;
    if (!visible) {
      this.clear();
    }
    // Note: visibility change doesn't automatically trigger refresh
    // Call setCurrentGreenPolygon again if you want to rebuild when visible
  }

  /**
   * Check if layer is currently visible
   */
  isVisible(): boolean {
    return this.options.visible;
  }

  /**
   * Refresh arrow display
   */
  refresh(): void {
    this.clear();
    
    if (!this.options.visible || !this.maskBuffer?.hasSlopeData || this.greenCenters.length === 0) {
      return;
    }

    console.log('🎯 Rendering slope arrows...');
    const startTime = performance.now();
    
    // Render arrows around each green center
    for (const greenCenter of this.greenCenters) {
      this.renderArrowsAroundGreen(greenCenter);
    }
    
    const endTime = performance.now();
    console.log(`✅ Slope arrows rendered in ${(endTime - startTime).toFixed(1)}ms (${this.entities.length} arrows)`);
  }

  /**
   * Render arrows in a 50-yard radius around a green center
   */
  private renderArrowsAroundGreen(greenCenter: {lat: number, lon: number}): void {
    if (!this.maskBuffer) return;

    const radiusYards = 50;
    const radiusMeters = radiusYards * 0.9144;
    
    // Calculate approximate degrees per meter at this latitude
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLon = 111320 * Math.cos(greenCenter.lat * Math.PI / 180);
    
    const latOffset = radiusMeters / metersPerDegreeLat;
    const lonOffset = radiusMeters / metersPerDegreeLon;
    
    // Sample grid around green center
    const spacingLat = this.options.sampleSpacing / metersPerDegreeLat;
    const spacingLon = this.options.sampleSpacing / metersPerDegreeLon;
    
    for (let lat = greenCenter.lat - latOffset; lat <= greenCenter.lat + latOffset; lat += spacingLat) {
      for (let lon = greenCenter.lon - lonOffset; lon <= greenCenter.lon + lonOffset; lon += spacingLon) {
        // Check if point is within radius
        const distance = this.calculateDistance(greenCenter, {lat, lon});
        if (distance <= radiusYards) {
          this.createArrowAtPoint(lon, lat);
        }
      }
    }
  }

  /**
   * Create an arrow at a specific point if slope is significant
   */
  private createArrowAtPoint(lon: number, lat: number): void {
    if (!this.maskBuffer) return;

    const slopeData = readSlopeFromMask(lon, lat, this.maskBuffer);
    if (!slopeData || slopeData.percentage < this.options.minSlopePercent) {
      return; // No arrow for gentle slopes
    }

    const Cesium = getCesium();
    const position = Cesium.Cartesian3.fromDegrees(lon, lat);
    
    // Calculate arrow color based on slope percentage
    const color = this.getSlopeColor(slopeData.percentage);
    
    // Create arrow entity
    const arrowEntity = this.viewer.entities.add({
      position: position,
      billboard: {
        image: this.createArrowCanvas(slopeData.direction, color),
        scale: 1.0,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER
      }
    });

    this.entities.push(arrowEntity);
  }

  /**
   * Create arrow canvas with direction and color
   */
  private createArrowCanvas(direction: number, color: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const size = Math.max(this.options.arrowLength, this.options.arrowWidth) + 4; // Add padding
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d')!;
    const centerX = size / 2;
    const centerY = size / 2;
    
    // Convert direction to radians and adjust for screen coordinates
    const angleRad = (direction - 90) * Math.PI / 180; // -90 to make 0° point up
    
    // Set arrow style
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = this.options.arrowWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw arrow line
    const halfLength = this.options.arrowLength / 2;
    const startX = centerX - Math.cos(angleRad) * halfLength;
    const startY = centerY - Math.sin(angleRad) * halfLength;
    const endX = centerX + Math.cos(angleRad) * halfLength;
    const endY = centerY + Math.sin(angleRad) * halfLength;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Draw arrowhead
    const headLength = this.options.arrowLength / 3;
    const headAngle = Math.PI / 6; // 30 degrees
    
    const headX1 = endX - headLength * Math.cos(angleRad - headAngle);
    const headY1 = endY - headLength * Math.sin(angleRad - headAngle);
    const headX2 = endX - headLength * Math.cos(angleRad + headAngle);
    const headY2 = endY - headLength * Math.sin(angleRad + headAngle);
    
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(headX1, headY1);
    ctx.moveTo(endX, endY);
    ctx.lineTo(headX2, headY2);
    ctx.stroke();
    
    return canvas;
  }

  /**
   * Get color for slope percentage (light blue to dark red gradient)
   */
  private getSlopeColor(slopePercent: number): string {
    // Clamp to 0-12% range
    const normalizedSlope = Math.min(Math.max(slopePercent, 0), 12) / 12;
    
    // Light blue: rgb(173, 216, 230) to Dark red: rgb(139, 0, 0)
    const startR = 173, startG = 216, startB = 230;
    const endR = 139, endG = 0, endB = 0;
    
    const r = Math.round(startR + (endR - startR) * normalizedSlope);
    const g = Math.round(startG + (endG - startG) * normalizedSlope);
    const b = Math.round(startB + (endB - startB) * normalizedSlope);
    
    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Calculate distance between two points in yards
   */
  private calculateDistance(p1: {lat: number, lon: number}, p2: {lat: number, lon: number}): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.09361; // Convert to yards
  }

  /**
   * Clear all arrow entities
   */
  clear(): void {
    for (const entity of this.entities) {
      this.viewer.entities.remove(entity);
    }
    this.entities = [];
  }

  /**
   * Update options
   */
  updateOptions(newOptions: Partial<SlopeArrowLayerOptions>): void {
    this.options = { ...this.options, ...newOptions };
    if (this.options.visible) {
      this.refresh();
    }
  }

  /**
   * Dispose of the layer
   */
  dispose(): void {
    this.clear();
    this.maskBuffer = null;
    this.greenCenters = [];
  }
}

// Factory function for easy creation
export function createSlopeArrowLayer(viewer: any, options?: Partial<SlopeArrowLayerOptions>): SlopeArrowLayer {
  return new SlopeArrowLayer(viewer, options);
}