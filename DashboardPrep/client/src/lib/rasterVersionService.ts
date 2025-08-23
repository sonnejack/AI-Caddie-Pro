import { storage, supabase } from './supabase'
import { createMaskFromFeatures, applyUserPolygonsToMask } from '@/lib/maskPainter'
import type { MaskBuffer } from '@/lib/maskBuffer'
import type { ImportResponse } from '@shared/overpass'
import type { CourseRasterVersion, CourseUserPolygon } from '@shared/schema'
import type { UserPolygon } from '@/prepare/drawing/ConditionDrawingManager'
// Browser-compatible checksum using Web Crypto API
async function calculateChecksum(data: Uint8ClampedArray): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface RasterVersionMetadata {
  courseId: string
  courseName: string
  bbox: {
    west: number
    south: number
    east: number
    north: number
  }
  width: number
  height: number
  classMapVersion: number
  smoothingVersion: number
  contributorId: string
}

export class RasterVersionService {
  
  // Create new raster version from base features + user polygons
  async createRasterVersion(
    metadata: RasterVersionMetadata,
    baseFeatures: ImportResponse['features'],
    userPolygons: UserPolygon[]
  ): Promise<string> {
    console.log('🎨 Creating new raster version for course:', metadata.courseId)
    
    // Create base mask from OSM features
    const baseMaskResult = createMaskFromFeatures(baseFeatures, metadata.bbox)
    const baseMask: MaskBuffer = {
      width: baseMaskResult.width,
      height: baseMaskResult.height,
      bbox: baseMaskResult.bbox,
      data: baseMaskResult.imageData.data
    }
    
    // Apply user polygons to create enhanced mask
    const enhancedMask = userPolygons.length > 0 
      ? applyUserPolygonsToMask(baseMask, userPolygons)
      : baseMask
    
    // Generate unique version ID
    const versionId = crypto.randomUUID()
    
    // Calculate checksum of mask data
    const checksum = await calculateChecksum(enhancedMask.data)
    
    // Check if identical version already exists
    const existingVersion = await this.findVersionByChecksum(metadata.courseId, checksum)
    if (existingVersion) {
      console.log('🎨 Identical raster version already exists:', existingVersion.id)
      return existingVersion.id
    }
    
    // Upload binary mask data (authoritative)
    const binBuffer = enhancedMask.data.buffer.slice(
      enhancedMask.data.byteOffset,
      enhancedMask.data.byteOffset + enhancedMask.data.byteLength
    )
    const binUpload = await storage.uploadCourseRasterBin(
      metadata.courseId,
      versionId,
      binBuffer
    )
    
    // Create PNG preview (optional)
    const pngBuffer = await this.createPngPreview(enhancedMask)
    let pngUpload = null
    try {
      pngUpload = await storage.uploadCourseRasterPng(
        metadata.courseId,
        versionId,
        pngBuffer
      )
    } catch (error) {
      console.warn('⚠️ Failed to upload PNG preview:', error)
    }
    
    // Save version record to database
    const { data: versionRecord, error } = await supabase
      .from('course_raster_versions')
      .insert({
        id: versionId,
        courseId: metadata.courseId,
        binUrl: binUpload.path,
        pngUrl: pngUpload?.path || null,
        width: enhancedMask.width,
        height: enhancedMask.height,
        bbox: enhancedMask.bbox,
        classMapVersion: metadata.classMapVersion,
        smoothingVersion: metadata.smoothingVersion,
        checksum,
        createdBy: metadata.contributorId,
        status: 'draft'
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ Failed to create raster version record:', error)
      throw new Error('Failed to create raster version record')
    }
    
    console.log('✅ Created new raster version:', versionId)
    return versionId
  }
  
  // Load raster version by ID
  async loadRasterVersion(versionId: string): Promise<MaskBuffer | null> {
    try {
      // Get version metadata
      const { data: version, error } = await supabase
        .from('course_raster_versions')
        .select('*')
        .eq('id', versionId)
        .single()
      
      if (error || !version) {
        console.error('❌ Failed to load raster version metadata:', error)
        return null
      }
      
      // Get signed URL for binary data
      const signedUrl = await storage.getCourseRasterSignedUrl(version.binUrl)
      
      // Download and parse binary mask data
      const response = await fetch(signedUrl.signedUrl)
      const arrayBuffer = await response.arrayBuffer()
      const data = new Uint8ClampedArray(arrayBuffer)
      
      return {
        width: version.width,
        height: version.height,
        bbox: version.bbox as any,
        data
      }
    } catch (error) {
      console.error('❌ Failed to load raster version:', error)
      return null
    }
  }
  
  // Get latest published version for a course
  async getLatestPublishedVersion(courseId: string): Promise<CourseRasterVersion | null> {
    const { data, error } = await supabase
      .from('course_raster_versions')
      .select('*')
      .eq('courseId', courseId)
      .eq('status', 'published')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (error) {
      console.error('❌ Failed to get latest published version:', error)
      return null
    }
    
    return data
  }
  
  // Publish a draft version (admin only)
  async publishVersion(versionId: string, adminId: string): Promise<void> {
    const { data: version, error: fetchError } = await supabase
      .from('course_raster_versions')
      .select('courseId')
      .eq('id', versionId)
      .single()
    
    if (fetchError || !version) {
      throw new Error('Version not found')
    }
    
    // Start transaction: archive current published, set new as published
    const { error: archiveError } = await supabase
      .from('course_raster_versions')
      .update({ status: 'archived' })
      .eq('courseId', version.courseId)
      .eq('status', 'published')
    
    if (archiveError) {
      throw new Error('Failed to archive previous version')
    }
    
    const { error: publishError } = await supabase
      .from('course_raster_versions')
      .update({ status: 'published' })
      .eq('id', versionId)
    
    if (publishError) {
      throw new Error('Failed to publish version')
    }
    
    // Update course record
    const { error: courseError } = await supabase
      .from('courses')
      .update({
        latestRasterVersionId: versionId,
        enhanced: true
      })
      .eq('id', version.courseId)
    
    if (courseError) {
      console.error('⚠️ Failed to update course record:', courseError)
    }
    
    console.log('✅ Published raster version:', versionId)
  }
  
  // Save user polygon vectors
  async saveUserPolygons(
    courseId: string,
    userPolygons: UserPolygon[],
    userId: string
  ): Promise<void> {
    // Delete existing polygons for this course/user
    await supabase
      .from('course_user_polygons')
      .delete()
      .eq('courseId', courseId)
      .eq('createdBy', userId)
    
    if (userPolygons.length === 0) return
    
    // Insert new polygons
    const polygonRecords = userPolygons.map(polygon => ({
      courseId,
      condition: polygon.condition,
      geom: {
        type: 'Polygon',
        coordinates: [polygon.positionsLL.map(pos => [pos.lon, pos.lat])]
      },
      createdBy: userId,
      version: 1
    }))
    
    const { error } = await supabase
      .from('course_user_polygons')
      .insert(polygonRecords)
    
    if (error) {
      throw new Error('Failed to save user polygons')
    }
    
    console.log('✅ Saved', userPolygons.length, 'user polygons')
  }
  
  // Load user polygons for a course
  async loadUserPolygons(courseId: string, userId?: string): Promise<CourseUserPolygon[]> {
    let query = supabase
      .from('course_user_polygons')
      .select('*')
      .eq('courseId', courseId)
    
    if (userId) {
      query = query.eq('createdBy', userId)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('❌ Failed to load user polygons:', error)
      return []
    }
    
    return data || []
  }
  
  // Private helper methods
  
  private async findVersionByChecksum(courseId: string, checksum: string): Promise<CourseRasterVersion | null> {
    const { data, error } = await supabase
      .from('course_raster_versions')
      .select('*')
      .eq('courseId', courseId)
      .eq('checksum', checksum)
      .maybeSingle()
    
    if (error) {
      console.error('❌ Failed to find version by checksum:', error)
      return null
    }
    
    return data
  }
  
  private async createPngPreview(maskBuffer: MaskBuffer): Promise<ArrayBuffer> {
    const canvas = document.createElement('canvas')
    canvas.width = maskBuffer.width
    canvas.height = maskBuffer.height
    const ctx = canvas.getContext('2d')!
    
    const imageData = ctx.createImageData(maskBuffer.width, maskBuffer.height)
    
    // Convert class data to RGBA for preview
    for (let i = 0; i < maskBuffer.data.length; i += 4) {
      const classId = maskBuffer.data[i]
      const color = this.getClassColor(classId)
      
      imageData.data[i] = color.r
      imageData.data[i + 1] = color.g
      imageData.data[i + 2] = color.b
      imageData.data[i + 3] = color.a
    }
    
    ctx.putImageData(imageData, 0, 0)
    
    // Convert to PNG buffer
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(resolve!, 'image/png')
    })
    
    return blob!.arrayBuffer()
  }
  
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
}

export const rasterVersionService = new RasterVersionService()