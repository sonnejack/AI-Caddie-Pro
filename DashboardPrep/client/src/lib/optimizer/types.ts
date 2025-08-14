// client/src/lib/optimizer/types.ts
// Optimizer framework types for pluggable aim optimization strategies

export type LL = { lon: number; lat: number };

export type Skill = { offlineDeg: number; distPct: number }; // from existing SKILL map or adapter

export interface OptimizerInput {
  start: LL;
  pin: LL;
  maxDistanceMeters: number;        // user set; consider plays-like constraint in eval
  skill: Skill;
  mask: {
    width: number;
    height: number;
    bbox: { west: number; south: number; east: number; north: number };
    classes: Uint8ClampedArray;     // RGBA data where red channel contains class id, transferable
  };
  heightGrid?: {
    // Only used for advanced short game analysis (not implemented yet)
    // For normal optimization, this will be undefined
    meta: any;                      // include spacing, bbox, dims; whatever your GridHeightProvider needs
    data: Float32Array[];           // coarse + fine patches if used, transferable
  };
  eval: {
    // Monte Carlo settings
    nEarly: number;                 // samples per aim in early passes (e.g., 200-300)
    nFinal: number;                 // samples per aim for final re-eval (e.g., 600)
    ci95Stop: number;               // early-stop CI threshold (e.g., 0.03-0.05)
  };
  constraints?: {
    // optional pruning
    disallowFartherThanPin?: boolean; // reject aims whose distance-to-pin > distance(start->pin)
    minSeparationMeters?: number;     // 2.74 m (~3 yds) between returned candidates
  };
}

export interface Candidate {
  lon: number;
  lat: number;
  es: number;          // expected strokes (mean)
  esCi95?: number;     // 95% CI if computed
}

export interface OptimizerResult {
  candidates: Candidate[];   // already sorted best->worst
  iterations?: number;
  evalCount?: number;
  diagnostics?: Record<string, any>;
}

export interface OptimizerStrategy {
  name: 'CEM' | 'RingGrid';
  run(input: OptimizerInput, signal: AbortSignal): Promise<OptimizerResult>;
}

// Worker message types
export type OptimizeMsg =
  | { type: 'run', strategy: 'CEM'|'RingGrid', input: OptimizerInput }
  | { type: 'cancel' };

export type ProgressMsg = { type:'progress', pct:number, note?:string };
export type DoneMsg = { type:'done', result: OptimizerResult };
export type ErrorMsg = { type:'error', error:string };