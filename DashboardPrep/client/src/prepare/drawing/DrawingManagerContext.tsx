import { createContext } from 'react';
import type { ConditionDrawingManager, Condition } from '@/cesium/ConditionDrawingManager';

export type DrawingManagerState = {
  isDrawing: boolean;
  condition?: Condition;
  vertices: number;
};

export type DrawingManagerContextValue = {
  manager: ConditionDrawingManager | null;
  state: DrawingManagerState;
};

export const DrawingManagerContext = createContext<DrawingManagerContextValue | null>(null);
