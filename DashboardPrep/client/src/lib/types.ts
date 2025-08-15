export type LatLon = { lat: number; lon: number };

export type SkillPreset = {
  name: 'Pro'|'Elite Am'|'Good'|'Average'|'Bad'|'Terrible'|string;
  offlineDeg: number;   // e.g., 5.9
  distPct: number;      // e.g., 4.7  (± long/short as % of shot length)
};

export type MaskMeta = {
  url: string; width: number; height: number; // pixels
  bbox: { west: number; south: number; east: number; north: number };
  paletteVersion: number; // class IDs stable across versions
  courseBbox?: { west: number; south: number; east: number; north: number }; // Optional course-level bbox for camera positioning
};

export type ClassId = 0|1|2|3|4|5|6|7|8|9; // unknown, OB, Water, Hazard, Bunker, Green, Fairway, Recovery, Rough, TEE

export type RollCondition = 'none' | 'soft' | 'medium' | 'firm' | 'concrete';

export type ESResult = { 
  mean: number; 
  ci95: number; 
  n: number; 
  countsByClass: Record<ClassId, number>;
  avgProximity?: number;        // Average distance from all sample points to pin
  avgProximityInPlay?: number;  // Average distance from in-play sample points to pin
  distsYds?: number[];          // Legacy: distances of each sample to pin
  classes?: ClassId[];          // Legacy: class of each sample point
};

export type AimCandidate = { aim: LatLon; es: ESResult; distanceYds: number };

export type PrepareState = {
  courseId: string | null;
  holeId: string | null;
  currentHole: number;
  bounds: any;
  viewBookmarks: any;
  mergedFeaturesVersion: number;
  maskPngMeta: MaskMeta | null;
  slopePngMeta: MaskMeta | null;
  start: LatLon | null;
  pin: LatLon | null;
  aim: LatLon | null;
  skillPreset: SkillPreset;
  maxCarry: number;
  photorealEnabled: boolean;
  selectionMode: 'start' | 'aim' | 'pin' | null;
  rollCondition: RollCondition;
};

export type PrepareEvent = 
  | { type: 'COURSE_LOADED'; payload: { courseId: string } }
  | { type: 'HOLE_CHANGED'; payload: { holeId: string; holeNumber: number } }
  | { type: 'VIEW_PRESET_SELECTED'; payload: { preset: string } }
  | { type: 'POINT_SET'; payload: { type: 'start'|'aim'|'pin'; point: LatLon } }
  | { type: 'SELECTION_MODE_CHANGED'; payload: { mode: 'start'|'aim'|'pin'|null } }
  | { type: 'SKILL_CHANGED'; payload: { skill: SkillPreset } }
  | { type: 'ROLL_CONDITION_CHANGED'; payload: { rollCondition: RollCondition } }
  | { type: 'SAMPLES_UPDATED'; payload: ESResult }
  | { type: 'OPTIMIZER_RESULT'; payload: { candidates: AimCandidate[] } }
  | { type: 'POLYGONS_CHANGED'; payload: { polygons: any[] } };

export function getRollMultipliers(condition: RollCondition) {
  switch (condition) {
    case 'soft':
      return { widthMultiplier: 1.07, depthMultiplier: 1.4 };
    case 'medium':
      return { widthMultiplier: 1.14, depthMultiplier: 1.7 };
    case 'firm':
      return { widthMultiplier: 1.19, depthMultiplier: 2.0 };
    case 'concrete':
      return { widthMultiplier: 1.23, depthMultiplier: 2.3 };
    default: // 'none'
      return { widthMultiplier: 1.0, depthMultiplier: 1.0 };
  }
}

export const SKILL_PRESETS: SkillPreset[] = [
  { name: "Robot", offlineDeg: 2.5, distPct: 2.5 },
  { name: "Pro", offlineDeg: 5.9, distPct: 6.75 },
  { name: "Elite Am", offlineDeg: 6.45, distPct: 6.95 },
  { name: "Scratch", offlineDeg: 6.9, distPct: 7.3 },
  { name: "Good Golfer", offlineDeg: 7.45, distPct: 8.0 },
  { name: "Average Golfer", offlineDeg: 8.2, distPct: 8.75 },
  { name: "Bad Golfer", offlineDeg: 9.4, distPct: 10.0 },
  { name: "Terrible Golfer", offlineDeg: 12.5, distPct: 14.0 }
];

export const CONDITION_COLORS = {
  unknown: '#9CA3AF',
  ob: '#DC2626',
  water: '#2563EB', 
  hazard: '#EF4444',
  bunker: '#FDE047',
  green: '#22C55E',
  fairway: '#84CC16',
  recovery: '#A3A3A3',
  rough: '#6B7280',
};
