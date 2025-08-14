// client/src/lib/optimizer/index.ts
// Optimizer registry and factory for pluggable optimization strategies

import { OptimizerStrategy } from './types';
import { CEMOptimizer } from './cem';
import { RingGridOptimizer } from './ringGrid';

export const OPTIMIZERS: Record<string, () => OptimizerStrategy> = {
  'CEM': () => new CEMOptimizer(),
  'RingGrid': () => new RingGridOptimizer(),
};

export * from './types';
export { CEMOptimizer } from './cem';
export { RingGridOptimizer } from './ringGrid';