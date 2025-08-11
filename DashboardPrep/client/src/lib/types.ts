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

export type ClassId = 0|1|2|3|4|5|6|7|8; // unknown, OB, Water, Hazard, Bunker, Green, Fairway, Recovery, Rough

export type ESResult = { mean: number; ci95: number; n: number; countsByClass: Record<ClassId, number> };

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
};

export type PrepareEvent = 
  | { type: 'COURSE_LOADED'; payload: { courseId: string } }
  | { type: 'HOLE_CHANGED'; payload: { holeId: string; holeNumber: number } }
  | { type: 'VIEW_PRESET_SELECTED'; payload: { preset: string } }
  | { type: 'POINT_SET'; payload: { type: 'start'|'aim'|'pin'; point: LatLon } }
  | { type: 'SELECTION_MODE_CHANGED'; payload: { mode: 'start'|'aim'|'pin'|null } }
  | { type: 'SKILL_CHANGED'; payload: { skill: SkillPreset } }
  | { type: 'SAMPLES_UPDATED'; payload: ESResult }
  | { type: 'OPTIMIZER_RESULT'; payload: { candidates: AimCandidate[] } }
  | { type: 'POLYGONS_CHANGED'; payload: { polygons: any[] } };

export const SKILL_PRESETS: SkillPreset[] = [
  { name: 'Pro', offlineDeg: 2.5, distPct: 3.0 },
  { name: 'Elite Am', offlineDeg: 3.8, distPct: 4.2 },
  { name: 'Good', offlineDeg: 5.2, distPct: 5.8 },
  { name: 'Average', offlineDeg: 7.1, distPct: 7.5 },
  { name: 'Bad', offlineDeg: 9.8, distPct: 9.2 },
  { name: 'Terrible', offlineDeg: 12.5, distPct: 11.8 },
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
