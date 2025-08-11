export type LatLon = { lat: number; lon: number };

export type SkillPreset = {
  name: string;       // "Pro", "Average", etc.
  offlineDeg: number; // e.g., 5.9
  distPct: number;    // e.g., 4.7   (± as % of shot length)
};

export const SKILL_PRESETS: SkillPreset[] = [
  { name: "Tour Pro", offlineDeg: 3.2, distPct: 2.8 },
  { name: "Elite Am", offlineDeg: 5.9, distPct: 4.7 },
  { name: "Good Am", offlineDeg: 8.1, distPct: 6.3 },
  { name: "Average", offlineDeg: 12.4, distPct: 9.8 },
  { name: "Beginner", offlineDeg: 18.7, distPct: 14.2 }
];

export type MaskMeta = {
  url: string;
  width: number;
  height: number;
  bbox: { west: number; south: number; east: number; north: number };
  paletteVersion: number;
};

export type ClassId = 0|1|2|3|4|5|6|7|8; // 0 unk, 1 OB, 2 Water, 3 Hazard, 4 Bunker, 5 Green, 6 Fairway, 7 Recovery, 8 Rough

export type ESBreakdown = Record<ClassId, number>;

export type ESResult = { mean: number; ci95: number; n: number; countsByClass: ESBreakdown };

export type AimCandidate = { aim: LatLon; es: ESResult; distanceYds: number };

export type PrepareState = {
  courseId?: string;
  holeId?: string;
  currentHole: number;
  bounds: any;
  viewBookmarks: any;
  mergedFeaturesVersion: number;
  maskPngMeta: MaskMeta | null;
  slopePngMeta: any;
  start: LatLon | null;
  pin: LatLon | null;
  aim: LatLon | null;
  skillPreset: SkillPreset;
  maxCarry: number;
  photorealEnabled: boolean;
};

export type PrepareEvent =
  | { type: 'COURSE_LOADED'; payload: { courseId: string } }
  | { type: 'HOLE_CHANGED'; payload: { holeId: string; holeNumber: number } }
  | { type: 'POINT_SET'; payload: { type: 'start' | 'aim' | 'pin'; point: LatLon } }
  | { type: 'SKILL_CHANGED'; payload: { skill: SkillPreset } }
  | { type: 'VIEW_PRESET_SELECTED'; payload: any }
  | { type: 'SAMPLES_UPDATED'; payload: any }
  | { type: 'OPTIMIZER_RESULT'; payload: any }
  | { type: 'POLYGONS_CHANGED'; payload: any };