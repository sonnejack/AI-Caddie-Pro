import { useMediaQuery } from "@/hooks/useMediaQuery";
import CesiumCanvas from "@/components/prepare/CesiumCanvas";
import ShotSetupMobile from "@/components/prepare/ShotSetupMobile";
import DrawingToolsExpandable from "@/components/prepare/DrawingToolsExpandable";
import DispersionInspectorMobile from "@/components/prepare/DispersionInspectorMobile";
import TogglesRow from "@/components/prepare/TogglesRow";
import HoleChip from "@/components/prepare/HoleChip";
import MetricsCardsMobile from "@/components/prepare/MetricsCardsMobile";
import CoursePicker from "@/components/prepare/CoursePicker";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserMenu } from "@/components/auth/UserMenu";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import OptimizerParamsSheet from "@/components/optimizer/OptimizerParamsSheet";
import OptimizerPanel from "@/components/prepare/OptimizerPanel";
import { useState, useRef } from "react";

interface MobileShellProps {
  // Pass through all the props that the desktop layout uses
  courseId: string | null;
  onCourseSelect: (course: any) => void;
  currentHole: number;
  onHoleChange: (hole: number) => void;
  holePolylinesByRef: Map<string, any>;
  holeFeatures: any;
  cesiumViewer: any;
  pinLocation: any;
  onAutoNavigate: (points: any) => void;
  state: any;
  onPointSet: (type: 'start' | 'aim' | 'pin', point: any) => void;
  onSkillChange: (skill: any) => void;
  onRollConditionChange: (condition: any) => void;
  onSelectionModeChange: (mode: any) => void;
  maskBuffer?: any;
  esResult?: any;
  vectorFeatures?: any;
  loadingCourse?: boolean;
  loadingProgress?: any;
  sampleCount?: number;
  onGPSStateChange?: (active: boolean) => void;
  onViewerReady?: (viewer: any) => void;
  onDrawingStateChange?: (state: any) => void;
  onUserPolygonsChange?: (polygons: any) => void;
  onSampleData?: (data: any) => void;
  onESWorkerCall?: (params: any) => void;
  onESResult?: (result: any) => void;
  start?: any;
  aim?: any;
  pin?: any;
  skill: any;
  rollCondition: any;
  mask?: any;
  currentSampleData?: any;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export default function MobileShell(props: MobileShellProps) {
  const isMobile = useMediaQuery("(max-width: 480px)");
  const [showUtilityTray, setShowUtilityTray] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTabMenu, setShowTabMenu] = useState(false);
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  
  // Cesium viewer reference to call camera functions and access toggle states
  const [cesiumViewerRef, setCesiumViewerRef] = useState<any>(null);
  
  // Hidden optimizer panel ref for mobile optimize button
  const optimizerRef = useRef<any>(null);
  
  const APP_HEADER = 56;  // Overall app header with tabs
  const CESIUM_HEADER = 48; // Course selection and icons header
  const FOOTER = 60;      // Camera buttons footer
  
  if (!isMobile) return null;

  // Helper functions for tab handling
  const getTabDisplayName = (tab: string) => {
    const tabNames: Record<string, string> = {
      prepare: 'Prepare',
      play: 'Play',
      stats: 'Stats',
      trends: 'Trends',
      dispersion: 'Dispersion',
      about: 'About'
    };
    return tabNames[tab] || 'Prepare';
  };

  const getTabIcon = (tab: string) => {
    const tabIcons: Record<string, string> = {
      prepare: 'fas fa-map-marked-alt',
      play: 'fas fa-play',
      stats: 'fas fa-chart-bar',
      trends: 'fas fa-chart-line',
      dispersion: 'fas fa-bullseye',
      about: 'fas fa-info-circle'
    };
    return tabIcons[tab] || 'fas fa-map-marked-alt';
  };

  const handleTabChange = (newTab: string) => {
    if (props.onTabChange) {
      props.onTabChange(newTab);
    }
    setShowTabMenu(false);
  };

  return (
    <div className="fixed inset-0 md:hidden">
      {/* App Header - Logo, tabs and utilities */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-card/95 backdrop-blur border-b border-border flex items-center px-3 gap-2 pt-[env(safe-area-inset-top)]">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <i className="fas fa-golf-ball text-primary text-lg"></i>
          <DropdownMenu open={showTabMenu} onOpenChange={setShowTabMenu}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" 
                size="sm"
                className="tab-button h-8 px-3 text-xs font-medium border-b-2 border-primary text-primary bg-transparent"
              >
                <i className={`${getTabIcon(props.activeTab || 'prepare')} mr-1 text-xs`}></i>
                {getTabDisplayName(props.activeTab || 'prepare')} <i className="fas fa-chevron-down ml-1 text-xs"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              <DropdownMenuItem onClick={() => handleTabChange('prepare')}>
                <i className="fas fa-map-marked-alt text-sm mr-2"></i>
                Prepare
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabChange('play')}>
                <i className="fas fa-play text-sm mr-2"></i>
                Play
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabChange('stats')}>
                <i className="fas fa-chart-bar text-sm mr-2"></i>
                Stats
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabChange('trends')}>
                <i className="fas fa-chart-line text-sm mr-2"></i>
                Trends
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabChange('dispersion')}>
                <i className="fas fa-bullseye text-sm mr-2"></i>
                Dispersion
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleTabChange('about')}>
                <i className="fas fa-info-circle text-sm mr-2"></i>
                About
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-1">
          <DropdownMenu open={showUtilityTray} onOpenChange={setShowUtilityTray}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline" 
                size="sm"
                className="h-8 w-8 p-0 border border-border bg-card/80 backdrop-blur"
              >
                <i className="fas fa-ellipsis-v text-xs"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem 
                onSelect={(e) => {
                  e.preventDefault();
                  alert('Notifications feature coming soon!');
                  setShowUtilityTray(false);
                }}
              >
                <i className="fas fa-bell text-sm mr-2"></i>
                Notifications
              </DropdownMenuItem>
              <DropdownMenuItem 
                onSelect={(e) => {
                  e.preventDefault();
                  alert('Settings feature coming soon!');
                  setShowUtilityTray(false);
                }}
              >
                <i className="fas fa-cog text-sm mr-2"></i>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <div className="flex items-center w-full">
                  <i className="fas fa-palette text-sm mr-2"></i>
                  <span className="flex-1">Theme</span>
                  <ThemeToggle />
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs border border-border bg-card/80 backdrop-blur"
            onClick={() => setShowAdvanced(true)}
          >
            Advanced
          </Button>
          
          <UserMenu />
        </div>
      </header>

      {/* Cesium Header - Course selector and viewer controls */}
      <div 
        className="fixed left-0 right-0 z-40 bg-card/95 backdrop-blur border-b border-border flex items-center px-3 gap-2"
        style={{ top: APP_HEADER, height: CESIUM_HEADER }}
      >
        {/* Course Selector */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs border border-border bg-card/80 backdrop-blur"
          onClick={() => setShowCoursePicker(!showCoursePicker)}
        >
          {props.courseId ? 
            props.courseId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
            'Select Course'
          }
          <i className="fas fa-chevron-down ml-1 text-xs"></i>
        </Button>

        {/* Viewer Controls */}
        <div className="flex items-center gap-1 ml-auto">
          <TogglesRow 
            photorealEnabled={cesiumViewerRef?.photorealEnabled || false}
            gpsEnabled={cesiumViewerRef?.isGPSActive || false}
            maskEnabled={cesiumViewerRef?.rasterMode === 'fill'}
            samplesEnabled={cesiumViewerRef?.showSamples !== false}
            onPhotorealToggle={() => {
              if (cesiumViewerRef?.handleGoogleTilesToggle) {
                cesiumViewerRef.handleGoogleTilesToggle();
              }
            }}
            onGPSToggle={() => {
              if (cesiumViewerRef?.toggleGPS) {
                cesiumViewerRef.toggleGPS();
              }
            }}
            onMaskToggle={() => {
              if (cesiumViewerRef?.setRasterMode) {
                const newMode = cesiumViewerRef.rasterMode === 'fill' ? 'off' : 'fill';
                cesiumViewerRef.setRasterMode(newMode);
              }
            }}
            onSamplesToggle={() => {
              if (cesiumViewerRef?.handleSamplesToggle) {
                cesiumViewerRef.handleSamplesToggle(!cesiumViewerRef.showSamples);
              }
            }}
          />
        </div>
      </div>

      {/* Main Cesium Viewer - Full Screen from headers to footer */}
      <main 
        className="absolute left-0 right-0 z-0" 
        style={{ top: APP_HEADER + CESIUM_HEADER, bottom: FOOTER }}
      >
        <CesiumCanvas 
          state={props.state}
          onPointSet={props.onPointSet}
          maskBuffer={props.maskBuffer}
          esResult={props.esResult}
          vectorFeatures={props.vectorFeatures}
          loadingCourse={props.loadingCourse}
          loadingProgress={props.loadingProgress}
          nSamples={props.sampleCount}
          holePolylinesByRef={props.holePolylinesByRef}
          holeFeatures={props.holeFeatures}
          currentHole={props.currentHole}
          pinLocation={props.pinLocation}
          onGPSStateChange={props.onGPSStateChange}
          onViewerReady={(viewer) => {
            setCesiumViewerRef(viewer);
            if (props.onViewerReady) {
              props.onViewerReady(viewer);
            }
          }}
          onDrawingStateChange={props.onDrawingStateChange}
          onUserPolygonsChange={props.onUserPolygonsChange}
          onSampleData={props.onSampleData}
          onESWorkerCall={props.onESWorkerCall}
          hideMobileControls={true}
        />
      </main>

      {/* Floating Overlays */}
      <div className="pointer-events-none absolute inset-0 z-30">
        {/* Hole Navigation - Top Center */}
        <div className="pointer-events-auto fixed left-0 right-0 flex justify-center" style={{ top: APP_HEADER + CESIUM_HEADER + 8 }}>
          <HoleChip 
            currentHole={props.currentHole}
            onHoleChange={props.onHoleChange}
            holePolylinesByRef={props.holePolylinesByRef}
            holeFeatures={props.holeFeatures}
            onAutoNavigate={props.onAutoNavigate}
            cesiumViewer={props.cesiumViewer}
          />
        </div>
        
        {/* Shot Setup Card - Top Right, Compact */}
        <div className="pointer-events-auto fixed right-2 w-20" style={{ top: APP_HEADER + CESIUM_HEADER + 56 }}>
          <div className="glass-card-mobile">
            <ShotSetupMobile 
              state={props.state}
              onPointSet={props.onPointSet}
              onSkillChange={props.onSkillChange}
              onRollConditionChange={props.onRollConditionChange}
              onSelectionModeChange={props.onSelectionModeChange}
            />
          </div>
        </div>
        
        {/* Drawing Tools Card - Left Edge, Expandable */}
        <div className="pointer-events-auto fixed left-2 top-1/2 -translate-y-1/2">
          <div className="glass-card-mobile">
            <DrawingToolsExpandable />
          </div>
        </div>
        
        {/* Dispersion Analysis Card - Right Edge, Compact */}
        <div className="pointer-events-auto fixed right-2 max-w-[40%]" style={{ bottom: FOOTER + 120 }}>
          <div className="glass-card-mobile">
            <DispersionInspectorMobile 
              start={props.start}
              aim={props.aim}
              pin={props.pin}
              skill={props.skill}
              rollCondition={props.rollCondition}
              mask={props.mask}
              maskBuffer={props.maskBuffer}
              sampleCount={props.sampleCount}
              sampleData={props.currentSampleData}
              onESResult={props.onESResult}
            />
          </div>
        </div>
        
        {/* Shot Metrics - Individual Cards (No Wrapper) */}
        <div className="pointer-events-auto fixed left-3 right-3" style={{ bottom: FOOTER + 8 }}>
          <MetricsCardsMobile 
            state={props.state}
            esResult={props.esResult}
            maskBuffer={props.maskBuffer}
          />
        </div>
      </div>

      {/* Footer - Camera Buttons with Optimize in Middle */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-card/95 backdrop-blur border-t border-border flex items-center px-3 gap-2 pb-[env(safe-area-inset-bottom)]">
        <Button variant="outline" size="sm" className="whitespace-nowrap h-8 px-2 text-xs"
          onClick={() => {
            if (cesiumViewerRef && cesiumViewerRef.handleCameraPreset) {
              cesiumViewerRef.handleCameraPreset('shotpov');
            }
          }}
        >
          POV
        </Button>
        <Button variant="outline" size="sm" className="whitespace-nowrap h-8 px-2 text-xs"
          onClick={() => {
            if (cesiumViewerRef && cesiumViewerRef.handleCameraPreset) {
              cesiumViewerRef.handleCameraPreset('overview');
            }
          }}
        >
          Overview
        </Button>
        
        {/* Optimize Button - Center */}
        <Button 
          size="sm"
          className="bg-primary text-primary-foreground px-4 py-2 font-medium shadow-md mx-2"
          onClick={() => {
            // Call the hidden optimizer panel's run function
            if (optimizerRef.current?.handleRunOptimizer) {
              optimizerRef.current.handleRunOptimizer();
            }
          }}
        >
          OPTIMIZE
        </Button>
        
        <Button variant="outline" size="sm" className="whitespace-nowrap h-8 px-2 text-xs"
          onClick={() => {
            if (cesiumViewerRef && cesiumViewerRef.handleCameraPreset) {
              cesiumViewerRef.handleCameraPreset('tee');
            }
          }}
        >
          Tee
        </Button>
        <Button variant="outline" size="sm" className="whitespace-nowrap h-8 px-2 text-xs"
          onClick={() => {
            if (cesiumViewerRef && cesiumViewerRef.handleCameraPreset) {
              cesiumViewerRef.handleCameraPreset('fairway');
            }
          }}
        >
          Fairway
        </Button>
        <Button variant="outline" size="sm" className="whitespace-nowrap h-8 px-2 text-xs"
          onClick={() => {
            if (cesiumViewerRef && cesiumViewerRef.handleCameraPreset) {
              cesiumViewerRef.handleCameraPreset('green');
            }
          }}
        >
          Green
        </Button>
      </footer>

      {/* Course Picker Overlay */}
      {showCoursePicker && (
        <div 
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur p-4" 
          style={{ top: APP_HEADER }}
          onClick={(e) => {
            // Close if clicking the backdrop (not the content)
            if (e.target === e.currentTarget) {
              setShowCoursePicker(false);
            }
          }}
        >
          <div className="h-full overflow-y-auto">
            {/* Close button */}
            <div className="flex justify-end mb-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setShowCoursePicker(false)}
              >
                <i className="fas fa-times text-sm"></i>
              </Button>
            </div>
            <CoursePicker 
              selectedCourseId={props.courseId || null} 
              onCourseSelect={(course) => {
                props.onCourseSelect(course);
                setShowCoursePicker(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Advanced Parameters Sheet */}
      <OptimizerParamsSheet 
        open={showAdvanced}
        onOpenChange={setShowAdvanced}
      />

      {/* Hidden Optimizer Panel for mobile optimize button */}
      <div style={{ display: 'none' }}>
        <OptimizerPanel 
          ref={optimizerRef}
          viewer={cesiumViewerRef}
          start={props.start}
          pin={props.pin}
          aim={props.aim}
          skill={props.skill}
          rollCondition={props.rollCondition}
          maxCarry={300} // Default max carry
          maskBuffer={props.maskBuffer}
          sampleCount={props.sampleCount}
          onAimSet={props.onPointSet ? (aim) => props.onPointSet('aim', aim) : undefined}
          onOptimizationComplete={(candidates) => {
            console.log('🎯 Mobile optimization complete:', candidates.length, 'candidates');
          }}
        />
      </div>
    </div>
  );
}