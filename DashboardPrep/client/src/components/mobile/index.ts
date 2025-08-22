// Mobile UI Components for Golf Analytics Pro
// iPhone portrait overlay UI implementation

export { HeaderMobile } from './HeaderMobile';
export { TopDrawer } from './TopDrawer';
export { TopTogglesRow } from './TopTogglesRow';
export { HoleChip } from './HoleChip';
export { ShotMetricsStrip } from './ShotMetricsStrip';
export { FooterMobile } from './FooterMobile';
export { CardsSwitcherChip } from './CardsSwitcherChip';
export { ShotSetupCard } from './ShotSetupCard';
export { DrawingToolsCard } from './DrawingToolsCard';
export { DispersionAnalysisCard } from './DispersionAnalysisCard';
export { MobilePrepareLayout, MobilePrepareDemo } from './MobilePrepareLayout';

// Re-export mobile UI hooks and types
export { useMobileUI } from '@/hooks/useMobileUI';
export type { 
  CameraPreset, 
  ConditionType, 
  MobileUICallbacks 
} from '@/hooks/useMobileUI';