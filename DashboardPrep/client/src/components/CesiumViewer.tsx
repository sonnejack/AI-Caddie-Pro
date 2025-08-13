import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    viewer: any;
    Cesium: any;
  }
}

interface CesiumViewerProps {
  className?: string;
}

export default function CesiumViewer({ className = "w-full h-full" }: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const initializeCesium = async () => {
      try {
        // Set your Cesium Ion token
        window.Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIwM2RkYmZmMi0wOGU5LTQ3ZmItOGY3Yy01YWI0OGM2NDQzMjEiLCJpZCI6MzE3NDQwLCJpYXQiOjE3NTEzNzQ2NDl9.PzVT68ZKLTu3i2sfPSARSx6FfEfoF5n0GMW1FeCIieg";
        
        // Create the Cesium viewer with terrain and optimized settings
        const viewer = new window.Cesium.Viewer(containerRef.current, {
          terrainProvider: await window.Cesium.CesiumTerrainProvider.fromIonAssetId(1),
          baseLayerPicker: false,
          sceneModePicker: false,
          animation: false,
          timeline: false,
          selectionIndicator: false,
          infoBox: false,
          homeButton: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: false,
          navigationHelpButton: false,
        });

        // Make viewer globally accessible for polygon loading
        window.viewer = viewer;
        viewerRef.current = viewer;
        console.log('✅ Cesium viewer initialized with Ion token');

        // Disable entity selection behavior
        viewer.selectedEntity = undefined;
        viewer.trackedEntity = undefined;
        
        // Prevent any future selections by immediately clearing them
        viewer.selectedEntityChanged.addEventListener(() => {
          if (viewer.selectedEntity) {
            viewer.selectedEntity = undefined;
          }
        });
        
        // Prevent camera tracking
        viewer.trackedEntityChanged.addEventListener(() => {
          if (viewer.trackedEntity) {
            viewer.trackedEntity = undefined;
          }
        });
        /*
        // Set initial camera position (golf course friendly)
        viewer.camera.setView({
          destination: window.Cesium.Cartesian3.fromDegrees(-84.68, 39.285, 1000), // TPC River's Bend area
          orientation: {
            heading: window.Cesium.Math.toRadians(0),
            pitch: window.Cesium.Math.toRadians(-45),
            roll: 0.0
          }
        });
        */
      } catch (error) {
        console.error('❌ Failed to initialize Cesium viewer:', error);
      }
    };

    // Wait for Cesium to be available
    if (window.Cesium) {
      initializeCesium();
    } else {
      const checkCesium = setInterval(() => {
        if (window.Cesium) {
          clearInterval(checkCesium);
          initializeCesium();
        }
      }, 100);
    }

    // Cleanup
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        window.viewer = undefined;
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={className}
      style={{ 
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#000'
      }}
    />
  );
}