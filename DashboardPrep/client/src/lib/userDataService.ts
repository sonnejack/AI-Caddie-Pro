import { storage } from './supabase'
import { useAuth } from '@/components/auth/AuthProvider'

// User data types
export interface UserShotData {
  courseId: string
  holeNumber: number
  startPoint: { lat: number; lon: number }
  aimPoint: { lat: number; lon: number }
  pinPoint: { lat: number; lon: number }
  skillPreset: string
  expectedStrokes: number
  proximity: number
  timestamp: string
}

export interface UserPreferences {
  defaultSkillPreset: string
  units: 'metric' | 'imperial'
  displaySettings: {
    showSamples: boolean
    showRaster: boolean
    rasterOpacity: number
  }
  cesiumSettings: {
    terrainProvider: string
    show3DTiles: boolean
  }
}

export interface UserCourseNotes {
  courseId: string
  notes: string
  customPolygons: Array<{
    id: string
    condition: string
    coordinates: Array<{ lat: number; lon: number }>
  }>
  lastModified: string
}

// Service class for user data operations
export class UserDataService {
  private userId: string | null = null

  constructor(userId?: string) {
    this.userId = userId || null
  }

  setUserId(userId: string) {
    this.userId = userId
  }

  private ensureUserId() {
    if (!this.userId) {
      throw new Error('User must be logged in to access data')
    }
  }

  // Shot data operations
  async saveShotData(shotData: UserShotData): Promise<void> {
    this.ensureUserId()
    
    const existingData = await this.loadShotData()
    existingData.push(shotData)
    
    const csvContent = this.convertShotsToCSV(existingData)
    await storage.uploadUserData(this.userId!, 'shots.csv', csvContent)
  }

  async loadShotData(): Promise<UserShotData[]> {
    this.ensureUserId()
    
    try {
      const file = await storage.downloadUserData(this.userId!, 'shots.csv')
      const text = await file.text()
      return this.parseCSVToShots(text)
    } catch (error) {
      // File doesn't exist yet, return empty array
      return []
    }
  }

  // User preferences operations
  async savePreferences(preferences: UserPreferences): Promise<void> {
    this.ensureUserId()
    
    const jsonContent = JSON.stringify(preferences, null, 2)
    await storage.uploadUserData(this.userId!, 'preferences.json', jsonContent)
  }

  async loadPreferences(): Promise<UserPreferences | null> {
    this.ensureUserId()
    
    try {
      const file = await storage.downloadUserData(this.userId!, 'preferences.json')
      const text = await file.text()
      return JSON.parse(text)
    } catch (error) {
      // File doesn't exist yet
      return null
    }
  }

  // Course notes operations
  async saveCourseNotes(notes: UserCourseNotes): Promise<void> {
    this.ensureUserId()
    
    const existingNotes = await this.loadAllCourseNotes()
    const updatedNotes = existingNotes.filter(n => n.courseId !== notes.courseId)
    updatedNotes.push(notes)
    
    const jsonContent = JSON.stringify(updatedNotes, null, 2)
    await storage.uploadUserData(this.userId!, 'course_notes.json', jsonContent)
  }

  async loadCourseNotes(courseId: string): Promise<UserCourseNotes | null> {
    const allNotes = await this.loadAllCourseNotes()
    return allNotes.find(n => n.courseId === courseId) || null
  }

  async loadAllCourseNotes(): Promise<UserCourseNotes[]> {
    this.ensureUserId()
    
    try {
      const file = await storage.downloadUserData(this.userId!, 'course_notes.json')
      const text = await file.text()
      return JSON.parse(text)
    } catch (error) {
      // File doesn't exist yet
      return []
    }
  }

  // Export all user data
  async exportAllData(): Promise<{
    shots: UserShotData[]
    preferences: UserPreferences | null
    courseNotes: UserCourseNotes[]
  }> {
    this.ensureUserId()
    
    const [shots, preferences, courseNotes] = await Promise.all([
      this.loadShotData(),
      this.loadPreferences(),
      this.loadAllCourseNotes()
    ])
    
    return { shots, preferences, courseNotes }
  }

  // CSV conversion utilities
  private convertShotsToCSV(shots: UserShotData[]): string {
    const headers = [
      'courseId', 'holeNumber', 'startLat', 'startLon', 'aimLat', 'aimLon',
      'pinLat', 'pinLon', 'skillPreset', 'expectedStrokes', 'proximity', 'timestamp'
    ]
    
    const rows = shots.map(shot => [
      shot.courseId,
      shot.holeNumber,
      shot.startPoint.lat,
      shot.startPoint.lon,
      shot.aimPoint.lat,
      shot.aimPoint.lon,
      shot.pinPoint.lat,
      shot.pinPoint.lon,
      shot.skillPreset,
      shot.expectedStrokes,
      shot.proximity,
      shot.timestamp
    ])
    
    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  private parseCSVToShots(csv: string): UserShotData[] {
    const lines = csv.trim().split('\n')
    if (lines.length <= 1) return []
    
    const headers = lines[0].split(',')
    return lines.slice(1).map(line => {
      const values = line.split(',')
      return {
        courseId: values[0],
        holeNumber: parseInt(values[1]),
        startPoint: { lat: parseFloat(values[2]), lon: parseFloat(values[3]) },
        aimPoint: { lat: parseFloat(values[4]), lon: parseFloat(values[5]) },
        pinPoint: { lat: parseFloat(values[6]), lon: parseFloat(values[7]) },
        skillPreset: values[8],
        expectedStrokes: parseFloat(values[9]),
        proximity: parseFloat(values[10]),
        timestamp: values[11]
      }
    })
  }
}

// Hook to get user data service instance
export const useUserDataService = () => {
  const { user } = useAuth()
  const service = new UserDataService(user?.id)
  return service
}