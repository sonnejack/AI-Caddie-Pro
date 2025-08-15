// Import the Expected Strokes engine class
import ExpectedStrokesEngine from "./expected-strokes.js";

type CourseCondition = "green"|"fairway"|"rough"|"sand"|"recovery"|"water";

// Create instance of the engine
const strokesEngine = new ExpectedStrokesEngine();

export const ES = {
  calculate(distanceYds: number, cond: CourseCondition): number {
    return strokesEngine.calculateExpectedStrokes(distanceYds, cond);
  }
};