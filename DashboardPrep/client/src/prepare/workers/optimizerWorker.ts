/// <reference lib="webworker" />
import type { AimCandidate, ESResult, LatLon } from "@shared/types";

type Feeds = {
  feasible: (rYds:number, thRad:number)=>boolean;                 // hazard inflation + progress rule
  toLatLon: (rYds:number, thRad:number)=>LatLon;                  // polar from start
  axesFor: (distanceYds:number)=>{a:number;b:number};             // ellipse axes from skill
  makeEllipsePoints: (aim:LatLon, a:number, b:number, n:number)=>LatLon[];
  sampleClasses: (pts:LatLon[])=>Promise<number[]>;               // mask sampling
  es: (job:any)=>Promise<ESResult>;                               // proxy to esWorker
};

type OptConfig = {
  maxCarryYds:number; iterations:number; batchSize:number; elitePct:number;
  sigmaFloor:{r:number; thDeg:number}; epsilon:number; minSamples:number; maxSamples:number;
};

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (e: MessageEvent<{ start:LatLon; pin:LatLon; feeds:Feeds; cfg:OptConfig }>) => {
  const { start, pin, feeds, cfg } = e.data;

  let mu = { r: cfg.maxCarryYds*0.7, th: 0 };
  let sigma = { r: cfg.maxCarryYds*0.25, th: (20*Math.PI)/180 };

  let best: AimCandidate | null = null;

  for (let it=0; it<cfg.iterations; it++){
    const pool: Array<{ r:number; th:number; es:ESResult; aim:LatLon }> = [];

    for (let i=0; i<cfg.batchSize; i++){
      const r = Math.max(0, mu.r + randn()*Math.max(sigma.r, cfg.sigmaFloor.r));
      const th = mu.th + randn()*Math.max(sigma.th, (cfg.sigmaFloor.thDeg*Math.PI)/180);
      if (r>cfg.maxCarryYds) continue;
      if (!feeds.feasible(r, th)) continue;

      const aim = feeds.toLatLon(r, th);
      const {a,b} = feeds.axesFor(r);
      const pts = feeds.makeEllipsePoints(aim, a, b, cfg.maxSamples);
      const classes = await feeds.sampleClasses(pts);
      const es = await feeds.es({ pin, points: pts, classes, minSamples: cfg.minSamples, maxSamples: cfg.maxSamples, epsilon: cfg.epsilon });
      pool.push({ r, th, es, aim });

      if (!best || es.mean < best.es.mean) best = { aim, es, distanceYds: r };
    }

    pool.sort((x,y)=>x.es.mean - y.es.mean);
    const keep = Math.max(2, Math.floor(cfg.elitePct * pool.length));
    const elites = pool.slice(0, keep);

    mu = {
      r: elites.reduce((s,c)=>s+c.r,0)/keep,
      th: elites.reduce((s,c)=>s+c.th,0)/keep,
    };
    sigma = {
      r: Math.sqrt(elites.reduce((s,c)=>s+(c.r-mu.r)**2,0)/keep),
      th: Math.sqrt(elites.reduce((s,c)=>s+(c.th-mu.th)**2,0)/keep),
    };
  }

  if (best) self.postMessage(best);
};

function randn(){
  const u = 1-Math.random(), v = 1-Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}