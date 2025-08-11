// Aim Optimizer Worker - implements CEM algorithm with geometric pruning
import { LatLon, AimCandidate, SkillPreset, ESResult } from '../lib/types';
import { UniformEllipseSampler } from '../lib/sampling';

interface OptimizerMessage {
  type: 'OPTIMIZE' | 'CANCEL';
  payload?: {
    start: LatLon;
    pin: LatLon;
    skill: SkillPreset;
    maxCarry: number;
    tolerance: number;
  };
}

interface OptimizerResponse {
  type: 'OPTIMIZATION_RESULT' | 'OPTIMIZATION_PROGRESS' | 'ERROR';
  payload?: {
    candidates?: AimCandidate[];
    progress?: number;
    iteration?: number;
    message?: string;
  };
}

let cancelled = false;

// CEM Parameters
const CEM_ITERATIONS = 8;
const CEM_SAMPLES = 128;
const CEM_ELITE_RATIO = 0.15;
const CEM_SIGMA_FLOOR_DISTANCE = 5; // yards
const CEM_SIGMA_FLOOR_BEARING = 3 * Math.PI / 180; // 3 degrees

self.onmessage = function(e: MessageEvent<OptimizerMessage>) {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'OPTIMIZE':
        if (!payload) {
          throw new Error('Missing payload for OPTIMIZE');
        }
        cancelled = false;
        optimizeAim(payload);
        break;

      case 'CANCEL':
        cancelled = true;
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error instanceof Error ? error.message : 'Unknown error' }
    } as OptimizerResponse);
  }
};

async function optimizeAim(params: {
  start: LatLon;
  pin: LatLon;
  skill: SkillPreset;
  maxCarry: number;
  tolerance: number;
}) {
  const { start, pin, skill, maxCarry, tolerance } = params;

  // Calculate total distance
  const totalDistance = calculateDistance(start, pin);
  const bearing = calculateBearing(start, pin);

  // Initialize CEM distribution (r, theta) relative to direct line
  let meanR = Math.min(maxCarry * 0.9, totalDistance * 0.9); // Conservative initial aim distance
  let meanTheta = 0; // Start aiming directly at pin
  let sigmaR = 50; // yards
  let sigmaTheta = 15 * Math.PI / 180; // 15 degrees

  let bestCandidates: AimCandidate[] = [];

  for (let iter = 0; iter < CEM_ITERATIONS && !cancelled; iter++) {
    // Generate candidate aim points
    const candidates: LatLon[] = [];
    for (let i = 0; i < CEM_SAMPLES; i++) {
      const r = Math.max(50, Math.min(maxCarry, normalRandom(meanR, sigmaR)));
      const theta = normalRandom(meanTheta, sigmaTheta);
      
      // Convert polar to Cartesian relative to start
      const aimBearing = bearing + theta;
      const aim = projectPoint(start, r, aimBearing);
      candidates.push(aim);
    }

    // Evaluate candidates (simplified for demo - in real implementation would use ES worker)
    const evaluatedCandidates: AimCandidate[] = [];
    for (const aim of candidates) {
      const distance = calculateDistance(start, aim);
      
      // Mock ES calculation (in real implementation, this would call ES worker)
      const mockES: ESResult = {
        mean: 3.5 + Math.random() * 0.5 + (distance > maxCarry ? 1.0 : 0),
        ci95: 0.02 + Math.random() * 0.02,
        n: 1000,
        countsByClass: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 100, 6: 800, 7: 100, 8: 0 }
      };

      evaluatedCandidates.push({
        aim,
        es: mockES,
        distanceYds: distance
      });
    }

    // Sort by Expected Strokes (lower is better)
    evaluatedCandidates.sort((a, b) => a.es.mean - b.es.mean);

    // Keep elite samples
    const eliteCount = Math.ceil(CEM_SAMPLES * CEM_ELITE_RATIO);
    const elites = evaluatedCandidates.slice(0, eliteCount);
    
    // Update best candidates
    if (iter === 0 || elites[0].es.mean < bestCandidates[0].es.mean) {
      bestCandidates = elites.slice(0, 3); // Keep top 3
    }

    // Refit distribution
    if (elites.length > 1) {
      const eliteR = elites.map(e => calculateDistance(start, e.aim));
      const eliteTheta = elites.map(e => {
        const candBearing = calculateBearing(start, e.aim);
        return normalizeAngle(candBearing - bearing);
      });

      meanR = eliteR.reduce((sum, r) => sum + r, 0) / elites.length;
      meanTheta = eliteTheta.reduce((sum, t) => sum + t, 0) / elites.length;

      sigmaR = Math.max(CEM_SIGMA_FLOOR_DISTANCE, 
        Math.sqrt(eliteR.reduce((sum, r) => sum + (r - meanR) ** 2, 0) / (elites.length - 1)));
      sigmaTheta = Math.max(CEM_SIGMA_FLOOR_BEARING,
        Math.sqrt(eliteTheta.reduce((sum, t) => sum + (t - meanTheta) ** 2, 0) / (elites.length - 1)));
    }

    // Report progress
    self.postMessage({
      type: 'OPTIMIZATION_PROGRESS',
      payload: {
        progress: ((iter + 1) / CEM_ITERATIONS) * 100,
        iteration: iter + 1
      }
    } as OptimizerResponse);

    // Small delay to prevent blocking
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  if (!cancelled) {
    // Final result
    self.postMessage({
      type: 'OPTIMIZATION_RESULT',
      payload: { candidates: bestCandidates }
    } as OptimizerResponse);
  }
}

// Utility functions
function calculateDistance(p1: LatLon, p2: LatLon): number {
  const R = 6371000; // Earth radius in meters
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

function projectPoint(start: LatLon, distance: number, bearing: number): LatLon {
  const R = 6371000; // Earth radius in meters
  const d = distance * 0.9144; // yards to meters
  
  const lat1 = start.lat * Math.PI / 180;
  const lon1 = start.lon * Math.PI / 180;
  
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d/R) + Math.cos(lat1) * Math.sin(d/R) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(d/R) * Math.cos(lat1), Math.cos(d/R) - Math.sin(lat1) * Math.sin(lat2));
  
  return {
    lat: lat2 * 180 / Math.PI,
    lon: lon2 * 180 / Math.PI
  };
}

function normalRandom(mean: number, sigma: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export {};
