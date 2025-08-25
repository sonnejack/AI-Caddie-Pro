import { useEffect, useRef, useState } from 'react';
import type { UserPolygon } from '@/cesium/ConditionDrawingManager';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  courseId: string | null;
  courseName: string;
  userPolygons: UserPolygon[];
  baseFeatures: any;
  bbox: { west: number; south: number; east: number; north: number } | null;
  userId?: string;
  debounceMs?: number;
  rateLimitMs?: number;
}

export function useAutoSave({
  courseId,
  courseName,
  userPolygons,
  baseFeatures,
  bbox,
  userId,
  debounceMs = 2000,
  rateLimitMs = 10000
}: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip auto-save if not ready
    if (!courseId || !userId || !baseFeatures || !bbox || userPolygons.length === 0) {
      return;
    }

    // Skip initial mount to avoid saving empty state
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Check rate limit
    const now = Date.now();
    const timeSinceLastSave = now - lastSavedAt;
    if (timeSinceLastSave < rateLimitMs) {
      console.log(`🕒 Rate limited: waiting ${rateLimitMs - timeSinceLastSave}ms before next save`);
      return;
    }

    // Set status to saving immediately
    setSaveStatus('saving');

    // Debounced save
    timeoutRef.current = setTimeout(async () => {
      try {
        console.log(`💾 Auto-saving ${userPolygons.length} polygons for course: ${courseName}`);

        const payload = {
          userId,
          userPolygons: userPolygons.map(polygon => ({
            condition: polygon.condition,
            coordinates: polygon.positionsLL.map((pos: any) => ({ lat: pos.lat, lon: pos.lon }))
          })),
          baseFeatures,
          bbox,
          courseName
        };

        const response = await fetch(`/api/courses/${courseId}/raster/rebake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Failed to auto-save: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Auto-save completed:', result);
        
        setSaveStatus('saved');
        setLastSavedAt(Date.now());
        
        // Reset to idle after showing success briefly
        setTimeout(() => setSaveStatus('idle'), 2000);
        
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
        setSaveStatus('error');
        
        // Reset to idle after showing error briefly
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [courseId, userPolygons, baseFeatures, bbox, userId, courseName, debounceMs, rateLimitMs, lastSavedAt]);

  return { saveStatus };
}