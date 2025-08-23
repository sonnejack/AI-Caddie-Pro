import { serverRasterBaker, type ServerRasterMetadata, type ServerUserPolygon } from './rasterBaker';
import type { ImportResponse } from '@shared/overpass';

interface BakingJob {
  id: string;
  courseId: string;
  metadata: ServerRasterMetadata;
  baseFeatures: ImportResponse['features'];
  userPolygons: ServerUserPolygon[];
  timestamp: number;
  resolve: (result: { versionId: string; checksum: string }) => void;
  reject: (error: Error) => void;
}

class BakingQueueManager {
  private activeJobs = new Map<string, BakingJob>(); // courseId -> job
  private pendingJobs = new Map<string, BakingJob>(); // courseId -> most recent job
  private processing = false;
  
  async enqueueBaking(
    courseId: string,
    metadata: ServerRasterMetadata,
    baseFeatures: ImportResponse['features'],
    userPolygons: ServerUserPolygon[]
  ): Promise<{ versionId: string; checksum: string }> {
    
    return new Promise((resolve, reject) => {
      const job: BakingJob = {
        id: `${courseId}-${Date.now()}`,
        courseId,
        metadata,
        baseFeatures,
        userPolygons,
        timestamp: Date.now(),
        resolve,
        reject
      };
      
      // If there's already a pending job for this course, replace it (coalescing)
      if (this.pendingJobs.has(courseId)) {
        const oldJob = this.pendingJobs.get(courseId)!;
        oldJob.reject(new Error('Superseded by newer edit'));
        console.log(`🔄 Coalesced baking job for course ${courseId}`);
      }
      
      this.pendingJobs.set(courseId, job);
      console.log(`📋 Enqueued baking job for course ${courseId}`);
      
      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }
  
  private async processQueue() {
    if (this.processing) return;
    this.processing = true;
    
    console.log(`🔄 Starting baking queue processing (${this.pendingJobs.size} jobs pending)`);
    
    while (this.pendingJobs.size > 0) {
      // Get the oldest pending job
      const [courseId, job] = Array.from(this.pendingJobs.entries())[0];
      this.pendingJobs.delete(courseId);
      
      // Check if there's already an active job for this course
      if (this.activeJobs.has(courseId)) {
        console.log(`⏳ Course ${courseId} already being baked, skipping`);
        job.reject(new Error('Course already being baked'));
        continue;
      }
      
      // Mark as active and process
      this.activeJobs.set(courseId, job);
      
      try {
        console.log(`🎨 Starting baking for course ${courseId}`);
        const startTime = Date.now();
        
        const result = await serverRasterBaker.createRasterVersion(
          job.metadata,
          job.baseFeatures,
          job.userPolygons
        );
        
        const duration = Date.now() - startTime;
        console.log(`✅ Baking completed for course ${courseId} in ${duration}ms`);
        
        job.resolve({
          versionId: result.versionId,
          checksum: result.checksum
        });
        
      } catch (error) {
        console.error(`❌ Baking failed for course ${courseId}:`, error);
        job.reject(error instanceof Error ? error : new Error('Baking failed'));
      } finally {
        // Remove from active jobs
        this.activeJobs.delete(courseId);
      }
    }
    
    this.processing = false;
    console.log(`🏁 Baking queue processing complete`);
  }
  
  // Get status for observability
  getStatus() {
    return {
      activeJobs: Array.from(this.activeJobs.keys()),
      pendingJobs: Array.from(this.pendingJobs.keys()),
      processing: this.processing,
      activeCount: this.activeJobs.size,
      pendingCount: this.pendingJobs.size
    };
  }
  
  // Force clear stuck jobs (admin utility)
  clearStuckJobs() {
    const stuck = Array.from(this.activeJobs.values()).filter(
      job => Date.now() - job.timestamp > 5 * 60 * 1000 // 5 minutes
    );
    
    stuck.forEach(job => {
      console.log(`🧹 Clearing stuck job ${job.id}`);
      job.reject(new Error('Job cleared due to timeout'));
      this.activeJobs.delete(job.courseId);
    });
    
    return stuck.length;
  }
}

export const bakingQueue = new BakingQueueManager();