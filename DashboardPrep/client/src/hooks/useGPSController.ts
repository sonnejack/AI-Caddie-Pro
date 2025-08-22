import { useState, useRef, useCallback } from 'react';

export interface LatLon {
  lat: number;
  lon: number;
}

interface GPSControllerOptions {
  onLocationUpdate: (location: LatLon) => void;
  onError?: (error: string) => void;
  onGPSEnabled?: () => void;
  onGPSDisabled?: () => void;
  distanceThresholdMeters?: number;
  throttleIntervalMs?: number;
}

export const useGPSController = ({
  onLocationUpdate,
  onError,
  onGPSEnabled,
  onGPSDisabled,
  distanceThresholdMeters = 3.0,
  throttleIntervalMs = 1000
}: GPSControllerOptions) => {
  const [isGPSActive, setIsGPSActive] = useState(false);
  const [isGPSSupported, setIsGPSSupported] = useState(
    typeof navigator !== 'undefined' && 'geolocation' in navigator
  );
  
  const watchIdRef = useRef<number | null>(null);
  const lastAcceptedLocationRef = useRef<LatLon | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const retryAttemptRef = useRef<number>(0);

  // Distance calculation using Haversine formula (meters)
  const calculateDistance = useCallback((a: LatLon, b: LatLon): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;

    const aVal = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    
    return R * c;
  }, []);

  // Distance calculation using Cesium EllipsoidGeodesic if available
  const calculateDistanceCesium = useCallback((a: LatLon, b: LatLon): number => {
    if (typeof window !== 'undefined' && (window as any).Cesium) {
      const Cesium = (window as any).Cesium;
      try {
        const cartographicA = Cesium.Cartographic.fromDegrees(a.lon, a.lat);
        const cartographicB = Cesium.Cartographic.fromDegrees(b.lon, b.lat);
        const geodesic = new Cesium.EllipsoidGeodesic(cartographicA, cartographicB);
        return geodesic.surfaceDistance;
      } catch (error) {
        console.warn('Failed to use Cesium geodesic, falling back to Haversine:', error);
        return calculateDistance(a, b);
      }
    }
    return calculateDistance(a, b);
  }, [calculateDistance]);

  const handlePositionUpdate = useCallback((position: GeolocationPosition) => {
    // Reset retry counter on successful location update
    retryAttemptRef.current = 0;
    
    const now = Date.now();
    const newLocation: LatLon = {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    };

    // Throttle updates to prevent too frequent callbacks
    if (now - lastUpdateTimeRef.current < throttleIntervalMs) {
      return;
    }

    // Check distance threshold if we have a previous location
    if (lastAcceptedLocationRef.current) {
      const distance = calculateDistanceCesium(lastAcceptedLocationRef.current, newLocation);
      
      if (distance < distanceThresholdMeters) {
        // Location hasn't moved enough, skip update
        return;
      }
    }

    // Log the accepted update with distance moved
    const distanceMoved = lastAcceptedLocationRef.current 
      ? calculateDistanceCesium(lastAcceptedLocationRef.current, newLocation).toFixed(1) + 'm'
      : 'first update';
    console.log('🌍 GPS location update accepted:', newLocation, 'distance moved:', distanceMoved, 
      `accuracy: ${position.coords.accuracy?.toFixed(1) || 'unknown'}m`);
    
    // Accept this location update
    lastAcceptedLocationRef.current = newLocation;
    lastUpdateTimeRef.current = now;
    
    onLocationUpdate(newLocation);
  }, [onLocationUpdate, distanceThresholdMeters, throttleIntervalMs, calculateDistanceCesium]);

  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    let errorMessage = '';
    let shouldRetry = false;
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location access denied. Please allow location access in your browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'GPS signal unavailable. Try moving to an area with better GPS reception.';
        shouldRetry = true;
        break;
      case error.TIMEOUT:
        errorMessage = 'GPS taking longer than expected. This is normal indoors or in areas with poor GPS signal.';
        shouldRetry = true;
        break;
      default:
        errorMessage = 'Unknown GPS error occurred.';
        shouldRetry = true;
    }
    
    console.warn('GPS error:', errorMessage, error);
    
    // For timeout and unavailable errors, try fallback options
    if (shouldRetry && retryAttemptRef.current < 2) {
      retryAttemptRef.current++;
      console.log(`🌍 GPS retry attempt ${retryAttemptRef.current} with fallback options...`);
      
      // Try with less accurate but faster settings
      const fallbackOptions: PositionOptions = {
        enableHighAccuracy: retryAttemptRef.current === 1, // First retry: still try high accuracy
        maximumAge: 60000, // Accept positions up to 1 minute old
        timeout: 15000 // Shorter timeout for fallback
      };
      
      try {
        if (watchIdRef.current) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
        
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePositionUpdate,
          handlePositionError,
          fallbackOptions
        );
        return; // Don't show error yet, let retry attempt work
      } catch (retryError) {
        console.error('GPS retry failed:', retryError);
      }
    }
    
    // If we've exhausted retries or it's a permission error, stop and show error
    if (!shouldRetry || retryAttemptRef.current >= 2) {
      // Stop GPS directly without depending on stopGPS callback
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsGPSActive(false);
      lastAcceptedLocationRef.current = null;
      lastUpdateTimeRef.current = 0;
      retryAttemptRef.current = 0;
      
      if (onGPSDisabled) {
        onGPSDisabled();
      }
    }
    
    if (onError) {
      onError(errorMessage);
    }
  }, [onError]);

  const startGPS = useCallback(() => {
    if (!isGPSSupported || !navigator.geolocation) {
      const error = 'GPS not supported on this device';
      console.error(error);
      if (onError) {
        onError(error);
      }
      return;
    }

    if (watchIdRef.current !== null) {
      // Already watching
      return;
    }

    console.log('🌍 Starting GPS watch...');
    
    // Reset retry counter when starting fresh
    retryAttemptRef.current = 0;
    
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 5000, // Allow cached positions up to 5 seconds old
      timeout: 30000 // Increase timeout to 30 seconds for better reliability
    };

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionUpdate,
        handlePositionError,
        options
      );
      
      setIsGPSActive(true);
      console.log('🌍 GPS watch started with ID:', watchIdRef.current);
      
      if (onGPSEnabled) {
        onGPSEnabled();
      }
    } catch (error) {
      console.error('Failed to start GPS watch:', error);
      if (onError) {
        onError('Failed to start GPS: ' + (error as Error).message);
      }
    }
  }, [isGPSSupported, handlePositionUpdate, handlePositionError, onError]);

  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      console.log('🌍 Stopping GPS watch:', watchIdRef.current);
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    setIsGPSActive(false);
    lastAcceptedLocationRef.current = null;
    lastUpdateTimeRef.current = 0;
    console.log('🌍 GPS watch stopped');
    
    if (onGPSDisabled) {
      onGPSDisabled();
    }
  }, []);

  const toggleGPS = useCallback(() => {
    if (isGPSActive) {
      stopGPS();
    } else {
      startGPS();
    }
  }, [isGPSActive, startGPS, stopGPS]);

  return {
    isGPSActive,
    isGPSSupported,
    startGPS,
    stopGPS,
    toggleGPS
  };
};