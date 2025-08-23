import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { PrepareState, LatLon, getRollMultipliers } from '../../lib/types';
import { useGPSController } from '@/hooks/useGPSController';
import { useToast } from '@/hooks/use-toast';
import { colorizeMaskToCanvas, edgesMaskToCanvas, showRasterLayer, hideRasterLayer } from '@/lib/rasterOverlay';
import { initPointElevation, samplePointElevation, clearElevations } from '@/lib/pointElevation';
import type { MaskBuffer } from '@/lib/maskBuffer';
import { ConditionDrawingManager, type UserPolygon, type Condition } from '@/cesium/ConditionDrawingManager';
import { DrawingManagerContext, type DrawingManagerState } from '@/prepare/drawing/DrawingManagerContext';
import {
  initSamplesLayer,
  showSamples as setSamplesVisibility,
  setSamples,
  clearSamplesLayer,
  destroySamplesLayer,
} from './SamplesLayer';
import { showHolePolyline, hideHolePolyline } from './HolePolylineLayer';
import { showVectorFeatures, clearVectorFeatures } from './VectorFeatureLayers';
import { generateEllipseSamples, generateMixedEllipseSamples } from '@/lib/sampling';
import { 
  offsetLL, 
  midpointAlong, 
  holeLengthMeters, 
  greenCentroid, 
  greenRadiusMeters,
  centroidOfPolygon,
  findGreenContainingPoint,
  assignEndpoints
} from '@/lib/holeGeom';
import { flyShotPOVView } from './cameraViews';
import { bearingDeg } from '@/lib/holeGeom';

interface ESResult {
  mean: number;
  ci95: number; 
  n: number;
  pointsLL: Float64Array;
  distsYds: Float32Array;
  classes: Uint8Array;
}

interface CesiumCanvasProps {
  state: PrepareState;
  onPointSet: (type: 'start' | 'aim' | 'pin', point: LatLon) => void;
  maskBuffer?: MaskBuffer;
  esResult?: ESResult;
  onCameraFlyTo?: (camera: { position: LatLon, heading: number, pitch: number, height: number }) => void;
  onSampleData?: (data: { 
    points: LatLon[], 
    classes: number[], 
    pointsLL: Float64Array 
  }) => void;
  holePolyline?: { positions: { lon: number; lat: number }[] };
  holeEndpoints?: { teeLL: LatLon; greenLL: LatLon; primaryGreen: any };
  vectorFeatures?: any; // ImportResponse['holes'][0]['features']
  nSamples?: number;
  onESWorkerCall?: (params: any) => void;
  loadingCourse?: boolean;
  loadingProgress?: { stage: string; progress: number };
  onViewerReady?: (viewer: any & { flyTeeView?: Function; flyFairwayView?: Function; flyGreenView?: Function }) => void;
  // Camera navigation props
  holePolylinesByRef?: Map<string, any>;
  holeFeatures?: any;
  currentHole?: number;
  pinLocation?: LatLon | null;
  // Drawing props
  onUserPolygonsChange?: (polygons: UserPolygon[]) => void;
  onDrawingStateChange?: (state: DrawingManagerState) => void;
  // GPS state callback
  onGPSStateChange?: (isActive: boolean) => void;
}

// Helper function to calculate distance in yards
function calculateDistanceYards(p1: LatLon, p2: LatLon): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + 
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.09361; // Convert to yards
}

// Sample raster pixel directly (O(1) operation)
function sampleRasterPixel(lon: number, lat: number, maskBuffer: MaskBuffer): number {
  const { width, height, bbox, data } = maskBuffer;
  
  // Convert lat/lon to pixel coordinates
  const x = Math.floor(((lon - bbox.west) / (bbox.east - bbox.west)) * width);
  const y = Math.floor(((bbox.north - lat) / (bbox.north - bbox.south)) * height);
  
  // Clamp to bounds
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(height - 1, y));
  
  // Sample pixel (assuming RGBA format, class in R channel)
  const pixelIndex = (clampedY * width + clampedX) * 4;
  const classId = data[pixelIndex]; // Red channel contains class ID
  
  // Treat unknown (0) as rough (8) - any pixel without features is rough
  return classId === 0 ? 8 : classId;
}

// Update sample colors using classifications
function updateSampleColors(pointsLL: Float64Array, classifications: number[]) {
  const n = classifications.length;
  const classArray = new Uint8Array(classifications);
  
  console.log('🎨 updateSampleColors called with', n, 'points');
  console.log('🎨 First 10 classifications:', classifications.slice(0, 10));
  
  // Count OB points being passed to visual layer
  const obCount = classifications.filter(c => c === 1).length;
  console.log(`🎨 Passing ${obCount} OB points to visual layer`);
  
  setSamples(pointsLL, classArray);
}

function CesiumCanvas({ 
  state, 
  onPointSet, 
  maskBuffer, 
  esResult, 
  onCameraFlyTo,
  holePolyline,
  holeEndpoints,
  vectorFeatures,
  nSamples = 600,
  onESWorkerCall,
  loadingCourse = false,
  loadingProgress = { stage: '', progress: 0 },
  onViewerReady,
  holePolylinesByRef,
  holeFeatures,
  currentHole,
  pinLocation,
  onUserPolygonsChange,
  onDrawingStateChange,
  onSampleData,
  onGPSStateChange
}: CesiumCanvasProps) {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializingRef = useRef(false);
  const selectionModeRef = useRef(state.selectionMode);
  const onPointSetRef = useRef(onPointSet);
  const [viewerReady, setViewerReady] = useState(false);
  const [photorealEnabled, setPhotorealEnabled] = useState(false);
  const [rasterMode, setRasterMode] = useState<'off' | 'fill' | 'edges'>('off');
  const [showSamples, setShowSamples] = useState(true);
  const googleTilesetRef = useRef<any>(null);
  const samplePointsRef = useRef<any>(null);
  const workerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastParamsRef = useRef<string>('');
  
  // Drawing manager state
  const [drawingManager, setDrawingManager] = useState<ConditionDrawingManager | null>(null);
  const [baseMask, setBaseMask] = useState<MaskBuffer | null>(null);
  const [activeMask, setActiveMask] = useState<MaskBuffer | null>(null);
  const [drawingState, setDrawingState] = useState<DrawingManagerState>({
    isDrawing: false,
    vertices: 0,
    condition: undefined
  });

  // Toast notifications
  const { toast } = useToast();

  // GPS controller for start point tracking
  const {
    isGPSActive,
    isGPSSupported,
    toggleGPS
  } = useGPSController({
    onLocationUpdate: useCallback((location: LatLon) => {
      console.log('🌍 GPS location received for Start point:', location);
      
      if (state.selectionMode === 'start') {
        // Don't update during manual selection mode - GPS and manual are mutually exclusive
        return;
      }
      
      // Update Start point via the existing onPointSet flow
      onPointSet('start', location);
    }, [onPointSet, state.selectionMode]),
    onError: useCallback((error: string) => {
      console.error('GPS error:', error);
      toast({
        title: "GPS Error",
        description: error,
        variant: "destructive",
      });
    }, [toast]),
    onGPSEnabled: useCallback(() => {
      toast({
        title: "GPS Enabled",
        description: "Now tracking your location for start position",
        variant: "default",
      });
      onGPSStateChange?.(true);
    }, [toast, onGPSStateChange]),
    onGPSDisabled: useCallback(() => {
      toast({
        title: "GPS Disabled", 
        description: "Manual start point placement is now enabled",
        variant: "default",
      });
      onGPSStateChange?.(false);
    }, [toast, onGPSStateChange]),
    distanceThresholdMeters: 3.0,
    throttleIntervalMs: 1000
  });


  // Update refs when props change
  selectionModeRef.current = state.selectionMode;
  onPointSetRef.current = onPointSet;

  // Camera helper functions
  type LL = { lon: number; lat: number };
  
  function groundHeightFast(lon: number, lat: number): number {
    if (!viewerRef.current) return 0;
    const h = viewerRef.current.scene.globe.getHeight(
      (window as any).Cesium.Cartographic.fromDegrees(lon, lat)
    );
    return Number.isFinite(h) ? (h as number) : 0;
  }

  function flyToLLH(
    target: LL & { hMeters: number },
    headingDeg: number,
    pitchDeg: number,
    duration = 0.35
  ) {
    if (!viewerRef.current) return;
    const Cesium = (window as any).Cesium;
    const dest = Cesium.Cartesian3.fromDegrees(
      target.lon, 
      target.lat, 
      target.hMeters + 0.05
    );
    viewerRef.current.camera.flyTo({
      destination: dest,
      orientation: {
        heading: Cesium.Math.toRadians(headingDeg),
        pitch: Cesium.Math.toRadians(pitchDeg),
        roll: 0
      },
      duration
    });
  }
  
  // Calculate overview height to ensure tee and green are both visible with buffer
  function calculateOverviewHeight(holePolylineLL: LL[], teeLL: LL, greenLL: LL): { centerLL: LL; height: number } {
    if (!viewerRef.current) return { centerLL: teeLL, height: 300 };
    
    const scene = viewerRef.current.scene;
    const canvas = scene.canvas;
    const aspect = canvas.width / canvas.height;
    const camera = viewerRef.current.camera;
    const fovy = camera.frustum.fovy;
    
    // Calculate bounding box of the hole
    let minLat = Math.min(teeLL.lat, greenLL.lat);
    let maxLat = Math.max(teeLL.lat, greenLL.lat);
    let minLon = Math.min(teeLL.lon, greenLL.lon);
    let maxLon = Math.max(teeLL.lon, greenLL.lon);
    
    // Expand to include all polyline points
    for (const point of holePolylineLL) {
      minLat = Math.min(minLat, point.lat);
      maxLat = Math.max(maxLat, point.lat);
      minLon = Math.min(minLon, point.lon);
      maxLon = Math.max(maxLon, point.lon);
    }
    
    // Add buffer (10% of span)
    const latSpan = maxLat - minLat;
    const lonSpan = maxLon - minLon;
    const buffer = 0.1;
    
    minLat -= latSpan * buffer;
    maxLat += latSpan * buffer;
    minLon -= lonSpan * buffer;
    maxLon += lonSpan * buffer;
    
    // Calculate center
    const centerLL = {
      lat: (minLat + maxLat) / 2,
      lon: (minLon + maxLon) / 2
    };
    
    // Convert to meters for height calculation
    const R = 6371000;
    const latSpanM = (maxLat - minLat) * Math.PI / 180 * R;
    const lonSpanM = (maxLon - minLon) * Math.PI / 180 * R * Math.cos(centerLL.lat * Math.PI / 180);
    
    // Calculate height needed to fit both dimensions
    const heightForLat = latSpanM / (2 * Math.tan(fovy / 2));
    const fovx = 2 * Math.atan(Math.tan(fovy / 2) * aspect);
    const heightForLon = lonSpanM / (2 * Math.tan(fovx / 2));
    
    const height = Math.max(heightForLat, heightForLon, 200); // Minimum 200m
    
    return { centerLL, height };
  }

  // Fixed camera view functions
  const flyOverview = useCallback((holePolylineLL: LL[], teeLL: LL, greenLL: LL) => {
    if (!viewerRef.current || !holePolylineLL.length) return;
    
    const { centerLL, height } = calculateOverviewHeight(holePolylineLL, teeLL, greenLL);
    const terrainHeight = groundHeightFast(centerLL.lon, centerLL.lat);
    const hdg = bearingDeg(teeLL.lon, teeLL.lat, greenLL.lon, greenLL.lat);
    
    flyToLLH(
      { ...centerLL, hMeters: terrainHeight + height }, 
      hdg, 
      -89.5, // Nearly straight down 
      0.35
    );
  }, [viewerRef.current]);
  
  const flyTeeView = useCallback((hole: any) => {
    if (!viewerRef.current || !hole.polyline) return;
    
    // Use the assigned endpoints for consistent direction
    const tee = hole.teeLL || hole.polyline.positions[0];
    const green = hole.greenLL || hole.greenCentroid;
    if (!green) return;

    const hdg = bearingDeg(tee.lon, tee.lat, green.lon, green.lat);
    const L = holeLengthMeters(hole.polyline.positions);

    // Increased offset behind tee - was 0.06 * L, now 0.12 * L with higher minimum
    const back = Math.min(100, Math.max(30, 0.12 * L));
    const camLL = offsetLL(tee.lon, tee.lat, back, (hdg + 180) % 360);
    const h = Math.min(120, Math.max(40, 0.15 * L)) + groundHeightFast(camLL.lon, camLL.lat);

    flyToLLH({ ...camLL, hMeters: h }, hdg, -20, 0.35);
  }, [viewerRef.current]);

  const flyFairwayView = useCallback((hole: any) => {
    if (!viewerRef.current || !hole.polyline) return;
    
    const mid = midpointAlong(hole.polyline.positions);
    // Use the assigned green endpoint for consistent direction
    const green = hole.greenLL || hole.greenCentroid;
    if (!green) return;

    const hdg = bearingDeg(mid.lon, mid.lat, green.lon, green.lat);
    const L = holeLengthMeters(hole.polyline.positions);

    // Position camera further back from midpoint for better fairway perspective
    const back = Math.min(80, Math.max(25, 0.08 * L));
    const camLL = offsetLL(mid.lon, mid.lat, back, (hdg + 180) % 360);
    
    // Increased height for better fairway overview
    const h = Math.min(100, Math.max(35, 0.12 * L)) + groundHeightFast(camLL.lon, camLL.lat);
    flyToLLH({ ...camLL, hMeters: h }, hdg, -25, 0.35);
  }, [viewerRef.current]);

  const flyGreenView = useCallback((hole: any, pinGreen?: any) => {
    if (!viewerRef.current || !hole.polyline) return;
    
    // Use the specific green containing the pin if provided, otherwise use primary green
    const targetGreen = pinGreen || hole.primaryGreen;
    if (!targetGreen) return;
    
    const tee = hole.polyline.positions[0];
    const green = centroidOfPolygon(targetGreen);

    const hdg = bearingDeg(tee.lon, tee.lat, green.lon, green.lat); // tee->green so front (green->tee) is bottom
    const r = greenRadiusMeters(targetGreen);
    // Increased height for better green view
    const h = Math.min(120, Math.max(50, 4 * r)) + groundHeightFast(green.lon, green.lat);

    flyToLLH({ lon: green.lon, lat: green.lat, hMeters: h }, hdg, -89.5, 0.35);
  }, [viewerRef.current]);

  // Shot POV camera view
  const flyShotPOV = useCallback(async (startLL: LatLon, aimLL: LatLon) => {
    if (!viewerRef.current) return;
    await flyShotPOVView(viewerRef.current, startLL, aimLL);
  }, [viewerRef.current]);

  // Handle camera preset buttons
  const handleCameraPreset = (preset: string) => {
    if (!viewerRef.current || !holePolylinesByRef || !holeFeatures || !currentHole) {
      console.warn('Missing data for camera preset:', { 
        viewer: !!viewerRef.current, 
        polylines: !!holePolylinesByRef, 
        features: !!holeFeatures,
        currentHole 
      });
      return;
    }

    const holeRef = currentHole.toString();
    if (!holePolylinesByRef.has(holeRef)) {
      console.warn('No polyline data for hole:', holeRef);
      return;
    }

    try {
      const polylineData = holePolylinesByRef.get(holeRef);
      const holePolylineLL: LL[] = polylineData.positions;

      // Assign endpoints to get consistent tee and green locations
      const holePolyline = {
        holeId: holeRef,
        positions: polylineData.positions,
        ref: holeRef
      };
      const endpoints = assignEndpoints(holePolyline, holeFeatures.tees, holeFeatures.greens);
      
      const teeLL = endpoints.teeLL;
      const greenLL = endpoints.greenLL;
      
      if (!teeLL || !greenLL) {
        console.warn('Missing tee or green endpoints for camera preset');
        return;
      }

      const hole = {
        polyline: holePolyline,
        teeLL: endpoints.teeLL,
        greenLL: endpoints.greenLL,
        greenCentroid: endpoints.greenLL, // Use the actual green endpoint, not centroid of largest green
        primaryGreen: endpoints.primaryGreen
      };

      switch (preset) {
        case 'overview':
          flyOverview(holePolylineLL, endpoints.teeLL, endpoints.greenLL);
          break;
        case 'tee':
          flyTeeView(hole);
          break;
        case 'fairway':
          flyFairwayView(hole);
          break;
        case 'green':
          // Find the specific green that contains the pin location
          let pinGreen = null;
          if (pinLocation && holeFeatures?.greens) {
            pinGreen = findGreenContainingPoint(pinLocation, holeFeatures.greens);
          }
          flyGreenView(hole, pinGreen);
          break;
        case 'shotpov':
          // Shot POV requires start and aim points
          if (state.start && state.aim) {
            flyShotPOV(state.start, state.aim);
          } else {
            console.warn('Shot POV requires both start and aim points to be set');
          }
          break;
        default:
          console.warn('Unknown camera preset:', preset);
      }
    } catch (error) {
      console.error('Camera preset error:', error);
    }
  };

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current || initializingRef.current) return;
    
    initializingRef.current = true;

    const initializeCesium = async () => {
      try {
        console.log('🌍 Starting Cesium initialization...');
        
        // Set Cesium Ion token from environment variable
        const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
        console.log('🔑 Setting Cesium Ion token:', token ? 'Token provided' : 'No token');
        (window as any).Cesium.Ion.defaultAccessToken = token;
        
        // Create terrain provider using Ion asset
        console.log('🏔️ Loading terrain provider...');
        let terrainProvider;
        try {
          terrainProvider = await (window as any).Cesium.CesiumTerrainProvider.fromIonAssetId(1);
          console.log('✅ Terrain provider loaded successfully');
        } catch (terrainError) {
          console.warn('Failed to load Ion terrain, using default terrain:', terrainError);
          terrainProvider = undefined;
        }

        // Initialize Cesium viewer with minimal UI
        console.log('🎮 Creating Cesium viewer...');
        const viewer = new (window as any).Cesium.Viewer(containerRef.current, {
          terrainProvider,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        animation: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      });

      // Set up camera for St. Andrews Old Course
      viewer.camera.setView({
        destination: (window as any).Cesium.Cartesian3.fromDegrees(-2.82, 56.348, 300),
        orientation: {
          heading: 0,
          pitch: -0.5,
          roll: 0
        }
      });

        console.log('✅ Cesium viewer created successfully');
        viewerRef.current = viewer;
        
        // Initialize SamplesLayer
        console.log('🎨 Initializing samples layer...');
        initSamplesLayer(viewer);
        
        // Initialize point elevation system
        console.log('📏 Initializing point elevation system...');
        initPointElevation(viewer);
        
        // Initialize drawing manager
        console.log('✏️ Initializing drawing manager...');
        const manager = new ConditionDrawingManager(viewer, {
          onUpdate: (polygons) => {
            if (onUserPolygonsChange) {
              onUserPolygonsChange(polygons);
            }
          },
          onState: (state) => {
            console.log('🎨 Drawing state changed:', state);
            setDrawingState(state);
            // Notify parent component
            if (onDrawingStateChange) {
              onDrawingStateChange(state);
            }
          }
        });
        setDrawingManager(manager);
        
        // Notify parent component that viewer is ready
        if (onViewerReady) {
          // Attach camera functions to the viewer object for external access
          const viewerWithCameraFunctions = viewer;
          viewerWithCameraFunctions.flyTeeView = flyTeeView;
          viewerWithCameraFunctions.flyFairwayView = flyFairwayView;
          viewerWithCameraFunctions.flyGreenView = flyGreenView;
          viewerWithCameraFunctions.drawingManager = manager; // Expose drawing manager
          onViewerReady(viewerWithCameraFunctions);
        }
        
        console.log('🎉 Cesium initialization complete!');
        setViewerReady(true);
        initializingRef.current = false;

      } catch (error) {
        console.error('Failed to initialize Cesium viewer:', error);
        initializingRef.current = false;
      }
    };

    initializeCesium();

    return () => {
      // Cleanup timeout and worker
      if (workerTimeoutRef.current) {
        clearTimeout(workerTimeoutRef.current);
      }
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      
      // Cleanup samples layer
      destroySamplesLayer();
      
      // Cleanup Google tileset
      if (googleTilesetRef.current && viewerRef.current) {
        viewerRef.current.scene.primitives.remove(googleTilesetRef.current);
        googleTilesetRef.current = null;
      }
      
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      initializingRef.current = false;
    };
  }, []);

  // Handle mask updates - use mask buffer directly since it already includes user polygons
  useEffect(() => {
    if (maskBuffer) {
      // Store the base mask
      setBaseMask(maskBuffer);
      
      // Use mask buffer directly as active mask since dashboard re-rasterization 
      // already includes user polygons baked in
      setActiveMask(maskBuffer);
    }
  }, [maskBuffer]);

  // Cleanup drawing manager when component unmounts
  useEffect(() => {
    return () => {
      if (drawingManager) {
        drawingManager.destroy();
      }
    };
  }, [drawingManager]);

  // Auto-generate samples with debounced effect
  useEffect(() => {
    if (!viewerReady) return;
    
    // Clear previous timeout and cancel any running worker
    if (workerTimeoutRef.current) {
      clearTimeout(workerTimeoutRef.current);
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    
    // Check if we have the required points for dispersion oval
    if (!state.start || !state.aim || !state.pin || !state.skillPreset) {
      clearSamplesLayer();
      lastParamsRef.current = '';
      return;
    }
    
    // Create parameter signature to detect changes
    const currentParams = JSON.stringify({
      start: state.start,
      aim: state.aim,
      pin: state.pin,
      skill: state.skillPreset,
      rollCondition: state.rollCondition,
      samples: nSamples,
      show: showSamples,
      maskVersion: activeMask ? `${activeMask.width}x${activeMask.height}_${activeMask.data.length}` : 'none'
    });
    
    // Skip if parameters haven't changed
    if (currentParams === lastParamsRef.current) {
      return;
    }
    lastParamsRef.current = currentParams;
    
    // Calculate ellipse parameters
    const distance = calculateDistanceYards(state.start, state.aim);
    
    // Validate distance is reasonable (increased limit for GPS testing)
    if (distance <= 0 || distance > 5000) {
      console.warn('Invalid distance for ellipse calculation:', distance, 'yards');
      clearSamplesLayer();
      return;
    }
    
    console.log('🎯 Generating samples for distance:', distance.toFixed(1), 'yards');
    
    // Match ellipse axis assignment: width (lateral) is major, depth (distance) is minor
    const semiMajor = distance * Math.tan(state.skillPreset.offlineDeg * Math.PI / 180); // lateral error (width)
    const semiMinor = (state.skillPreset.distPct / 100) * distance; // distance error (depth)
    
    // Validate ellipse parameters
    if (semiMajor <= 0 || semiMinor <= 0 || !isFinite(semiMajor) || !isFinite(semiMinor)) {
      console.warn('Invalid ellipse parameters:', { semiMajor, semiMinor });
      clearSamplesLayer();
      return;
    }
    
    // Calculate heading/rotation exactly like the ellipse (lines 517-526)
    const bearing = calculateBearing(state.start, state.aim);
    const bearingDeg = bearing * 180 / Math.PI;
    const rotDeg = ((360 - bearingDeg) + 0) % 360; // userRot = 0 for now (same as ellipse)
    const headingRad = rotDeg * Math.PI / 180;
    
    // Validate heading
    if (!isFinite(headingRad)) {
      console.warn('Invalid heading calculation');
      clearSamplesLayer();
      return;
    }
    
    try {
      let previewPoints: Float64Array;
      
      // Generate preview points - use mixed sampling if roll condition is not 'none'
      if (state.rollCondition && state.rollCondition !== 'none') {
        // Calculate roll ellipse parameters
        const rollMultipliers = getRollMultipliers(state.rollCondition);
        const rollSemiMajor = semiMajor * rollMultipliers.widthMultiplier;
        const rollSemiMinor = semiMinor * rollMultipliers.depthMultiplier;
        
        // Calculate roll ellipse center position (same logic as visual ellipse)
        const carryDistanceFromCenter = semiMinor;
        const rollDistanceFromCenter = rollSemiMinor;
        const rollCenterOffset = rollDistanceFromCenter - carryDistanceFromCenter;
        
        // Convert bearing to direction vector for offset calculation
        const bearing = calculateBearing(state.start, state.aim);
        const offsetX = rollCenterOffset * Math.sin(bearing);
        const offsetY = rollCenterOffset * Math.cos(bearing);
        
        // Convert offset from meters to degrees
        const R = 6371000;
        const deltaLat = offsetY / R * 180 / Math.PI;
        const deltaLon = offsetX / (R * Math.cos(state.aim.lat * Math.PI / 180)) * 180 / Math.PI;
        
        const rollCenterLL = {
          lon: state.aim.lon + deltaLon,
          lat: state.aim.lat + deltaLat
        };
        
        // Generate mixed samples
        const result = generateMixedEllipseSamples(
          nSamples,
          {
            semiMajor,
            semiMinor,
            headingRad,
            centerLL: state.aim
          },
          {
            semiMajor: rollSemiMajor,
            semiMinor: rollSemiMinor,
            headingRad,
            centerLL: rollCenterLL
          },
          1 // seed
        );
        
        previewPoints = result.samples;
      } else {
        // Generate standard ellipse samples (carry only)
        previewPoints = generateEllipseSamples(
          nSamples,
          semiMajor,
          semiMinor,
          headingRad,
          state.aim,
          1 // seed
        );
      }
      
      // Show preview points
      setSamples(previewPoints);
      setSamplesVisibility(showSamples);
      
      // Instant raster-based coloring (no worker needed)
      if (activeMask && showSamples) {
        console.log('🎯 [CesiumCanvas] Sampling using bbox:', activeMask.bbox);
        console.log('🎯 [CesiumCanvas] Sampling mask dimensions:', activeMask.width, 'x', activeMask.height);
        console.log('🎯 [CesiumCanvas] ActiveMask data length:', activeMask.data.length);
        
        // Sample a histogram of the activeMask data to verify it contains user polygon changes
        const maskClassCounts = new Map<number, number>();
        for (let i = 0; i < activeMask.data.length; i += 4) {
          const classId = activeMask.data[i];
          maskClassCounts.set(classId, (maskClassCounts.get(classId) || 0) + 1);
        }
        console.log('🎯 [CesiumCanvas] ActiveMask class distribution:', Array.from(maskClassCounts.entries()).map(([k,v]) => `Class ${k}: ${v}`));
        
        // Classify points using direct raster sampling from active mask
        const pointClassifications = new Array(nSamples);
        let obCount = 0;
        for (let i = 0; i < nSamples; i++) {
          const lon = previewPoints[i * 2];
          const lat = previewPoints[i * 2 + 1];
          
          // Sample raster pixel directly (O(1) operation)
          const classId = sampleRasterPixel(lon, lat, activeMask);
          pointClassifications[i] = classId;
          
          if (classId === 1) { // OB class
            obCount++;
            if (obCount <= 3) { // Log first few OB points for debugging
              console.log(`🎯 OB point ${obCount}: lon=${lon}, lat=${lat}, classId=${classId}`);
            }
          }
        }
        
        console.log(`🎯 Found ${obCount} OB points out of ${nSamples} total`);
        
        // Count each class for verification
        const classCounts = new Map<number, number>();
        pointClassifications.forEach(classId => {
          classCounts.set(classId, (classCounts.get(classId) || 0) + 1);
        });
        console.log('🎯 [CesiumCanvas] Visual dots class distribution from', nSamples, 'points:', Array.from(classCounts.entries()).map(([k,v]) => `Class ${k}: ${v} (${(100*v/nSamples).toFixed(1)}%)`));
        
        // Show coordinate ranges to verify we're sampling the same area as DispersionInspector
        const lons = [];
        const lats = [];
        for (let i = 0; i < nSamples; i++) {
          lons.push(previewPoints[i * 2]);
          lats.push(previewPoints[i * 2 + 1]);
        }
        console.log('🎯 [CesiumCanvas] Coordinate ranges: lon', Math.min(...lons).toFixed(6), 'to', Math.max(...lons).toFixed(6), ', lat', Math.min(...lats).toFixed(6), 'to', Math.max(...lats).toFixed(6));
        
        // Update colors immediately
        updateSampleColors(previewPoints, pointClassifications);
        
        // Send sample data to DispersionInspector via callback
        if (onSampleData) {
          const points: LatLon[] = [];
          for (let i = 0; i < nSamples; i++) {
            points.push({
              lon: previewPoints[i * 2],
              lat: previewPoints[i * 2 + 1]
            });
          }
          
          console.log('🎯 [CesiumCanvas] Sending sample data to DispersionInspector:', points.length, 'points');
          onSampleData({
            points,
            classes: pointClassifications,
            pointsLL: previewPoints
          });
        }
      }
    } catch (error) {
      console.error('Error generating preview samples:', error);
      clearSamplesLayer();
      return;
    }
    
  }, [state.start, state.aim, state.pin, state.skillPreset, state.rollCondition, nSamples, showSamples, viewerReady, activeMask, onESWorkerCall]);

  // Sample elevation when points change
  useEffect(() => {
    if (!viewerReady) return;

    // Sample start point elevation
    if (state.start) {
      samplePointElevation(state.start, 'start').catch(console.warn);
    }

    // Sample aim point elevation  
    if (state.aim) {
      samplePointElevation(state.aim, 'aim').catch(console.warn);
    }

    // Sample pin point elevation
    if (state.pin) {
      samplePointElevation(state.pin, 'pin').catch(console.warn);
    }
  }, [state.start, state.aim, state.pin, viewerReady]);

  // Clear elevations when switching courses or holes
  useEffect(() => {
    if (state.courseId) {
      clearElevations();
    }
  }, [state.courseId]);

  useEffect(() => {
    if (state.holeId) {
      clearElevations();
    }
  }, [state.holeId]);

  // Handle hole polyline display
  useEffect(() => {
    if (!viewerRef.current || !viewerReady) return;

    if (holePolyline && holePolyline.positions.length > 1) {
      showHolePolyline(
        viewerRef.current,
        `hole-${state.currentHole}`,
        holePolyline.positions,
        holeEndpoints
      );
    } else {
      hideHolePolyline();
    }

    return () => {
      hideHolePolyline();
    };
  }, [viewerRef.current, viewerReady, holePolyline, holeEndpoints, state.currentHole]);

  // Handle vector features display - show polylines only
  useEffect(() => {
    if (!viewerRef.current || !viewerReady || !vectorFeatures) return;
    
    console.log('[CesiumCanvas] Showing hole polylines');
    
    // Always show just polylines (hole centerlines) - no other features needed
    const polylinesOnly = { polylines: true };
    showVectorFeatures(viewerRef.current, vectorFeatures, polylinesOnly);
    
  }, [viewerRef.current, viewerReady, vectorFeatures, state.maskPngMeta?.bbox]);

  // Handle camera fly-to
  useEffect(() => {
    if (!viewerRef.current || !viewerReady || !onCameraFlyTo) return;

    // Set up camera fly-to handler
    const handleCameraFlyTo = (cameraConfig: { position: LatLon, heading: number, pitch: number, height: number }) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      try {
        // Sample terrain height at target position
        const cartographic = (window as any).Cesium.Cartographic.fromDegrees(
          cameraConfig.position.lon,
          cameraConfig.position.lat
        );

        // Use terrain height + specified height
        const promises = [(window as any).Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [cartographic])];
        
        Promise.all(promises).then(() => {
          const terrainHeight = cartographic.height || 0;
          const totalHeight = terrainHeight + cameraConfig.height;

          const destination = (window as any).Cesium.Cartesian3.fromDegrees(
            cameraConfig.position.lon,
            cameraConfig.position.lat,
            totalHeight
          );

          viewer.camera.flyTo({
            destination,
            orientation: {
              heading: cameraConfig.heading,
              pitch: cameraConfig.pitch,
              roll: 0
            },
            duration: 1.2
          });
        }).catch((error: any) => {
          console.warn('Failed to sample terrain, using default height:', error);
          
          // Fallback: use specified height directly
          const destination = (window as any).Cesium.Cartesian3.fromDegrees(
            cameraConfig.position.lon,
            cameraConfig.position.lat,
            cameraConfig.height
          );

          viewer.camera.flyTo({
            destination,
            orientation: {
              heading: cameraConfig.heading,
              pitch: cameraConfig.pitch,
              roll: 0
            },
            duration: 1.2
          });
        });
      } catch (error) {
        console.error('Camera fly-to error:', error);
      }
    };

    // Store handler reference for cleanup
    const cameraHandler = handleCameraFlyTo;
    
    // This effect will re-run when onCameraFlyTo changes, allowing parent to trigger fly-to
  }, [viewerRef.current, viewerReady, onCameraFlyTo]);

  // Handle samples visibility toggle
  const handleSamplesToggle = (visible: boolean) => {
    setShowSamples(visible);
    setSamplesVisibility(visible);
  };

  // Handle Google 3D Tiles toggle
  const handleGoogleTilesToggle = async () => {
    if (!viewerRef.current) return;
    
    const viewer = viewerRef.current;
    const newState = !photorealEnabled;
    
    if (newState) {
      // Enable Google Photorealistic 3D Tiles
      try {
        console.log('Enabling Google Photorealistic 3D Tiles...');
        
        // Create Google Photorealistic 3D Tiles tileset if it doesn't exist
        if (!googleTilesetRef.current) {
          googleTilesetRef.current = viewer.scene.primitives.add(
            await (window as any).Cesium.createGooglePhotorealistic3DTileset()
          );
        } else {
          googleTilesetRef.current.show = true;
        }
        
        console.log('Google 3D Tiles enabled');
      } catch (error) {
        console.error('Failed to load Google 3D Tiles:', error);
        return; // Don't update state if loading failed
      }
    } else {
      // Disable Google Photorealistic 3D Tiles
      if (googleTilesetRef.current) {
        googleTilesetRef.current.show = false;
        console.log('Google 3D Tiles disabled');
      }
    }
    
    setPhotorealEnabled(newState);
  };

  // Handle camera positioning for new course
  useEffect(() => {
    if (!viewerRef.current || !viewerReady || !state.maskPngMeta?.courseBbox) return;
    
    const viewer = viewerRef.current;
    const bbox = state.maskPngMeta.courseBbox;
    
    // Calculate center and camera position for the course
    const centerLon = (bbox.west + bbox.east) / 2;
    const centerLat = (bbox.south + bbox.north) / 2;
    
    // Calculate an appropriate zoom level based on bbox size
    const latSpan = bbox.north - bbox.south;
    const lonSpan = bbox.east - bbox.west;
    const maxSpan = Math.max(latSpan, lonSpan);
    
    // Height calculation: larger spans need higher camera altitude
    const height = Math.max(300, maxSpan * 111000 * 2); // Convert degrees to meters, then add buffer
    
    console.log('🎥 Flying camera to course:', {
      center: [centerLon, centerLat],
      height,
      bbox
    });
    
    viewer.camera.flyTo({
      destination: (window as any).Cesium.Cartesian3.fromDegrees(centerLon, centerLat, height),
      orientation: {
        heading: 0,
        pitch: -1.57, // -90 degrees = straight down
        roll: 0
      },
      duration: 0.5
    });
  }, [viewerReady, state.maskPngMeta?.courseBbox]);

  // Add point markers
  useEffect(() => {
    if (!viewerRef.current || !viewerReady) return;

    const viewer = viewerRef.current;
    viewer.entities.removeAll();

    // Add start point
    if (state.start) {
      viewer.entities.add({
        position: (window as any).Cesium.Cartesian3.fromDegrees(state.start.lon, state.start.lat, 0),
        billboard: {
          image: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" fill="#EF4444" stroke="white" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          `),
          scale: 0.8,
          verticalOrigin: (window as any).Cesium.VerticalOrigin.CENTER,
          heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
        }
      });
    }

    // Add aim point
    if (state.aim) {
      viewer.entities.add({
        position: (window as any).Cesium.Cartesian3.fromDegrees(state.aim.lon, state.aim.lat, 0),
        billboard: {
          image: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" fill="#3B82F6" stroke="white" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          `),
          scale: 0.8,
          verticalOrigin: (window as any).Cesium.VerticalOrigin.CENTER,
          heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
        }
      });
    }

    // Add pin point
    if (state.pin) {
      viewer.entities.add({
        position: (window as any).Cesium.Cartesian3.fromDegrees(state.pin.lon, state.pin.lat, 0),
        billboard: {
          image: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <polygon points="12,2 22,20 12,16 2,20" fill="#EAB308" stroke="white" stroke-width="2"/>
            </svg>
          `),
          scale: 0.8,
          verticalOrigin: (window as any).Cesium.VerticalOrigin.CENTER,
          heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
        }
      });
    }

    // Add dispersion ellipses if both start and aim are set
    if (state.start && state.aim) {
      // Calculate ellipse parameters based on shot direction
      const distance = calculateDistance(state.start, state.aim);
      const bearing = calculateBearing(state.start, state.aim);
      
      // Calculate depth (along shot line) and width (perpendicular to shot line)  
      const depthError = (state.skillPreset.distPct / 100) * distance * 0.9144; // yards to meters
      const widthError = distance * Math.tan(state.skillPreset.offlineDeg * Math.PI / 180) * 0.9144; // lateral dispersion
      
      // Use your rotation formula: ((360 - bearing) + userRot) % 360
      const bearingDeg = bearing * 180 / Math.PI;
      const rotDeg = ((360 - bearingDeg) + 0) % 360; // userRot = 0 for now
      const rotRad = rotDeg * Math.PI / 180;
      
      // Width is always the major axis (lateral spread), depth is minor axis (distance spread)
      const semiMajor = widthError;
      const semiMinor = depthError;
      
      // Create carry ellipse polyline points
      const carryLonLatArr = ellipseLonLatArray(state.aim.lon, state.aim.lat, semiMajor, semiMinor, rotRad);
      
      // Create carry ellipse with yellow color
      viewer.entities.add({
        polyline: {
          positions: (window as any).Cesium.Cartesian3.fromDegreesArray(carryLonLatArr),
          width: 3,
          material: (window as any).Cesium.Color.YELLOW,
          clampToGround: true,
          classificationType: (window as any).Cesium.ClassificationType.TERRAIN
        }
      });

      // Add roll ellipse if roll condition is not 'none'
      if (state.rollCondition && state.rollCondition !== 'none') {
        // Get roll multipliers
        const rollMultipliers = getRollMultipliers(state.rollCondition);
        
        // Calculate roll ellipse dimensions
        const rollSemiMajor = semiMajor * rollMultipliers.widthMultiplier;
        const rollSemiMinor = semiMinor * rollMultipliers.depthMultiplier;
        
        // Calculate roll ellipse center position
        // Position it so the minimum values are not closer than the carry oval
        // The roll oval and carry oval share a tangent point at the minor axis
        const carryDistanceFromCenter = semiMinor; // Distance from center to edge along shot line
        const rollDistanceFromCenter = rollSemiMinor; // Distance from center to edge along shot line
        
        // Calculate how far forward the roll ellipse center needs to be
        const rollCenterOffset = rollDistanceFromCenter - carryDistanceFromCenter;
        
        // Convert bearing to direction vector for offset calculation
        const offsetX = rollCenterOffset * Math.sin(bearing); // Longitude offset
        const offsetY = rollCenterOffset * Math.cos(bearing); // Latitude offset
        
        // Convert offset from meters to degrees
        const R = 6371000; // Earth radius in meters
        const deltaLat = offsetY / R * 180 / Math.PI;
        const deltaLon = offsetX / (R * Math.cos(state.aim.lat * Math.PI / 180)) * 180 / Math.PI;
        
        const rollCenterLon = state.aim.lon + deltaLon;
        const rollCenterLat = state.aim.lat + deltaLat;
        
        // Create roll ellipse polyline points
        const rollLonLatArr = ellipseLonLatArray(rollCenterLon, rollCenterLat, rollSemiMajor, rollSemiMinor, rotRad);
        
        // Create roll ellipse with green color
        viewer.entities.add({
          polyline: {
            positions: (window as any).Cesium.Cartesian3.fromDegreesArray(rollLonLatArr),
            width: 3,
            material: (window as any).Cesium.Color.GREEN,
            clampToGround: true,
            classificationType: (window as any).Cesium.ClassificationType.TERRAIN
          }
        });
      }
    }

    // Create tight bbox around golf features only (red, 8px thick)
    if (state.maskPngMeta && state.maskPngMeta.bbox && vectorFeatures) {
      const maskBbox = state.maskPngMeta.bbox;
      // console.log('🔴 Checking vectorFeatures:', !!vectorFeatures, vectorFeatures ? Object.keys(vectorFeatures) : 'none');
      
      const golfFeatures: any[] = [];  
      
      // Collect golf features (exclude OB, water hazards that extend far)
      Object.entries(vectorFeatures).forEach(([type, featuresData]: [string, any]) => {
        // console.log('🔴 Processing feature type:', type, 'with data:', featuresData);
        if (['fairways', 'greens', 'tees', 'bunkers'].includes(type)) {
          // Check if it's an object with features array, or direct array
          let features = featuresData;
          if (featuresData && typeof featuresData === 'object' && !Array.isArray(featuresData)) {
            // If it's an object, look for common properties like 'features', 'data', etc.
            features = featuresData.features || featuresData.data || featuresData;
          }
          if (Array.isArray(features)) {
            // console.log('🔴 Adding', features.length, 'features from', type);
            golfFeatures.push(...features);
          } else {
            console.log('🔴 No array found in', type, '- structure:', Object.keys(featuresData || {}));
          }
        }
      });
      
      if (golfFeatures.length > 0) {
        // console.log('🔴 Creating red tight bbox with', golfFeatures.length, 'golf features');
        // Calculate tight bounding box
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;
        
        golfFeatures.forEach(feature => {
          if (feature.geometry && feature.geometry.coordinates) {
            const coords = feature.geometry.coordinates;
            const flattenCoords = (arr: any[]): number[][] => {
              if (typeof arr[0] === 'number') return [arr as number[]];
              return arr.flatMap(flattenCoords);
            };
            
            flattenCoords(coords).forEach(([lon, lat]) => {
              if (typeof lon === 'number' && typeof lat === 'number') {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
              }
            });
          }
        });
        
        // Add small buffer (10 yards ≈ 0.00009 degrees)
        const buffer = 0.00009;
        const tightBbox = {
          west: minLon - buffer,
          south: minLat - buffer,
          east: maxLon + buffer,
          north: maxLat + buffer
        };
        
        // Create tight bbox outline (red, 8px thick, ground clamped)
        // console.log('🔴 Adding red rectangle entity with bbox:', tightBbox);
        const tightRectangle = viewer.entities.add({
          id: 'tight-bbox',
          rectangle: {
            coordinates: (window as any).Cesium.Rectangle.fromDegrees(
              tightBbox.west,
              tightBbox.south,
              tightBbox.east,
              tightBbox.north
            ),
            material: (window as any).Cesium.Color.TRANSPARENT,
            outline: true,
            outlineColor: (window as any).Cesium.Color.RED.withAlpha(0.9),
            outlineWidth: 8,
            height: 0,
            heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
            fill: false
          }
        });
        
        console.log('📏 Tight bbox area reduction vs original:', {
          original: maskBbox,
          tight: tightBbox,
          areaReduction: `${(100 * (1 - (
            (tightBbox.east - tightBbox.west) * (tightBbox.north - tightBbox.south) /
            ((maskBbox.east - maskBbox.west) * (maskBbox.north - maskBbox.south))
          ))).toFixed(1)}%`
        });
      }
    }

    viewer.scene.requestRender();
  }, [state.start, state.aim, state.pin, state.skillPreset, state.maskPngMeta, vectorFeatures, viewerReady]);

  // Handle raster overlay mode changes
  useEffect(() => {
    if (!viewerRef.current || !viewerReady || !activeMask) return;
    
    const viewer = viewerRef.current;
    // Use the activeMask bbox to ensure visual overlay matches sampling coordinates
    const bbox = activeMask.bbox;
    
    console.log('🎨 Visual overlay using bbox:', bbox);
    console.log('🎨 Active mask dimensions:', activeMask.width, 'x', activeMask.height);
    
    if (rasterMode === 'off') {
      hideRasterLayer(viewer);
    } else if (rasterMode === 'fill') {
      const canvas = colorizeMaskToCanvas(activeMask);
      showRasterLayer(viewer, canvas, bbox, 0.8);
    } else if (rasterMode === 'edges') {
      const canvas = edgesMaskToCanvas(activeMask);
      showRasterLayer(viewer, canvas, bbox, 1.0);
    }
  }, [viewerReady, rasterMode, activeMask]);

  // Class ID to color mapping for sample points (matching SamplesLayer)
  const getClassColor = (classId: number) => {
    const Cesium = (window as any).Cesium;
    switch (classId) {
      case 6: // Fairway
        return Cesium.Color.LIMEGREEN;
      case 5: // Green
        return Cesium.Color.LIGHTGREEN;
      case 2: // Water
        return Cesium.Color.CORNFLOWERBLUE;
      case 8: // Rough
        return Cesium.Color.OLIVE;
      case 4: // Bunker
        return Cesium.Color.PEACHPUFF;
      case 7: // Recovery
        return Cesium.Color.PLUM;
      case 3: // Hazard
        return Cesium.Color.TOMATO;
      case 1: // OB
        return Cesium.Color.WHITESMOKE;
      case 9: // Tee
        return Cesium.Color.POWDERBLUE;
      case 0: // Unknown/rough (treat as rough)
        return Cesium.Color.OLIVE;
      default: // Preview
        return Cesium.Color.fromBytes(153, 153, 153, 255); // grey
    }
  };

  // Camera positioning and samples are now handled by the effects above

  // Handle click events for point setting
  useEffect(() => {
    if (!viewerRef.current || !viewerReady) return;

    const viewer = viewerRef.current;
    const handler = new (window as any).Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(async (click: any) => {
      // Check if drawing manager is active - if so, let it handle the click
      if (drawingState.isDrawing) {
        console.log('🎨 Drawing mode active - deferring click to drawing manager');
        return; // Don't handle point selection when drawing
      }
      
      // Check if GPS is active and trying to place Start point
      if (isGPSActive && selectionModeRef.current === 'start') {
        console.log('🌍 GPS is active - ignoring manual Start point placement');
        return; // Don't allow manual Start placement when GPS is active
      }
      
      if (!selectionModeRef.current) return;
      
      // Use globe.pick for terrain-aware picking
      const ray = viewer.camera.getPickRay(click.position);
      const pickedPosition = viewer.scene.globe.pick(ray, viewer.scene);
      
      if (!pickedPosition) return;

      const cartographic = (window as any).Cesium.Cartographic.fromCartesian(pickedPosition);
      const longitude = (window as any).Cesium.Math.toDegrees(cartographic.longitude);
      const latitude = (window as any).Cesium.Math.toDegrees(cartographic.latitude);
      
      onPointSetRef.current(selectionModeRef.current, { lat: latitude, lon: longitude });
    }, (window as any).Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [viewerReady, drawingState.isDrawing, isGPSActive]); // Include drawing state and GPS state in dependencies


  // Utility functions
  function calculateDistance(p1: LatLon, p2: LatLon): number {
    const R = 6371000;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(p1.lat * Math.PI/180) * Math.cos(p2.lat * Math.PI/180) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1.09361; // Convert to yards
  }

  function calculateBearing(p1: LatLon, p2: LatLon): number {
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const lat1 = p1.lat * Math.PI / 180;
    const lat2 = p2.lat * Math.PI / 180;
    
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    
    return Math.atan2(y, x);
  }

  function ellipseLonLatArray(centerLon: number, centerLat: number, semiMajor: number, semiMinor: number, rotRad: number): number[] {
    const points = [];
    const numPoints = 64;
    
    for (let i = 0; i <= numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      
      // Calculate ellipse point in local coordinates
      const x = semiMajor * Math.cos(angle);
      const y = semiMinor * Math.sin(angle);
      
      // Apply rotation
      const rotX = x * Math.cos(rotRad) - y * Math.sin(rotRad);
      const rotY = x * Math.sin(rotRad) + y * Math.cos(rotRad);
      
      // Convert to lat/lon (approximate for small distances)
      const R = 6371000; // Earth radius in meters
      const deltaLat = rotY / R;
      const deltaLon = rotX / (R * Math.cos(centerLat * Math.PI / 180));
      
      const lat = centerLat + deltaLat * 180 / Math.PI;
      const lon = centerLon + deltaLon * 180 / Math.PI;
      
      points.push(lon, lat);
    }
    
    return points;
  }

  return (
    <DrawingManagerContext.Provider value={{ manager: drawingManager, state: drawingState }}>
      <Card className="overflow-visible">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">Course View</CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleGoogleTilesToggle}
              title="Toggle Photorealistic 3D"
              className="h-8 w-8"
            >
              <i className={`fas fa-cube ${photorealEnabled ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleGPS}
              title="Use GPS for Start"
              className="h-8 w-8"
              disabled={!isGPSSupported}
            >
              <i className={`fas fa-location-crosshairs ${isGPSActive ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRasterMode(rasterMode === 'fill' ? 'off' : 'fill')}
              title="Toggle Mask (Fill)"
              className="h-8 w-8"
            >
              <i className={`fas fa-layer-group ${rasterMode === 'fill' ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleSamplesToggle(!showSamples)}
              title="Toggle Sample Points"
              className="h-8 w-8"
            >
              <i className={`fas fa-circle-dot ${showSamples ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* 3D Canvas Container */}
        <div className="relative h-[38vh] sm:h-[44.3vh] lg:h-[27.8rem] xl:h-[30.4rem] 2xl:h-[32.9rem] bg-gradient-to-br from-green-100 to-green-200">
          <div ref={containerRef} className="absolute inset-0" />
          
          {(!viewerReady || loadingCourse) && (
            <div className="absolute inset-0 bg-black bg-opacity-10 flex items-center justify-center">
              <div className="text-center text-white max-w-sm">
                {loadingCourse && loadingProgress.stage ? (
                  <>
                    {/* Custom CSS Loader */}
                    <div className="flex justify-center mb-4">
                      <div className="course-loader"></div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2 opacity-90">
                      {state.courseId ? state.courseId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Loading Course'}
                    </h3>
                    <p className="text-sm opacity-80">{loadingProgress.stage}</p>
                  </>
                ) : (
                  <>
                    <i className="fas fa-globe text-4xl mb-4 opacity-70"></i>
                    <p className="text-sm opacity-70">Loading 3D Course Visualization</p>
                    <p className="text-xs opacity-50">Cesium Integration</p>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* CSS for custom loader */}
          <style dangerouslySetInnerHTML={{
            __html: `
              .course-loader {
                width: 40px;
                aspect-ratio: 1;
                color: #3b82f6;
                position: relative;
                background:
                  conic-gradient(from 134deg at top, currentColor 92deg, transparent 0) top,
                  conic-gradient(from -46deg at bottom, currentColor 92deg, transparent 0) bottom;
                background-size: 100% 50%;
                background-repeat: no-repeat;
              }
              .course-loader:before {
                content: '';
                position: absolute;
                inset: 0;
                --g: currentColor 14.5px, transparent 0 calc(100% - 14.5px), currentColor 0;
                background:
                  linear-gradient(45deg, var(--g)),
                  linear-gradient(-45deg, var(--g));
                animation: courseLoaderSpin 1.5s infinite cubic-bezier(0.3, 1, 0, 1);
              }
              @keyframes courseLoaderSpin {
                33% { inset: -10px; transform: rotate(0deg); }
                66% { inset: -10px; transform: rotate(90deg); }
                100% { inset: 0; transform: rotate(90deg); }
              }
            `
          }} />

          {/* Status indicators */}
          {viewerReady && (
            <div className="absolute top-4 left-4 space-y-2">
              {isGPSActive && (
                <Badge variant="default" className="text-xs bg-green-600">
                  <i className="fas fa-location-dot text-xs mr-1"></i>
                  GPS tracking start position
                </Badge>
              )}
              {state.selectionMode && !isGPSActive && (
                <Badge variant="secondary" className="text-xs">
                  Click map to set {state.selectionMode === 'start' ? 'starting position' : 
                    state.selectionMode === 'aim' ? 'aim point' : 'pin position'}
                </Badge>
              )}
              {state.selectionMode === 'start' && isGPSActive && (
                <Badge variant="secondary" className="text-xs">
                  GPS active - manual start placement disabled
                </Badge>
              )}
              {!state.selectionMode && !isGPSActive && (
                <Badge variant="secondary" className="text-xs">
                  Select a point type to place on map
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Camera Controls */}
        <div className="p-3 bg-muted border-t border-border">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center space-x-4">
              <span>Elevation: <span className="font-medium">245ft</span></span>
              <span>Zoom: <span className="font-medium">15x</span></span>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleCameraPreset('shotpov')}
                disabled={!viewerRef.current || !state.start || !state.aim}
              >
                Shot POV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleCameraPreset('overview')}
                disabled={!viewerRef.current || !holePolylinesByRef?.has(currentHole?.toString() || '') || !holeFeatures}
              >
                Overview
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleCameraPreset('tee')}
                disabled={!viewerRef.current || !holePolylinesByRef?.has(currentHole?.toString() || '') || !holeFeatures}
              >
                Tee
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleCameraPreset('fairway')}
                disabled={!viewerRef.current || !holePolylinesByRef?.has(currentHole?.toString() || '') || !holeFeatures}
              >
                Fairway
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs flex-1"
                onClick={() => handleCameraPreset('green')}
                disabled={!viewerRef.current || !holePolylinesByRef?.has(currentHole?.toString() || '') || !holeFeatures}
              >
                Green
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    </DrawingManagerContext.Provider>
  );
}

export default CesiumCanvas;
