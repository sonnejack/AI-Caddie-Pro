import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CoursePicker from '../components/prepare/CoursePicker';
import HoleNavigator from '../components/prepare/HoleNavigator';
import CesiumCanvas from '../components/prepare/CesiumCanvas';
import ConditionDrawer from '../components/prepare/ConditionDrawer';
import AimPanel from '../components/prepare/AimPanel';
import DispersionInspector from '../components/prepare/DispersionInspector';
import OptimizerPanel from '../components/prepare/OptimizerPanel';
import MetricsBar from '../components/prepare/MetricsBar';
import StatsTab from '../components/placeholders/StatsTab';
import TrendsTab from '../components/placeholders/TrendsTab';
import DispersionTab from '../components/placeholders/DispersionTab';
import AboutTab from '../components/AboutTab';
import { usePrepareState } from '../hooks/usePrepareState';
import { SKILL_PRESETS } from '@shared/types';
import { createMaskFromFeatures, applyUserPolygonsToMask } from '@/lib/maskPainter';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { samplePointElevation, setMaskBuffer as setElevationMaskBuffer } from '@/lib/pointElevation';
import type { ImportResponse } from '@shared/overpass';
import type { LatLon, ESResult } from '@shared/types';
import { DrawingManagerContext } from '@/prepare/drawing/DrawingManagerContext';
import type { UserPolygon } from '@/prepare/drawing/ConditionDrawingManager';
import { UserMenu } from '@/components/auth/UserMenu';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('prepare');
  const [currentHole, setCurrentHole] = useState(1);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ stage: '', progress: 0 });
  const [holeMarkers, setHoleMarkers] = useState<Array<{number: number, par: number, coordinates: [number, number]}>>([]);
  const [esResult, setESResult] = useState<{
    mean: number;
    ci95: number;
    n: number;
    pointsLL: Float64Array;
    distsYds: Float32Array;
    classes: Uint8Array;
    samplePoints?: Array<{point: LatLon, classId: number}>;
    avgProximity?: number;
    avgProximityInPlay?: number;
  }>();
  const [cameraPosition, setCameraPosition] = useState<{ position: LatLon, heading: number, pitch: number, height: number }>();
  const [vectorFeatures, setVectorFeatures] = useState<any>(null);
  const [holePolylines, setHolePolylines] = useState<any[]>([]);
  const [holePolylinesByRef, setHolePolylinesByRef] = useState<Map<string, any>>(new Map());
  const [cesiumViewerRef, setCesiumViewerRef] = useState<any>(null);
  const [courseNavigationInitialized, setCourseNavigationInitialized] = useState(false);
  const [isGPSActive, setIsGPSActive] = useState(false);
  const [drawingManager, setDrawingManager] = useState<any>(null);
  const [userPolygons, setUserPolygons] = useState<UserPolygon[]>([]);
  const [drawingState, setDrawingState] = useState<{ isDrawing: boolean; vertexCount: number; currentCondition: string | null }>({
    isDrawing: false,
    vertexCount: 0,
    currentCondition: null
  });
  const [currentSampleData, setCurrentSampleData] = useState<{ points: LatLon[], classes: number[], pointsLL: Float64Array } | undefined>();
  const [originalCourseBbox, setOriginalCourseBbox] = useState<{ west: number; south: number; east: number; north: number } | null>(null);
  const {
    courseId, holeId, setCourseId, setHoleId,
    start, setStart, pin, setPin, aim, setAim,
    skill, setSkill, maxCarry, setMaxCarry,
    sampleCount, setSampleCount,
    mask, setMask, maskBuffer, setMaskBuffer,
    es, setEs, best, setBest,
    selectionMode, setSelectionMode,
    rollCondition, setRollCondition
  } = usePrepareState();

  // Create a state-like object for compatibility with existing components
  const state = useMemo(() => ({
    courseId: courseId || null,
    holeId: holeId || null,
    currentHole,
    start: start || null,
    pin: pin || null,
    aim: aim || null,
    skillPreset: skill,
    maxCarry,
    bounds: null,
    viewBookmarks: null,
    mergedFeaturesVersion: 1,
    maskPngMeta: mask || null,
    slopePngMeta: null,
    photorealEnabled: false,
    selectionMode,
    rollCondition,
  }), [courseId, holeId, currentHole, start, pin, aim, skill, maxCarry, mask, selectionMode, rollCondition]);

  const dispatch = (event: any) => {
    switch (event.type) {
      case 'COURSE_LOADED':
        setCourseId(event.payload.courseId);
        setCurrentHole(1);
        setHoleId(`${event.payload.courseId.replace('course-', '')}-hole-1`);
        break;
      case 'HOLE_CHANGED':
        setHoleId(event.payload.holeId);
        setCurrentHole(event.payload.holeNumber);
        // Don't reset start point if GPS is active
        if (!isGPSActive) {
          setStart(undefined);
        }
        setPin(undefined);
        setAim(undefined);
        break;
    }
  };

  const setPoint = useCallback((type: 'start' | 'aim' | 'pin', point: any) => {
    switch (type) {
      case 'start':
        setStart(point);
        break;
      case 'aim':
        setAim(point);
        break;
      case 'pin':
        setPin(point);
        break;
    }
  }, [setStart, setAim, setPin]);

  const changeHole = (holeNumber: number) => {
    const holeId = `${courseId?.replace('-1', '')}-hole-${holeNumber}`;
    dispatch({ type: 'HOLE_CHANGED', payload: { holeId, holeNumber } });
  };

  // Auto-navigate to hole 1 when course is first loaded
  useEffect(() => {
    if (courseId && 
        holePolylinesByRef?.size > 0 && 
        vectorFeatures && 
        cesiumViewerRef && 
        !courseNavigationInitialized) {
      
      console.log('🎯 Auto-navigating to hole 1 after course load');
      setCourseNavigationInitialized(true);
      
      // Trigger hole navigation programmatically 
      // Use a small delay to ensure everything is ready
      setTimeout(() => {
        changeHole(1);
      }, 500);
    }
  }, [courseId, holePolylinesByRef, vectorFeatures, cesiumViewerRef, courseNavigationInitialized, changeHole]);

  const handleSkillChange = (newSkill: typeof SKILL_PRESETS[0]) => {
    setSkill(newSkill);
  };


  const handleCourseSelect = async (course: { id: string; name: string; osm?: { seeds: string[] } }) => {
    try {
      setLoadingCourse(true);
      setLoadingProgress({ stage: 'Importing course data from OpenStreetMap...', progress: 10 });
      console.log('🏌️ Starting course import for:', course.name);
      
      // Determine seeds based on course type
      const seeds = course.osm?.seeds || [course.id];
      
      // Import course data from OSM
      const response = await fetch('/api/courses/import-osm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seeds: seeds }),
      });

      if (!response.ok) {
        throw new Error('Failed to import course');
      }

      setLoadingProgress({ stage: 'Processing course features...', progress: 40 });
      const importData: ImportResponse = await response.json();
      console.log('🎯 Course import successful:', importData.course);
      console.log('🎯 Features structure:', Object.keys(importData.features || {}));
      console.log('🎯 Features:', importData.features);
      
      // Count total features for progress tracking
      const totalFeatures = Object.values(importData.features || {}).flat().length;
      setLoadingProgress({ stage: `Processing ${totalFeatures} course features...`, progress: 50 });
      
      // Store original course bbox for re-rasterization
      setOriginalCourseBbox(importData.course.bbox);
      
      // Create client-side mask from features (strict polygon-only)
      console.log('🎨 Creating client-side mask from features...');
      setLoadingProgress({ stage: 'Creating course raster mask...', progress: 70 });
      const maskResult = createMaskFromFeatures(importData.features, importData.course.bbox);
      console.log('✅ Mask created:', { 
        width: maskResult.width, 
        height: maskResult.height,
        bbox: maskResult.bbox,
        aspectPx: maskResult.aspectPx?.toFixed(4),
        aspectDeg: maskResult.aspectDeg?.toFixed(4)
      });
      
      // Create legacy maskBuffer for compatibility
      setLoadingProgress({ stage: 'Preparing course data structures...', progress: 80 });
      const maskBuffer: MaskBuffer = {
        width: maskResult.width,
        height: maskResult.height,
        bbox: maskResult.bbox,
        data: maskResult.imageData.data
      };
      
      // Build hole polylines map for navigation
      const polylinesByRef = new Map();
      importData.holes.forEach(hole => {
        polylinesByRef.set(hole.ref, {
          positions: hole.polyline.positions,
          par: hole.polyline.par,
          dist: hole.polyline.dist
        });
      });
      
      setLoadingProgress({ stage: 'Initializing 3D visualization...', progress: 90 });
      
      // Update prepare state
      setCourseId(course.id);
      setHoleId(`${course.id}-hole-1`);
      setCurrentHole(1);
      
      // Reset navigation flag so auto-navigation can trigger
      setCourseNavigationInitialized(false);
      
      // Set mask metadata (compatible with existing code)
      setMask(prev => ({
        url: '', // Not needed for client-side buffer
        width: maskBuffer.width,
        height: maskBuffer.height,
        bbox: maskBuffer.bbox,
        paletteVersion: 1,
        // Add course bbox for camera positioning
        courseBbox: importData.course.bbox
      }));
      
      // Store mask buffer for sampling
      setMaskBuffer(maskBuffer);
      setElevationMaskBuffer(maskBuffer);
      
      // Elevation baking removed - now using live elevation sampling in optimizers
      
      // Store vector features for layer rendering
      setVectorFeatures(importData.features);
      
      
      // Store hole polylines for navigation
      setHolePolylines(importData.holes);
      setHolePolylinesByRef(polylinesByRef);
      
      // Legacy hole markers for compatibility (generate from holes)
      const holeMarkers = importData.holes.map((hole, index) => ({
        number: parseInt(hole.ref) || (index + 1),
        par: hole.polyline.par || 4,
        coordinates: [
          hole.polyline.positions[0]?.lon || 0,
          hole.polyline.positions[0]?.lat || 0
        ] as [number, number]
      }));
      setHoleMarkers(holeMarkers);
      
      // Reset points when switching courses
      setStart(undefined);
      setPin(undefined);
      setAim(undefined);
      setEs(undefined);
      setBest(undefined);
      
      setLoadingProgress({ stage: 'Course loaded successfully!', progress: 100 });
      
      console.log('🏁 Course loading complete!', {
        courseId: course.id,
        courseName: course.name,
        bbox: importData.course.bbox
      });
      
      // Small delay to show completion message
      setTimeout(() => {
        setLoadingProgress({ stage: '', progress: 0 });
      }, 1000);
      
    } catch (error) {
      console.error('❌ Failed to load course:', error);
      setLoadingProgress({ stage: 'Error loading course', progress: 0 });
      // TODO: Show error message to user
    } finally {
      setLoadingCourse(false);
    }
  };

  // Re-rasterize mask when user polygons change
  useEffect(() => {
    if (!vectorFeatures || !originalCourseBbox) return;
    
    console.log('🎨 Re-rasterizing mask with', userPolygons.length, 'user polygons...');
    console.log('🎨 User polygons:', userPolygons.map(p => ({ id: p.id, condition: p.condition, vertices: p.positionsLL.length })));
    
    try {
      // Create new mask from original features using the ORIGINAL course bbox
      // This prevents coordinate drift from repeated bbox expansion
      const maskResult = createMaskFromFeatures(vectorFeatures, originalCourseBbox);
      
      // Create the mask buffer
      const newMaskBuffer: MaskBuffer = {
        width: maskResult.width,
        height: maskResult.height,
        bbox: maskResult.bbox,
        data: maskResult.imageData.data
      };
      
      // Apply user polygons to the mask (if any)
      console.log(`🎨 About to apply ${userPolygons.length} user polygons to mask`);
      const finalMaskBuffer: MaskBuffer = userPolygons.length > 0 
        ? applyUserPolygonsToMask(newMaskBuffer, userPolygons)
        : newMaskBuffer;
      console.log(`🎨 Final mask buffer created, dimensions: ${finalMaskBuffer.width}x${finalMaskBuffer.height}`);
      
      // Elevation baking removed - using live sampling in optimizers instead
      
      // Update the mask buffer state
      setMaskBuffer(finalMaskBuffer);
      setElevationMaskBuffer(finalMaskBuffer);
      
      console.log('✅ Mask re-rasterized successfully with', userPolygons.length, 'user polygons');
      console.log('🎯 Updated mask buffer for optimizer:', {
        width: finalMaskBuffer.width,
        height: finalMaskBuffer.height,
        dataLength: finalMaskBuffer.data.length
      });
      
    } catch (error) {
      console.error('❌ Failed to re-rasterize mask:', error);
    }
  }, [userPolygons, vectorFeatures, originalCourseBbox]);

  // PrepareTab content rendered inline to avoid component recreation
  const prepareTabContent = (
    <DrawingManagerContext.Provider value={{ manager: drawingManager, state: drawingState }}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
      {/* Mobile: Show viewer first, then controls */}
      {/* Desktop: Left Sidebar */}
      <div className="order-2 lg:order-1 lg:col-span-3 space-y-3 lg:space-y-4">
        <CoursePicker 
          selectedCourseId={courseId || null} 
          onCourseSelect={handleCourseSelect}
        />
        <HoleNavigator 
          currentHole={state.currentHole} 
          onHoleChange={changeHole}
          holePolylinesByRef={holePolylinesByRef}
          holeFeatures={vectorFeatures}
          cesiumViewer={cesiumViewerRef}
          pinLocation={pin}
          onAutoNavigate={async (points) => {
            console.log('🎯 Starting hole navigation with elevation sampling...');
            
            // Sample all elevations in parallel before setting points
            const elevationPromises: Promise<any>[] = [];
            
            // Don't update start point if GPS is active
            if (points.start && !isGPSActive) {
              elevationPromises.push(samplePointElevation(points.start, 'start'));
            }
            if (points.aim) {
              elevationPromises.push(samplePointElevation(points.aim, 'aim'));
            }
            if (points.pin) {
              elevationPromises.push(samplePointElevation(points.pin, 'pin'));
            }
            
            try {
              // Wait for all elevation sampling to complete
              await Promise.all(elevationPromises);
              console.log('✅ All elevations sampled, setting points...');
              
              // Now set the points - UI will render with correct elevations
              // Don't set start point if GPS is active
              if (points.start && !isGPSActive) setStart(points.start);
              if (points.aim) setAim(points.aim);
              if (points.pin) setPin(points.pin);
              
              console.log('✅ Hole navigation complete for hole', currentHole);
              
            } catch (error) {
              console.warn('⚠️ Some elevation sampling failed, setting points anyway:', error);
              // Set points even if elevation sampling fails
              // Don't set start point if GPS is active
              if (points.start && !isGPSActive) setStart(points.start);
              if (points.aim) setAim(points.aim);
              if (points.pin) setPin(points.pin);
              
              console.log('✅ Hole navigation complete for hole', currentHole, '(with elevation warnings)');
            }
          }}
        />
        
        <ConditionDrawer />
        <OptimizerPanel 
          viewer={cesiumViewerRef}
          start={start}
          pin={pin}
          aim={aim}
          skill={skill}
          rollCondition={rollCondition}
          maxCarry={maxCarry}
          maskBuffer={maskBuffer}
          sampleCount={sampleCount}
          onSampleCountChange={setSampleCount}
          onAimSet={setAim}
          onOptimizationComplete={(candidates) => {
            console.log('🎯 Optimization complete:', candidates.length, 'candidates');
          }}
        />
      </div>

      {/* Mobile: Viewer first, Desktop: Center - 3D Canvas */}
      <div className="order-1 lg:order-2 lg:col-span-6">
        <CesiumCanvas 
          state={state}
          onPointSet={setPoint}
          maskBuffer={maskBuffer}
          esResult={esResult}
          vectorFeatures={vectorFeatures}
          loadingCourse={loadingCourse}
          loadingProgress={loadingProgress}
          nSamples={sampleCount}
          holePolylinesByRef={holePolylinesByRef}
          holeFeatures={vectorFeatures}
          currentHole={currentHole}
          pinLocation={pin}
          onGPSStateChange={setIsGPSActive}
          onViewerReady={(viewer) => {
            setCesiumViewerRef(viewer);
            // Pass the drawing manager back to dashboard level
            if (viewer.drawingManager) {
              setDrawingManager(viewer.drawingManager);
            }
            
          }}
          onDrawingStateChange={(state) => {
            setDrawingState(state);
          }}
          onUserPolygonsChange={setUserPolygons}
          onSampleData={(sampleData) => {
            // Store the sample data from CesiumCanvas for DispersionInspector to use
            console.log('🎯 Dashboard received sample data from CesiumCanvas:', sampleData.points.length, 'points');
            console.log('🎯 Sample data class distribution:', sampleData.classes.reduce((acc: Record<number, number>, cls: number) => {
              acc[cls] = (acc[cls] || 0) + 1;
              return acc;
            }, {}));
            setCurrentSampleData(sampleData);
          }}
          onESWorkerCall={async (params) => {
            // Create worker and call it with the params
            try {
              const worker = new Worker('/src/workers/esWorker.ts', { type: 'module' });
              
              return new Promise((resolve, reject) => {
                worker.onmessage = (event) => {
                  const result = event.data;
                  if (result.error) {
                    reject(new Error(result.error));
                  } else {
                    // Update the ES result state
                    setESResult(result);
                    resolve(result);
                  }
                  worker.terminate();
                };
                
                worker.onerror = (error) => {
                  reject(error);
                  worker.terminate();
                };
                
                worker.postMessage(params);
              });
            } catch (error) {
              console.error('Error creating ES worker:', error);
            }
          }}
        />
        <MetricsBar state={state} esResult={esResult} maskBuffer={maskBuffer} />
      </div>

      {/* Mobile: Controls last, Desktop: Right Sidebar */}
      <div className="order-3 lg:order-3 lg:col-span-3 space-y-3 lg:space-y-4">
        <AimPanel 
          state={state}
          onPointSet={setPoint}
          onSkillChange={handleSkillChange}
          onRollConditionChange={setRollCondition}
          onSelectionModeChange={setSelectionMode}
        />
        <DispersionInspector 
          start={start}
          aim={aim}
          pin={pin}
          skill={skill}
          rollCondition={rollCondition}
          mask={mask}
          maskBuffer={maskBuffer}
          sampleCount={sampleCount}
          sampleData={currentSampleData}
          onESResult={(result) => {
            setEs(result);
            // Cast the result to include typed arrays for CesiumCanvas
            setESResult(result as any);
          }}
        />
      </div>
    </div>
    </DrawingManagerContext.Provider>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Tabs */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex items-center h-16">
            <div className="flex items-center space-x-2">
              <i className="fas fa-golf-ball text-primary text-xl"></i>
              <h1 className="text-xl font-bold text-foreground">Golf Analytics Pro</h1>
            </div>
            
            {/* Tabs in Header - Centered */}
            <div className="flex-1 flex justify-center">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-6 bg-transparent h-auto p-0">
                  <TabsTrigger 
                    value="prepare" 
                    className="tab-button flex items-center justify-center whitespace-nowrap py-2 px-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
                  >
                    <i className="fas fa-map-marked-alt mr-2"></i>Prepare
                  </TabsTrigger>
                  <TabsTrigger 
                    value="play"
                    className="tab-button flex items-center justify-center whitespace-nowrap py-2 px-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
                  >
                    <i className="fas fa-play mr-2"></i>Play
                  </TabsTrigger>
                  <TabsTrigger 
                    value="stats"
                    className="tab-button flex items-center justify-center whitespace-nowrap py-2 px-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
                  >
                    <i className="fas fa-chart-bar mr-2"></i>Stats
                  </TabsTrigger>
                  <TabsTrigger 
                    value="trends"
                    className="tab-button flex items-center justify-center whitespace-nowrap py-2 px-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
                  >
                    <i className="fas fa-chart-line mr-2"></i>Trends
                  </TabsTrigger>
                  <TabsTrigger 
                    value="dispersion"
                    className="tab-button flex items-center justify-center whitespace-nowrap py-2 px-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
                  >
                    <i className="fas fa-bullseye mr-2"></i>Dispersion
                  </TabsTrigger>
                  <TabsTrigger 
                    value="about"
                    className="tab-button flex items-center justify-center whitespace-nowrap py-2 px-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
                  >
                    <i className="fas fa-info-circle mr-2"></i>About
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <i className="fas fa-bell text-lg"></i>
              </Button>
              <Button variant="ghost" size="icon">
                <i className="fas fa-cog text-lg"></i>
              </Button>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-12 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsContent value="prepare" className="mt-0">
            {prepareTabContent}
          </TabsContent>

          <TabsContent value="play" className="mt-0">
            {prepareTabContent}
          </TabsContent>

          <TabsContent value="stats" className="mt-0">
            <StatsTab />
          </TabsContent>

          <TabsContent value="trends" className="mt-0">
            <TrendsTab />
          </TabsContent>

          <TabsContent value="dispersion" className="mt-0">
            <DispersionTab />
          </TabsContent>

          <TabsContent value="about" className="mt-0">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}