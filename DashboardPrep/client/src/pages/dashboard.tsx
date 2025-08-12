import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CoursePicker from '../components/prepare/CoursePicker';
import HoleNavigator from '../components/prepare/HoleNavigator';
import CesiumCanvas from '../components/prepare/CesiumCanvas';
import ConditionDrawer from '../components/prepare/ConditionDrawer';
import AimPanel from '../components/prepare/AimPanel';
import DispersionInspector from '../components/prepare/DispersionInspector';
import OptimizerPanel from '../components/prepare/OptimizerPanel';
import ShotMetrics from '../components/prepare/ShotMetrics';
import MetricsBar from '../components/prepare/MetricsBar';
import VectorLayerPanel from '../components/prepare/VectorLayerPanel';
import StatsTab from '../components/placeholders/StatsTab';
import TrendsTab from '../components/placeholders/TrendsTab';
import DispersionTab from '../components/placeholders/DispersionTab';
import { usePrepareState } from '../hooks/usePrepareState';
import { SKILL_PRESETS } from '@shared/types';
import { createMaskFromFeatures } from '@/lib/maskPainter';
import type { ImportResponse } from '@shared/overpass';
import type { LatLon, ESResult } from '@shared/types';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('prepare');
  const [currentHole, setCurrentHole] = useState(1);
  const [loadingCourse, setLoadingCourse] = useState(false);
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
  const [vectorLayerToggles, setVectorLayerToggles] = useState<Record<string, boolean>>({
    polylines: true,
    greens: false,
    fairways: false,
    bunkers: false,
    water: false,
    hazards: false,
    ob: false
  });
  const {
    courseId, holeId, setCourseId, setHoleId,
    start, setStart, pin, setPin, aim, setAim,
    skill, setSkill, maxCarry, setMaxCarry,
    mask, setMask, maskBuffer, setMaskBuffer,
    es, setEs, best, setBest,
    selectionMode, setSelectionMode
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
  }), [courseId, holeId, currentHole, start, pin, aim, skill, maxCarry, mask, selectionMode]);

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
        setStart(undefined);
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

  const handleSkillChange = (newSkill: typeof SKILL_PRESETS[0]) => {
    setSkill(newSkill);
  };

  const handleVectorLayerToggle = (layerType: string, enabled: boolean) => {
    setVectorLayerToggles(prev => ({
      ...prev,
      [layerType]: enabled
    }));
  };

  const handleCourseSelect = async (course: { id: string; name: string; osm: { seeds: string[] } }) => {
    try {
      setLoadingCourse(true);
      console.log('🏌️ Starting course import for:', course.name);
      
      // Import course data from OSM
      const response = await fetch('/api/courses/import-osm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ seeds: course.osm.seeds }),
      });

      if (!response.ok) {
        throw new Error('Failed to import course');
      }

      const importData: ImportResponse = await response.json();
      console.log('🎯 Course import successful:', importData.course);
      console.log('🎯 Features structure:', Object.keys(importData.features || {}));
      console.log('🎯 Features:', importData.features);
      
      // Create client-side mask from features (strict polygon-only)
      console.log('🎨 Creating client-side mask from features...');
      const maskResult = createMaskFromFeatures(importData.features, importData.course.bbox);
      console.log('✅ Mask created:', { 
        width: maskResult.width, 
        height: maskResult.height,
        bbox: maskResult.bbox,
        aspectPx: maskResult.aspectPx?.toFixed(4),
        aspectDeg: maskResult.aspectDeg?.toFixed(4)
      });
      
      // Create legacy maskBuffer for compatibility
      const maskBuffer = {
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
      
      // Update prepare state
      setCourseId(course.id);
      setHoleId(`${course.id}-hole-1`);
      setCurrentHole(1);
      
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
      
      console.log('🏁 Course loading complete!', {
        courseId: course.id,
        courseName: course.name,
        bbox: importData.course.bbox
      });
      
    } catch (error) {
      console.error('❌ Failed to load course:', error);
      // TODO: Show error message to user
    } finally {
      setLoadingCourse(false);
    }
  };

  // PrepareTab content rendered inline to avoid component recreation
  const prepareTabContent = (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mobile-stack">
      {/* Left Sidebar */}
      <div className="lg:col-span-1 space-y-6">
        <CoursePicker 
          selectedCourseId={courseId || null} 
          onCourseSelect={handleCourseSelect}
        />
        <HoleNavigator 
          currentHole={state.currentHole} 
          onHoleChange={changeHole}
          holePolylinesByRef={holePolylinesByRef}
          holeFeatures={vectorFeatures}
          onAutoNavigate={(points) => {
            if (points.start) setStart(points.start);
            if (points.aim) setAim(points.aim);
            if (points.pin) setPin(points.pin);
          }}
        />
        <VectorLayerPanel 
          onLayerToggle={handleVectorLayerToggle}
          availableFeatures={vectorFeatures}
        />
        <ConditionDrawer />
      </div>

      {/* Center - 3D Canvas */}
      <div className="lg:col-span-2">
        <CesiumCanvas 
          state={state}
          onPointSet={setPoint}
          maskBuffer={maskBuffer}
          esResult={esResult}
          vectorFeatures={vectorFeatures}
          vectorLayerToggles={vectorLayerToggles}
        />
        <MetricsBar state={state} />
      </div>

      {/* Right Sidebar */}
      <div className="lg:col-span-1 space-y-6">
        <AimPanel 
          state={state}
          onPointSet={setPoint}
          onSkillChange={handleSkillChange}
          onSelectionModeChange={setSelectionMode}
        />
        <DispersionInspector 
          start={start}
          aim={aim}
          pin={pin}
          skill={skill}
          mask={mask}
          maskBuffer={maskBuffer}
          onESResult={(result) => {
            setEs(result);
            // Cast the result to include typed arrays for CesiumCanvas
            setESResult(result as any);
          }}
        />
        <ShotMetrics 
          esResult={esResult}
          status={esResult ? 'converged' : 'idle'}
        />
        <OptimizerPanel 
          start={start}
          pin={pin}
          skill={skill}
          maxCarry={maxCarry}
          mask={mask}
          maskBuffer={maskBuffer}
          onBestResult={setBest}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <i className="fas fa-golf-ball text-primary text-xl"></i>
                <h1 className="text-xl font-bold text-secondary">Golf Analytics Pro</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon">
                <i className="fas fa-bell text-lg"></i>
              </Button>
              <Button variant="ghost" size="icon">
                <i className="fas fa-cog text-lg"></i>
              </Button>
              <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                <i className="fas fa-user text-white text-sm"></i>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 bg-transparent h-auto p-0">
              <TabsTrigger 
                value="prepare" 
                className="tab-button flex items-center justify-center whitespace-nowrap py-4 px-1 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
              >
                <i className="fas fa-map-marked-alt mr-2"></i>Prepare
              </TabsTrigger>
              <TabsTrigger 
                value="play"
                className="tab-button flex items-center justify-center whitespace-nowrap py-4 px-1 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
              >
                <i className="fas fa-play mr-2"></i>Play
              </TabsTrigger>
              <TabsTrigger 
                value="stats"
                className="tab-button flex items-center justify-center whitespace-nowrap py-4 px-1 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
              >
                <i className="fas fa-chart-bar mr-2"></i>Stats
              </TabsTrigger>
              <TabsTrigger 
                value="trends"
                className="tab-button flex items-center justify-center whitespace-nowrap py-4 px-1 border-b-2 border-transparent data-[state=active]:border-primary data-[state=color]:text-primary font-medium text-sm"
              >
                <i className="fas fa-chart-line mr-2"></i>Trends
              </TabsTrigger>
              <TabsTrigger 
                value="dispersion"
                className="tab-button flex items-center justify-center whitespace-nowrap py-4 px-1 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary font-medium text-sm"
              >
                <i className="fas fa-bullseye mr-2"></i>Dispersion
              </TabsTrigger>
            </TabsList>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
            </main>
          </Tabs>
        </div>
      </div>
    </div>
  );
}