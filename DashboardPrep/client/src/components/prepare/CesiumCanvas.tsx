import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PrepareState, LatLon } from '../../lib/types';
import { colorizeMaskToCanvas, edgesMaskToCanvas, showRasterLayer, hideRasterLayer } from '@/lib/rasterOverlay';
import type { MaskBuffer } from '@/lib/maskBuffer';

interface CesiumCanvasProps {
  state: PrepareState;
  onPointSet: (type: 'start' | 'aim' | 'pin', point: LatLon) => void;
  maskBuffer?: MaskBuffer;
  holeMarkers?: Array<{number: number, par: number, coordinates: [number, number]}>;
  samplePoints?: Array<{point: LatLon, classId: number}>;
  cameraPosition?: { position: LatLon, heading: number, pitch: number, height: number };
}

function CesiumCanvas({ state, onPointSet, maskBuffer, holeMarkers, samplePoints, cameraPosition }: CesiumCanvasProps) {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializingRef = useRef(false);
  const selectionModeRef = useRef(state.selectionMode);
  const onPointSetRef = useRef(onPointSet);
  const [viewerReady, setViewerReady] = useState(false);
  const [layersVisible, setLayersVisible] = useState(true);
  const [slopeArrows, setSlopeArrows] = useState(false);
  const [photorealEnabled, setPhotorealEnabled] = useState(false);
  const [rasterMode, setRasterMode] = useState<'off' | 'fill' | 'edges'>('off');
  const [showSamples, setShowSamples] = useState(false);
  const samplePointsRef = useRef<any>(null);


  // Update refs when props change
  selectionModeRef.current = state.selectionMode;
  onPointSetRef.current = onPointSet;

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current || initializingRef.current) return;
    
    initializingRef.current = true;

    const initializeCesium = async () => {
      try {
        // Set Cesium Ion token from environment variable
        const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
        (window as any).Cesium.Ion.defaultAccessToken = token;
        
        // Create terrain provider using Ion asset
        let terrainProvider;
        try {
          terrainProvider = await (window as any).Cesium.CesiumTerrainProvider.fromIonAssetId(1);
        } catch (terrainError) {
          console.warn('Failed to load Ion terrain, using default terrain:', terrainError);
          terrainProvider = undefined;
        }

        // Initialize Cesium viewer with minimal UI
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

        viewerRef.current = viewer;
        setViewerReady(true);
        initializingRef.current = false;

      } catch (error) {
        console.error('Failed to initialize Cesium viewer:', error);
        initializingRef.current = false;
      }
    };

    initializeCesium();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      initializingRef.current = false;
    };
  }, []);

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
          verticalOrigin: (window as any).Cesium.VerticalOrigin.BOTTOM,
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
          verticalOrigin: (window as any).Cesium.VerticalOrigin.BOTTOM,
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
          verticalOrigin: (window as any).Cesium.VerticalOrigin.BOTTOM,
          heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
        }
      });
    }

    // Add dispersion ellipse if both start and aim are set
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
      
      // Create ellipse polyline points
      const lonLatArr = ellipseLonLatArray(state.aim.lon, state.aim.lat, semiMajor, semiMinor, rotRad);
      
      // Create polyline ellipse with ground clamping
      viewer.entities.add({
        polyline: {
          positions: (window as any).Cesium.Cartesian3.fromDegreesArray(lonLatArr),
          width: 3,
          material: (window as any).Cesium.Color.YELLOW,
          clampToGround: true,
          classificationType: (window as any).Cesium.ClassificationType.TERRAIN
        }
      });
    }

    // Add raster mask overlay if available
    if (state.maskPngMeta && state.maskPngMeta.bbox) {
      const maskBbox = state.maskPngMeta.bbox;
      
      // Create a ground-clamped course boundary outline
      const maskRectangle = viewer.entities.add({
        rectangle: {
          coordinates: (window as any).Cesium.Rectangle.fromDegrees(
            maskBbox.west, 
            maskBbox.south, 
            maskBbox.east, 
            maskBbox.north
          ),
          material: (window as any).Cesium.Color.TRANSPARENT,
          outline: true,
          outlineColor: (window as any).Cesium.Color.RED.withAlpha(0.8),
          height: 0,
          heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
          fill: false
        }
      });
    }

    // Add hole markers from OSM data
    if (holeMarkers && holeMarkers.length > 0) {
      holeMarkers.forEach(hole => {
        viewer.entities.add({
          position: (window as any).Cesium.Cartesian3.fromDegrees(hole.coordinates[0], hole.coordinates[1], 0),
          label: {
            text: `${hole.number}`,
            font: '16pt sans-serif bold',
            fillColor: (window as any).Cesium.Color.WHITE,
            outlineColor: (window as any).Cesium.Color.BLACK,
            outlineWidth: 3,
            style: (window as any).Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: (window as any).Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: (window as any).Cesium.HorizontalOrigin.CENTER,
            heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scale: 1.0,
            pixelOffset: new (window as any).Cesium.Cartesian2(0, -10)
          },
          point: {
            pixelSize: 20,
            color: (window as any).Cesium.Color.YELLOW.withAlpha(0.8),
            outlineColor: (window as any).Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: (window as any).Cesium.HeightReference.CLAMP_TO_GROUND
          }
        });
      });
      console.log(`Added ${holeMarkers.length} hole markers to map`);
    }

    viewer.scene.requestRender();
  }, [state.start, state.aim, state.pin, state.skillPreset, state.maskPngMeta, holeMarkers, viewerReady]);

  // Handle raster overlay mode changes
  useEffect(() => {
    if (!viewerRef.current || !viewerReady || !maskBuffer || !state.maskPngMeta?.bbox) return;
    
    const viewer = viewerRef.current;
    const bbox = state.maskPngMeta.bbox;
    
    if (rasterMode === 'off') {
      hideRasterLayer(viewer);
    } else if (rasterMode === 'fill') {
      const canvas = colorizeMaskToCanvas(maskBuffer);
      showRasterLayer(viewer, canvas, bbox, 0.8);
    } else if (rasterMode === 'edges') {
      const canvas = edgesMaskToCanvas(maskBuffer);
      showRasterLayer(viewer, canvas, bbox, 1.0);
    }
  }, [viewerReady, rasterMode, maskBuffer, state.maskPngMeta?.bbox]);

  // Class ID to color mapping for sample points
  const getClassColor = (classId: number) => {
    const Cesium = (window as any).Cesium;
    switch (classId) {
      case 6: // Fairway
        return Cesium.Color.fromCssColorString('#28B43C');
      case 5: // Green
        return Cesium.Color.fromCssColorString('#6CFF8A');
      case 2: // Water
        return Cesium.Color.fromCssColorString('#0078FF');
      case 8: // Rough
        return Cesium.Color.fromCssColorString('#8B5E3C');
      case 4: // Bunker
        return Cesium.Color.fromCssColorString('#D2B48C');
      case 7: // Recovery
        return Cesium.Color.fromCssColorString('#8E44AD');
      case 3: // Hazard
        return Cesium.Color.fromCssColorString('#E74C3C');
      case 1: // OB
        return Cesium.Color.fromCssColorString('#8E44AD');
      default: // Unknown/Tee
        return Cesium.Color.fromCssColorString('#D3D3D3');
    }
  };

  // Handle camera positioning from hole navigation
  useEffect(() => {
    if (!viewerRef.current || !viewerReady || !cameraPosition) return;
    
    const viewer = viewerRef.current;
    const { position, heading, pitch, height } = cameraPosition;
    
    console.log('🎥 Flying camera to hole navigation position:', cameraPosition);
    
    viewer.camera.flyTo({
      destination: (window as any).Cesium.Cartesian3.fromDegrees(position.lon, position.lat, height),
      orientation: {
        heading,
        pitch,
        roll: 0
      },
      duration: 2.0
    });
  }, [viewerReady, cameraPosition]);

  // Handle sample points visualization
  useEffect(() => {
    if (!viewerRef.current || !viewerReady) return;

    const viewer = viewerRef.current;
    const Cesium = (window as any).Cesium;

    // Remove existing sample points
    if (samplePointsRef.current) {
      viewer.scene.primitives.remove(samplePointsRef.current);
      samplePointsRef.current = null;
    }

    // Add sample points if enabled and available
    if (showSamples && samplePoints && samplePoints.length > 0) {
      const pointCollection = new Cesium.PointPrimitiveCollection();
      
      samplePoints.forEach(({ point, classId }) => {
        pointCollection.add({
          position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0),
          color: getClassColor(classId),
          pixelSize: 6,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        });
      });

      samplePointsRef.current = pointCollection;
      viewer.scene.primitives.add(pointCollection);
    }

    viewer.scene.requestRender();
  }, [viewerReady, showSamples, samplePoints]);

  // Handle click events for point setting
  useEffect(() => {
    if (!viewerRef.current || !viewerReady) return;

    const viewer = viewerRef.current;
    const handler = new (window as any).Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction(async (click: any) => {
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
  }, [viewerReady]); // Only depend on viewerReady - refs handle the rest

  const handleCameraPreset = (preset: 'tee' | 'green' | 'overview') => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    let destination, orientation;

    switch (preset) {
      case 'tee':
        destination = (window as any).Cesium.Cartesian3.fromDegrees(-2.82, 56.348, 50);
        orientation = { heading: 0, pitch: -0.2, roll: 0 };
        break;
      case 'green':
        destination = (window as any).Cesium.Cartesian3.fromDegrees(-2.8185, 56.3495, 30);
        orientation = { heading: Math.PI, pitch: -0.3, roll: 0 };
        break;
      case 'overview':
        destination = (window as any).Cesium.Cartesian3.fromDegrees(-2.8192, 56.3487, 400);
        orientation = { heading: 0, pitch: -0.7, roll: 0 };
        break;
    }

    viewer.camera.flyTo({ destination, orientation, duration: 2 });
  };

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
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-secondary">Course View</CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPhotorealEnabled(!photorealEnabled)}
              title="Toggle Photorealistic 3D"
              className="h-8 w-8"
            >
              <i className={`fas fa-cube ${photorealEnabled ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLayersVisible(!layersVisible)}
              title="Toggle Features"
              className="h-8 w-8"
            >
              <i className={`fas fa-layer-group ${layersVisible ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSlopeArrows(!slopeArrows)}
              title="Toggle Slope Arrows"
              className="h-8 w-8"
            >
              <i className={`fas fa-arrow-up ${slopeArrows ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRasterMode(rasterMode === 'fill' ? 'off' : 'fill')}
              title="Toggle Mask (Fill)"
              className="h-8 w-8"
            >
              <i className={`fas fa-palette ${rasterMode === 'fill' ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRasterMode(rasterMode === 'edges' ? 'off' : 'edges')}
              title="Toggle Mask (Edges)"
              className="h-8 w-8"
            >
              <i className={`fas fa-border-style ${rasterMode === 'edges' ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSamples(!showSamples)}
              title="Show Sample Points"
              className="h-8 w-8"
            >
              <i className={`fas fa-circle ${showSamples ? 'text-primary' : 'text-gray-400'}`}></i>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* 3D Canvas Container */}
        <div className="relative h-96 bg-gradient-to-br from-green-100 to-green-200">
          <div ref={containerRef} className="absolute inset-0" />
          
          {!viewerReady && (
            <div className="absolute inset-0 bg-black bg-opacity-10 flex items-center justify-center">
              <div className="text-center text-white">
                <i className="fas fa-globe text-4xl mb-2 opacity-70"></i>
                <p className="text-sm opacity-70">Loading 3D Course Visualization</p>
                <p className="text-xs opacity-50">Cesium Integration</p>
              </div>
            </div>
          )}

          {/* Status indicators */}
          {viewerReady && (
            <div className="absolute top-4 left-4 space-y-2">
              {state.selectionMode && (
                <Badge variant="secondary" className="text-xs">
                  Click map to set {state.selectionMode === 'start' ? 'starting position' : 
                    state.selectionMode === 'aim' ? 'aim point' : 'pin position'}
                </Badge>
              )}
              {!state.selectionMode && (
                <Badge variant="secondary" className="text-xs">
                  Select a point type to place on map
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Camera Controls */}
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <div className="flex items-center space-x-4">
              <span>Elevation: <span className="font-medium">245ft</span></span>
              <span>Zoom: <span className="font-medium">15x</span></span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleCameraPreset('tee')}
              >
                Tee View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleCameraPreset('green')}
              >
                Green View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleCameraPreset('overview')}
              >
                Overview
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CesiumCanvas;
