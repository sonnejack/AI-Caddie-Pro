import React from 'react';
import { type MobileUICallbacks } from '@/hooks/useMobileUI';
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

interface MobilePrepareLayoutProps extends MobileUICallbacks {
  className?: string;
  backgroundImage?: string;
  // Shot setup props
  startCoords?: string;
  aimCoords?: string;
  pinCoords?: string;
  startElevation?: string;
  aimElevation?: string;
  pinElevation?: string;
  skillLevel?: string;
  rollCondition?: string;
  // Metrics props
  totalDistance?: string;
  totalPlaysLike?: string;
  shotDistance?: string;
  shotPlaysLike?: string;
  expectedStrokes?: string;
  avgProximity?: string;
  // Analysis props
  confidenceInterval?: string;
  landingConditions?: Array<{
    condition: string;
    percentage: number;
    color: string;
  }>;
  // Hole props
  par?: number;
}

export const MobilePrepareLayout: React.FC<MobilePrepareLayoutProps> = ({
  className = '',
  backgroundImage = 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&auto=format&fit=crop&q=60',
  // Callbacks
  onToggle3DTiles,
  onToggleFeatures,
  onToggleSlopeArrows,
  onToggleMaskFill,
  onToggleMaskEdges,
  onToggleSamples,
  onPrevHole,
  onNextHole,
  onCameraPreset,
  onOptimize,
  onSelectStart,
  onSelectAim,
  onSelectPin,
  onStartDrawing,
  onFinishDrawing,
  onCancelDrawing,
  onRemoveLast,
  onClearAll,
  // Data props
  startCoords = '56.3480°N, 2.8200°W',
  aimCoords = '56.3487°N, 2.8192°W',
  pinCoords = '56.3495°N, 2.8185°W',
  startElevation = '42.3m',
  aimElevation = '38.7m',
  pinElevation = '35.2m',
  skillLevel,
  rollCondition,
  totalDistance = '287y',
  totalPlaysLike = '+15y',
  shotDistance = '275y',
  shotPlaysLike = '+12y',
  expectedStrokes = '2.854',
  avgProximity = '42ft',
  confidenceInterval = '±0.023',
  landingConditions,
  par = 4,
}) => {
  return (
    <div className={`relative min-h-screen overflow-hidden ${className}`}>
      {/* Full-bleed background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${backgroundImage})`,
        }}
      >
        {/* Gradient overlay for better contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30"></div>
      </div>

      {/* Fixed Elements */}
      
      {/* Header */}
      <HeaderMobile />
      
      {/* Top Drawer */}
      <TopDrawer />
      
      {/* Toggles Row */}
      <TopTogglesRow
        onToggle3DTiles={onToggle3DTiles}
        onToggleFeatures={onToggleFeatures}
        onToggleSlopeArrows={onToggleSlopeArrows}
        onToggleMaskFill={onToggleMaskFill}
        onToggleMaskEdges={onToggleMaskEdges}
        onToggleSamples={onToggleSamples}
      />
      
      {/* Hole Chip */}
      <HoleChip
        par={par}
        onPrevHole={onPrevHole}
        onNextHole={onNextHole}
      />
      
      {/* Shot Metrics Strip */}
      <ShotMetricsStrip
        totalDistance={totalDistance}
        totalPlaysLike={totalPlaysLike}
        shotDistance={shotDistance}
        shotPlaysLike={shotPlaysLike}
        expectedStrokes={expectedStrokes}
        avgProximity={avgProximity}
      />
      
      {/* Footer */}
      <FooterMobile
        onCameraPreset={onCameraPreset}
        onOptimize={onOptimize}
      />

      {/* Floating Elements */}
      
      {/* Cards Switcher */}
      <CardsSwitcherChip />
      
      {/* Floating Cards */}
      <ShotSetupCard
        startCoords={startCoords}
        aimCoords={aimCoords}
        pinCoords={pinCoords}
        startElevation={startElevation}
        aimElevation={aimElevation}
        pinElevation={pinElevation}
        skillLevel={skillLevel}
        rollCondition={rollCondition}
        onSelectStart={onSelectStart}
        onSelectAim={onSelectAim}
        onSelectPin={onSelectPin}
      />
      
      <DrawingToolsCard
        onStartDrawing={onStartDrawing}
        onFinishDrawing={onFinishDrawing}
        onCancelDrawing={onCancelDrawing}
        onRemoveLast={onRemoveLast}
        onClearAll={onClearAll}
      />
      
      <DispersionAnalysisCard
        expectedStrokes={expectedStrokes}
        confidenceInterval={confidenceInterval}
        landingConditions={landingConditions}
      />
    </div>
  );
};

// Demo page component
export const MobilePrepareDemo: React.FC = () => {
  const handleCallback = (action: string) => (param?: any) => {
    console.log(`Mobile UI: ${action}`, param);
  };

  const demoLandingConditions = [
    { condition: 'Fairway', percentage: 68, color: '#28B43C' },
    { condition: 'Rough', percentage: 22, color: '#556B2F' },
    { condition: 'Bunker', percentage: 8, color: '#D2B48C' },
    { condition: 'Water', percentage: 2, color: '#0078FF' },
  ];

  return (
    <div className="w-full h-screen">
      <MobilePrepareLayout
        // Callbacks
        onToggle3DTiles={handleCallback('toggle3DTiles')}
        onToggleFeatures={handleCallback('toggleFeatures')}
        onToggleSlopeArrows={handleCallback('toggleSlopeArrows')}
        onToggleMaskFill={handleCallback('toggleMaskFill')}
        onToggleMaskEdges={handleCallback('toggleMaskEdges')}
        onToggleSamples={handleCallback('toggleSamples')}
        onPrevHole={handleCallback('prevHole')}
        onNextHole={handleCallback('nextHole')}
        onCameraPreset={handleCallback('cameraPreset')}
        onOptimize={handleCallback('optimize')}
        onSelectStart={handleCallback('selectStart')}
        onSelectAim={handleCallback('selectAim')}
        onSelectPin={handleCallback('selectPin')}
        onStartDrawing={handleCallback('startDrawing')}
        onFinishDrawing={handleCallback('finishDrawing')}
        onCancelDrawing={handleCallback('cancelDrawing')}
        onRemoveLast={handleCallback('removeLast')}
        onClearAll={handleCallback('clearAll')}
        // Demo data
        startCoords="56.3480°N, 2.8200°W"
        aimCoords="56.3487°N, 2.8192°W"
        pinCoords="56.3495°N, 2.8185°W"
        startElevation="42.3m"
        aimElevation="38.7m"
        pinElevation="35.2m"
        totalDistance="287y"
        totalPlaysLike="+15y"
        shotDistance="275y"
        shotPlaysLike="+12y"
        expectedStrokes="2.854"
        avgProximity="42ft"
        confidenceInterval="±0.023"
        landingConditions={demoLandingConditions}
        par={4}
      />
    </div>
  );
};