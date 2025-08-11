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
  const [esResult, setESResult] = useState<ESResult & { samplePoints?: Array<{point: LatLon, classId: number}>, avgProximity?: number, avgProximityInPlay?: number }>();
  const [cameraPosition, setCameraPosition] = useState<{ position: LatLon, heading: number, pitch: number, height: number }>();
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
      
      // Use the first hole for now
      const firstHole = importData.holes[0];
      
      // Create client-side mask from features
      console.log('🎨 Creating client-side mask from features...');
      const maskBuffer = createMaskFromFeatures(firstHole.features, firstHole.bbox);
      console.log('✅ Mask created:', { 
        width: maskBuffer.width, 
        height: maskBuffer.height,
        bbox: maskBuffer.bbox 
      });
      
      // Update prepare state
      setCourseId(course.id);
      setHoleId(`${course.id}-hole-1`);
      setCurrentHole(1);
      
      // Set mask metadata (compatible with existing code)
      setMask({
        url: '', // Not needed for client-side buffer
        width: maskBuffer.width,
        height: maskBuffer.height,
        bbox: maskBuffer.bbox,
        paletteVersion: 1,
        // Add course bbox for camera positioning
        courseBbox: importData.course.bbox
      });
      
      // Store mask buffer for sampling
      setMaskBuffer(maskBuffer);
      
      // Store hole markers
      setHoleMarkers(importData.holeMarkers || []);
      
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
          onAutoNavigate={(points) => {
            if (points.start) setStart(points.start);
            if (points.aim) setAim(points.aim);
            if (points.pin) setPin(points.pin);
          }}
          onCameraPosition={(camera) => {
            setCameraPosition(camera);
          }}
          maskBuffer={maskBuffer}
        />
        <ConditionDrawer />
      </div>

      {/* Center - 3D Canvas */}
      <div className="lg:col-span-2">
        <CesiumCanvas 
          state={state}
          onPointSet={setPoint}
          maskBuffer={maskBuffer}
          holeMarkers={holeMarkers}
          samplePoints={esResult?.samplePoints}
          cameraPosition={cameraPosition}
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
            setESResult(result);
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