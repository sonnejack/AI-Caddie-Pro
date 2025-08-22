import { create } from 'zustand';

export type CameraPreset = 'pov' | 'overview' | 'tee' | 'fairway' | 'green';
export type ConditionType = 'green' | 'fairway' | 'tee' | 'bunker' | 'water' | 'hazard' | 'OB' | 'recovery' | 'rough';

interface MobileUIState {
  // Drawer state
  topDrawerOpen: boolean;
  
  // Floating cards state
  shotSetupCardOpen: boolean;
  drawingToolsCardOpen: boolean;
  dispersionAnalysisCardOpen: boolean;
  cardsSwitcherOpen: boolean;
  
  // App state
  activeTab: string;
  currentHole: number;
  isDarkMode: boolean;
  
  // Toggles state
  tiles3DEnabled: boolean;
  vectorFeaturesEnabled: boolean;
  slopeArrowsEnabled: boolean;
  maskFillEnabled: boolean;
  maskEdgesEnabled: boolean;
  samplePointsEnabled: boolean;
  
  // Drawing state
  isDrawing: boolean;
  currentDrawingType: ConditionType | null;
  
  // Actions
  setTopDrawerOpen: (open: boolean) => void;
  setShotSetupCardOpen: (open: boolean) => void;
  setDrawingToolsCardOpen: (open: boolean) => void;
  setDispersionAnalysisCardOpen: (open: boolean) => void;
  setCardsSwitcherOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
  setCurrentHole: (hole: number) => void;
  setIsDarkMode: (dark: boolean) => void;
  
  // Toggle actions
  toggle3DTiles: () => void;
  toggleVectorFeatures: () => void;
  toggleSlopeArrows: () => void;
  toggleMaskFill: () => void;
  toggleMaskEdges: () => void;
  toggleSamplePoints: () => void;
  
  // Drawing actions
  setIsDrawing: (drawing: boolean) => void;
  setCurrentDrawingType: (type: ConditionType | null) => void;
  
  // Close all floating cards
  closeAllCards: () => void;
}

export const useMobileUI = create<MobileUIState>((set) => ({
  // Initial state
  topDrawerOpen: false,
  shotSetupCardOpen: false,
  drawingToolsCardOpen: false,
  dispersionAnalysisCardOpen: false,
  cardsSwitcherOpen: false,
  activeTab: 'prepare',
  currentHole: 1,
  isDarkMode: false,
  tiles3DEnabled: false,
  vectorFeaturesEnabled: true,
  slopeArrowsEnabled: false,
  maskFillEnabled: false,
  maskEdgesEnabled: false,
  samplePointsEnabled: true,
  isDrawing: false,
  currentDrawingType: null,
  
  // Drawer actions
  setTopDrawerOpen: (open) => set({ topDrawerOpen: open }),
  setShotSetupCardOpen: (open) => set({ shotSetupCardOpen: open }),
  setDrawingToolsCardOpen: (open) => set({ drawingToolsCardOpen: open }),
  setDispersionAnalysisCardOpen: (open) => set({ dispersionAnalysisCardOpen: open }),
  setCardsSwitcherOpen: (open) => set({ cardsSwitcherOpen: open }),
  
  // App actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  setCurrentHole: (hole) => set({ currentHole: hole }),
  setIsDarkMode: (dark) => set({ isDarkMode: dark }),
  
  // Toggle actions
  toggle3DTiles: () => set((state) => ({ tiles3DEnabled: !state.tiles3DEnabled })),
  toggleVectorFeatures: () => set((state) => ({ vectorFeaturesEnabled: !state.vectorFeaturesEnabled })),
  toggleSlopeArrows: () => set((state) => ({ slopeArrowsEnabled: !state.slopeArrowsEnabled })),
  toggleMaskFill: () => set((state) => ({ maskFillEnabled: !state.maskFillEnabled })),
  toggleMaskEdges: () => set((state) => ({ maskEdgesEnabled: !state.maskEdgesEnabled })),
  toggleSamplePoints: () => set((state) => ({ samplePointsEnabled: !state.samplePointsEnabled })),
  
  // Drawing actions
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),
  setCurrentDrawingType: (type) => set({ currentDrawingType: type }),
  
  // Utility
  closeAllCards: () => set({
    shotSetupCardOpen: false,
    drawingToolsCardOpen: false,
    dispersionAnalysisCardOpen: false,
    cardsSwitcherOpen: false,
  }),
}));

// Callbacks interface for parent components
export interface MobileUICallbacks {
  onToggle3DTiles?: () => void;
  onToggleFeatures?: () => void;
  onToggleSlopeArrows?: () => void;
  onToggleMaskFill?: () => void;
  onToggleMaskEdges?: () => void;
  onToggleSamples?: () => void;
  onPrevHole?: () => void;
  onNextHole?: () => void;
  onCameraPreset?: (preset: CameraPreset) => void;
  onOptimize?: () => void;
  onSelectStart?: () => void;
  onSelectAim?: () => void;
  onSelectPin?: () => void;
  onStartDrawing?: (type: ConditionType) => void;
  onFinishDrawing?: () => void;
  onCancelDrawing?: () => void;
  onRemoveLast?: () => void;
  onClearAll?: () => void;
}