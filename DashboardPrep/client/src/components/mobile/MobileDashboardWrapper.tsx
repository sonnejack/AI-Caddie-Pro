import React, { useEffect } from 'react';
import { HeaderMobile } from './HeaderMobile';
import { TopDrawer } from './TopDrawer';
import { TopTogglesRow } from './TopTogglesRow';
import { HoleChip } from './HoleChip';
import { ShotMetricsStrip } from './ShotMetricsStrip';
import { FooterMobile } from './FooterMobile';
import { CardsSwitcherChip } from './CardsSwitcherChip';
import { ShotSetupCard } from './ShotSetupCard';
import { DrawingToolsCard } from './DrawingToolsCard';
import { DispersionAnalysisCard } from './DispersionAnalysisCard';
import CesiumCanvas from '@/components/prepare/CesiumCanvas';
import { useMobileUI } from '@/hooks/useMobileUI';
import type { PrepareState, LatLon, SkillPreset, RollCondition } from '@/lib/types';

interface CuratedCourse {
  id: string;
  name: string;
  osm: { seeds: string[] };
}

interface MobileDashboardWrapperProps {
  // Pass through all the existing dashboard state and props
  state: PrepareState;
  setPoint: (type: 'start' | 'aim' | 'pin', point: LatLon) => void;
  handleSkillChange: (skill: SkillPreset) => void;
  setRollCondition: (rollCondition: RollCondition) => void;
  setSelectionMode: (mode: 'start' | 'aim' | 'pin' | null) => void;
  changeHole: (holeNumber: number) => void;
  cesiumViewerRef: React.MutableRefObject<any>;
  holePolylinesByRef?: Map<string, any>;
  vectorFeatures?: any;
  pin?: LatLon | null;
  handleCourseSelect?: (course: CuratedCourse) => void;
  sampleCount?: number;
  onSampleCountChange?: (count: number) => void;
  // Add other props as needed
  [key: string]: any;
}

export const MobileDashboardWrapper: React.FC<MobileDashboardWrapperProps> = ({
  state,
  setPoint,
  handleSkillChange,
  setRollCondition,
  setSelectionMode,
  changeHole,
  cesiumViewerRef,
  holePolylinesByRef,
  vectorFeatures,
  pin,
  handleCourseSelect,
  sampleCount,
  onSampleCountChange,
  ...otherProps
}) => {
  // Sync mobile UI store with dashboard state
  const { setCurrentHole } = useMobileUI();
  
  useEffect(() => {
    setCurrentHole(state.currentHole);
  }, [state.currentHole, setCurrentHole]);

  // Mobile-specific handlers that bridge to existing dashboard logic
  const handleToggle3DTiles = () => {
    // TODO: Connect to existing 3D tiles toggle logic
    console.log('Mobile: Toggle 3D tiles');
  };

  const handleToggleFeatures = () => {
    // TODO: Connect to existing features toggle logic
    console.log('Mobile: Toggle features');
  };

  const handleOptimize = () => {
    // TODO: Connect to existing optimize logic
    console.log('Mobile: Optimize');
  };

  const handleCameraPreset = (preset: 'pov' | 'overview' | 'tee' | 'fairway' | 'green') => {
    // TODO: Connect to existing camera preset logic
    console.log('Mobile: Camera preset', preset);
  };

  // Format coordinates for mobile display
  const formatCoord = (point: LatLon | null) => {
    if (!point) return 'Not set';
    return `${point.lat.toFixed(4)}°N, ${Math.abs(point.lon).toFixed(4)}°${point.lon >= 0 ? 'E' : 'W'}`;
  };

  // Get current hole par from existing data
  const getCurrentHolePar = () => {
    if (!holePolylinesByRef || !state.currentHole) return 4;
    const holeData = holePolylinesByRef.get(state.currentHole.toString());
    return holeData?.par || 4;
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Full-bleed 3D Canvas Background */}
      <div className="absolute inset-0">
        <div className="h-full w-full">
          <CesiumCanvas 
            state={state}
            onPointSet={setPoint}
            {...otherProps}
          />
        </div>
      </div>

      {/* Mobile UI Overlay */}
      
      {/* Fixed Elements */}
      <HeaderMobile />
      <TopDrawer 
        selectedCourseId={state.courseId}
        onCourseSelect={handleCourseSelect}
      />
      
      <TopTogglesRow
        onToggle3DTiles={handleToggle3DTiles}
        onToggleFeatures={handleToggleFeatures}
        onToggleSlopeArrows={() => console.log('Mobile: Toggle slope arrows')}
        onToggleMaskFill={() => console.log('Mobile: Toggle mask fill')}
        onToggleMaskEdges={() => console.log('Mobile: Toggle mask edges')}
        onToggleSamples={() => console.log('Mobile: Toggle samples')}
        sampleCount={sampleCount}
        onSampleCountChange={onSampleCountChange}
      />
      
      <HoleChip
        par={getCurrentHolePar()}
        onPrevHole={() => changeHole(Math.max(1, state.currentHole - 1))}
        onNextHole={() => changeHole(Math.min(18, state.currentHole + 1))}
      />
      
      <ShotMetricsStrip
        totalDistance="287y" // TODO: Calculate from state
        totalPlaysLike="+15y"
        shotDistance="275y"
        shotPlaysLike="+12y"
        expectedStrokes="2.854" // TODO: Get from existing ES calculation
        avgProximity="42ft"
      />
      
      <FooterMobile
        onCameraPreset={handleCameraPreset}
        onOptimize={handleOptimize}
      />

      {/* Floating Elements */}
      <CardsSwitcherChip />
      
      <ShotSetupCard
        startCoords={formatCoord(state.start)}
        aimCoords={formatCoord(state.aim)}
        pinCoords={formatCoord(state.pin)}
        startElevation="sampling..." // TODO: Get from existing elevation system
        aimElevation="sampling..."
        pinElevation="sampling..."
        skillLevel={state.skillPreset.name}
        rollCondition={state.rollCondition}
        onSelectStart={() => {
          setSelectionMode('start');
        }}
        onSelectAim={() => {
          setSelectionMode('aim');
        }}
        onSelectPin={() => {
          setSelectionMode('pin');
        }}
      />
      
      <DrawingToolsCard
        onStartDrawing={(type) => console.log('Mobile: Start drawing', type)}
        onFinishDrawing={() => console.log('Mobile: Finish drawing')}
        onCancelDrawing={() => console.log('Mobile: Cancel drawing')}
        onRemoveLast={() => console.log('Mobile: Remove last')}
        onClearAll={() => console.log('Mobile: Clear all')}
      />
      
      <DispersionAnalysisCard
        expectedStrokes="2.854" // TODO: Get from existing calculation
        confidenceInterval="±0.023"
        landingConditions={[
          { condition: 'Fairway', percentage: 68, color: '#28B43C' },
          { condition: 'Rough', percentage: 22, color: '#556B2F' },
          { condition: 'Bunker', percentage: 8, color: '#D2B48C' },
          { condition: 'Water', percentage: 2, color: '#0078FF' },
        ]}
      />
    </div>
  );
};