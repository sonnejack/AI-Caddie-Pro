import type { LatLon } from "@shared/types";

const toRad = (d:number) => d*Math.PI/180;

export function ellipseAxes(distanceYds: number, degOffline: number, longShortPct: number) {
  const a = (longShortPct/100) * distanceYds;      // along aim
  const b = distanceYds * Math.tan(toRad(degOffline)); // across aim
  return { a, b };
}

// Halton sequence
export function halton(index:number, base:number){
  let result=0, f=1, i=index;
  while(i>0){ f/=base; result += f*(i%base); i=Math.floor(i/base); }
  return result;
}

// 1-indexed i → uniform point in ellipse local coords (a,b)
export function uniformPointInEllipse(i:number, a:number, b:number){
  const u1 = halton(i,2), u2 = halton(i,3);
  const r = Math.sqrt(u1), th = 2*Math.PI*u2;
  const xd = r*Math.cos(th), yd = r*Math.sin(th);
  return { x:a*xd, y:b*yd };
}

// rotate local (x,y) by bearing phi and translate to world meters origin
export function rotateTranslate(x:number, y:number, phi:number, origin:{x:number;y:number}){
  const xr = x*Math.cos(phi) - y*Math.sin(phi);
  const yr = x*Math.sin(phi) + y*Math.cos(phi);
  return { x: origin.x + xr, y: origin.y + yr };
}

// meters ↔ lat/lon near ref lat
export function metersToLatLon(x:number, y:number, ref:LatLon):LatLon{
  const latRad = toRad(ref.lat);
  const dLat = y/111_320;
  const dLon = x/(111_320*Math.cos(latRad));
  return { lat: ref.lat + dLat, lon: ref.lon + dLon };
}

export function latLonToMeters(ll:LatLon, ref:LatLon):{x:number;y:number}{
  const latRad = toRad(ref.lat);
  const dLat = ll.lat - ref.lat;
  const dLon = ll.lon - ref.lon;
  const y = dLat * 111_320;
  const x = dLon * (111_320 * Math.cos(latRad));
  return { x, y };
}