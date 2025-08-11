// @ts-ignore legacy JS module - handle both CommonJS and ESM
import ExpectedStrokesEngineClass from "./expected-strokes.js";

type CourseCondition = "green"|"fairway"|"rough"|"sand"|"recovery"|"water";

// Create instance of the engine
const strokesEngine = new ExpectedStrokesEngineClass();

export const ES = {
  calculate(distanceYds: number, cond: CourseCondition): number {
    return strokesEngine.calculateExpectedStrokes(distanceYds, cond);
  }
};