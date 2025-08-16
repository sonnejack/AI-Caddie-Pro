import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('Supabase config:', { 
  url: supabaseUrl ? 'present' : 'missing', 
  key: supabaseKey ? 'present' : 'missing' 
})

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables:', { supabaseUrl, supabaseKey })
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Storage bucket names
export const STORAGE_BUCKETS = {
  COURSES: 'courses',
  USER_DATA: 'user-data'
} as const

// Helper functions for file operations
export const storage = {
  // Upload course raster (community enhanced)
  uploadCourseRaster: async (courseId: string, imageBuffer: ArrayBuffer, filename = 'enhanced_raster.png') => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.COURSES)
      .upload(`${courseId}/${filename}`, imageBuffer, {
        contentType: 'image/png',
        upsert: true
      })
    
    if (error) throw error
    return data
  },

  // Download course raster
  downloadCourseRaster: async (courseId: string, filename = 'enhanced_raster.png') => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.COURSES)
      .download(`${courseId}/${filename}`)
    
    if (error) {
      // If enhanced raster doesn't exist, try base raster
      if (filename === 'enhanced_raster.png') {
        return storage.downloadCourseRaster(courseId, 'base_raster.png')
      }
      throw error
    }
    return data
  },

  // Upload user data (CSV/JSON)
  uploadUserData: async (userId: string, filename: string, data: string | ArrayBuffer) => {
    const { data: uploadData, error } = await supabase.storage
      .from(STORAGE_BUCKETS.USER_DATA)
      .upload(`${userId}/${filename}`, data, {
        upsert: true
      })
    
    if (error) throw error
    return uploadData
  },

  // Download user data
  downloadUserData: async (userId: string, filename: string) => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.USER_DATA)
      .download(`${userId}/${filename}`)
    
    if (error) throw error
    return data
  },

  // List user files
  listUserFiles: async (userId: string) => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.USER_DATA)
      .list(userId)
    
    if (error) throw error
    return data
  }
}