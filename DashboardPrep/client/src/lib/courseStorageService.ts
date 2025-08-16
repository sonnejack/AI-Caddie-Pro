import { storage } from './supabase'
import { createMaskFromFeatures } from '@/lib/maskPainter'
import type { MaskBuffer } from '@/lib/maskBuffer'
import type { ImportResponse } from '@shared/overpass'

export interface CourseMetadata {
  courseId: string
  courseName: string
  bbox: {
    west: number
    south: number
    east: number
    north: number
  }
  lastModified: string
  contributorCount: number
  hasEnhancements: boolean
  maskResolution: {
    width: number
    height: number
  }
}

export class CourseStorageService {
  
  // Upload enhanced course raster with user polygons
  async saveEnhancedCourseRaster(
    courseId: string, 
    maskBuffer: MaskBuffer, 
    metadata: Omit<CourseMetadata, 'courseId' | 'lastModified'>
  ): Promise<void> {
    // Convert mask buffer to PNG
    const canvas = document.createElement('canvas')
    canvas.width = maskBuffer.width
    canvas.height = maskBuffer.height
    const ctx = canvas.getContext('2d')!
    
    const imageData = ctx.createImageData(maskBuffer.width, maskBuffer.height)
    
    // Convert class data to RGBA
    for (let i = 0; i < maskBuffer.data.length; i++) {
      const classId = maskBuffer.data[i]
      const color = this.getClassColor(classId)
      const pixelIndex = i * 4
      
      imageData.data[pixelIndex] = color.r
      imageData.data[pixelIndex + 1] = color.g
      imageData.data[pixelIndex + 2] = color.b
      imageData.data[pixelIndex + 3] = color.a
    }
    
    ctx.putImageData(imageData, 0, 0)
    
    // Convert to PNG buffer
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(resolve!, 'image/png')
    })
    const pngBuffer = await blob!.arrayBuffer()
    
    // Upload PNG and metadata
    await Promise.all([
      storage.uploadCourseRaster(courseId, pngBuffer, 'enhanced_raster.png'),
      this.saveCourseMetadata(courseId, {
        ...metadata,
        courseId,
        lastModified: new Date().toISOString()
      })
    ])
  }

  // Load enhanced course raster
  async loadEnhancedCourseRaster(courseId: string): Promise<MaskBuffer | null> {
    try {
      const [rasterFile, metadata] = await Promise.all([
        storage.downloadCourseRaster(courseId, 'enhanced_raster.png'),
        this.loadCourseMetadata(courseId)
      ])
      
      if (!metadata) return null
      
      // Convert PNG back to mask buffer
      const arrayBuffer = await rasterFile.arrayBuffer()
      const blob = new Blob([arrayBuffer])
      const imageUrl = URL.createObjectURL(blob)
      
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = metadata.maskResolution.width
          canvas.height = metadata.maskResolution.height
          const ctx = canvas.getContext('2d')!
          
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          
          // Convert RGBA back to class data
          const data = new Uint8Array(imageData.data.length / 4)
          for (let i = 0; i < data.length; i++) {
            const pixelIndex = i * 4
            const r = imageData.data[pixelIndex]
            const g = imageData.data[pixelIndex + 1]
            const b = imageData.data[pixelIndex + 2]
            
            data[i] = this.getClassFromColor(r, g, b)
          }
          
          const maskBuffer: MaskBuffer = {
            data,
            width: metadata.maskResolution.width,
            height: metadata.maskResolution.height,
            bbox: metadata.bbox
          }
          
          URL.revokeObjectURL(imageUrl)
          resolve(maskBuffer)
        }
        img.src = imageUrl
      })
    } catch (error) {
      console.log('No enhanced raster found for course:', courseId)
      return null
    }
  }

  // Check if enhanced version exists
  async hasEnhancedVersion(courseId: string): Promise<boolean> {
    try {
      const metadata = await this.loadCourseMetadata(courseId)
      return metadata?.hasEnhancements ?? false
    } catch {
      return false
    }
  }

  // Save course metadata
  private async saveCourseMetadata(courseId: string, metadata: CourseMetadata): Promise<void> {
    const jsonContent = JSON.stringify(metadata, null, 2)
    await storage.uploadCourseRaster(courseId, new TextEncoder().encode(jsonContent), 'metadata.json')
  }

  // Load course metadata
  private async loadCourseMetadata(courseId: string): Promise<CourseMetadata | null> {
    try {
      const file = await storage.downloadCourseRaster(courseId, 'metadata.json')
      const text = await file.text()
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // Create enhanced course from base + user polygons
  async createEnhancedCourse(
    courseId: string,
    baseImportData: ImportResponse,
    userPolygons: Array<{
      condition: string
      coordinates: Array<{ lat: number; lon: number }>
    }>
  ): Promise<MaskBuffer> {
    // Create base mask from OSM features
    const baseMask = createMaskFromFeatures(
      baseImportData.features,
      baseImportData.course.bbox
    )
    
    // Apply user polygons to create enhanced mask
    // This would integrate with your existing applyUserPolygonsToMask function
    // For now, return the base mask
    return baseMask
  }

  // Color mapping utilities
  private getClassColor(classId: number): { r: number; g: number; b: number; a: number } {
    const colors = {
      0: { r: 128, g: 128, b: 0, a: 255 },    // rough/unknown - olive
      1: { r: 245, g: 245, b: 220, a: 255 },  // OB - whitesmoke
      2: { r: 100, g: 149, b: 237, a: 255 },  // water - cornflowerblue
      3: { r: 255, g: 99, b: 71, a: 255 },    // hazard - tomato
      4: { r: 255, g: 218, b: 185, a: 255 },  // bunker - peachpuff
      5: { r: 144, g: 238, b: 144, a: 255 },  // green - lightgreen
      6: { r: 50, g: 205, b: 50, a: 255 },    // fairway - limegreen
      7: { r: 221, g: 160, b: 221, a: 255 },  // recovery - plum
      8: { r: 128, g: 128, b: 0, a: 255 },    // rough - olive
      9: { r: 176, g: 224, b: 230, a: 255 }   // tee - powderblue
    }
    return colors[classId as keyof typeof colors] || colors[0]
  }

  private getClassFromColor(r: number, g: number, b: number): number {
    // Simple color matching - in production you'd want more robust mapping
    if (r === 50 && g === 205 && b === 50) return 6    // fairway
    if (r === 144 && g === 238 && b === 144) return 5  // green
    if (r === 100 && g === 149 && b === 237) return 2  // water
    if (r === 255 && g === 218 && b === 185) return 4  // bunker
    if (r === 245 && g === 245 && b === 220) return 1  // OB
    if (r === 255 && g === 99 && b === 71) return 3    // hazard
    if (r === 221 && g === 160 && b === 221) return 7  // recovery
    if (r === 176 && g === 224 && b === 230) return 9  // tee
    return 0 // rough/unknown
  }
}

export const courseStorageService = new CourseStorageService()