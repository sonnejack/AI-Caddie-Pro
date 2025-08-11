/// <reference lib="webworker" />
import { ProgressiveStats } from "../lib/ci";
import { ES } from "@shared/expectedStrokesAdapter";
import type { ClassId, ESResult, LatLon } from "@shared/types";

type ESJob = {
  pin: LatLon;
  points: LatLon[];   // pre-generated uniform points in ellipse (Halton order)
  classes: ClassId[]; // mask classes for points
  minSamples: number; // Nmin
  maxSamples: number; // Nmax
  epsilon: number;    // CI95 target
};

declare const self: DedicatedWorkerGlobalScope;

const Rm = 6371000;
const toRad = (d:number)=>d*Math.PI/180;
const yds = (m:number)=>m*1.09361;
function distYds(a:LatLon, b:LatLon){
  const x = toRad(b.lon - a.lon)*Math.cos(toRad((a.lat + b.lat)/2));
  const y = toRad(b.lat - a.lat);
  return yds(Math.sqrt(x*x + y*y)*Rm);
}

self.onmessage = (e: MessageEvent<ESJob>) => {
  const { pin, points, classes, minSamples, maxSamples, epsilon } = e.data;
  const stats = new ProgressiveStats();
  const counts: Record<ClassId, number> = {0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};

  for (let i=0; i<Math.min(points.length, maxSamples); i++){
    const p = points[i];
    const cls = classes[i];
    counts[cls] = (counts[cls] ?? 0) + 1;

    const cond =
      cls===5 ? "green" :
      cls===6 ? "fairway" :
      cls===4 ? "sand" :
      cls===7 ? "recovery" :
      cls===2 ? "water"  :
      "rough";

    const es = ES.calculate(distYds(p, pin), cond);
    stats.add(es);

    if ((i+1) >= minSamples && stats.ci95() <= epsilon){
      const out: ESResult = { mean: stats.mean, ci95: stats.ci95(), n: i+1, countsByClass: counts };
      self.postMessage(out);
      return;
    }
  }
  const out: ESResult = { mean: stats.mean, ci95: stats.ci95(), n: Math.min(points.length, maxSamples), countsByClass: counts };
  self.postMessage(out);
};