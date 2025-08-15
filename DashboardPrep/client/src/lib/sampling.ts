import { LatLon, SkillPreset, RollCondition, getRollMultipliers } from './types';

// Common Halton sequence generator for consistent sampling between preview and worker
export function halton2D(index: number, base1: number = 2, base2: number = 3): [number, number] {
  function halton(i: number, base: number): number {
    let result = 0;
    let fraction = 1 / base;
    let n = i;
    
    while (n > 0) {
      result += (n % base) * fraction;
      n = Math.floor(n / base);
      fraction /= base;
    }
    
    return result;
  }
  
  return [halton(index, base1), halton(index, base2)];
}

// Map unit disk coordinates to ellipse with heading rotation (matching working code)
export function mapUnitDiskToEllipse(
  u: number, 
  v: number, 
  semiMajor: number, 
  semiMinor: number, 
  headingRad: number,
  centerLL: LatLon
): LatLon {
  // Transform uniform (u,v) to unit disk
  const r = Math.sqrt(u);
  const theta = 2 * Math.PI * v;
  
  // Generate point in ellipse local coordinates
  const x = semiMajor * r * Math.cos(theta);
  const y = semiMinor * r * Math.sin(theta);
  
  // Apply rotation matrix (matching working implementation)
  const cosR = Math.cos(headingRad);
  const sinR = Math.sin(headingRad);
  const xr = x * cosR - y * sinR;
  const yr = x * sinR + y * cosR;
  
  // Convert to lat/lon using proper meters per degree calculations
  const metersPerDegLat = 111320; // meters per degree latitude (constant)
  const metersPerDegLon = 111320 * Math.cos(centerLL.lat * Math.PI / 180); // varies by latitude
  
  const lon = centerLL.lon + xr / metersPerDegLon;
  const lat = centerLL.lat + yr / metersPerDegLat;
  
  return { lat, lon };
}

// Generate N samples using common Halton sequence
export function generateEllipseSamples(
  nSamples: number,
  semiMajor: number,
  semiMinor: number, 
  headingRad: number,
  centerLL: LatLon,
  seed: number = 1
): Float64Array {
  const pointsLL = new Float64Array(nSamples * 2);
  
  for (let i = 0; i < nSamples; i++) {
    const [u, v] = halton2D(seed + i);
    const point = mapUnitDiskToEllipse(u, v, semiMajor, semiMinor, headingRad, centerLL);
    pointsLL[i * 2] = point.lon;
    pointsLL[i * 2 + 1] = point.lat;
  }
  
  return pointsLL;
}

// Generate mixed samples: N/3 from carry ellipse + 2N/3 from roll ellipse
export function generateMixedEllipseSamples(
  nSamples: number,
  carryParams: {
    semiMajor: number;
    semiMinor: number;
    headingRad: number;
    centerLL: LatLon;
  },
  rollParams: {
    semiMajor: number;
    semiMinor: number; 
    headingRad: number;
    centerLL: LatLon;
  },
  seed: number = 1
): { samples: Float64Array; carryCount: number; rollCount: number } {
  const carryCount = Math.floor(nSamples / 3);
  const rollCount = nSamples - carryCount; // This ensures total is exactly nSamples
  
  const pointsLL = new Float64Array(nSamples * 2);
  let pointIndex = 0;
  
  // Generate carry samples (N/3)
  for (let i = 0; i < carryCount; i++) {
    const [u, v] = halton2D(seed + i);
    const point = mapUnitDiskToEllipse(
      u, v, 
      carryParams.semiMajor, 
      carryParams.semiMinor, 
      carryParams.headingRad, 
      carryParams.centerLL
    );
    pointsLL[pointIndex * 2] = point.lon;
    pointsLL[pointIndex * 2 + 1] = point.lat;
    pointIndex++;
  }
  
  // Generate roll samples (2N/3)
  for (let i = 0; i < rollCount; i++) {
    const [u, v] = halton2D(seed + carryCount + i); // Continue sequence
    const point = mapUnitDiskToEllipse(
      u, v, 
      rollParams.semiMajor, 
      rollParams.semiMinor, 
      rollParams.headingRad, 
      rollParams.centerLL
    );
    pointsLL[pointIndex * 2] = point.lon;
    pointsLL[pointIndex * 2 + 1] = point.lat;
    pointIndex++;
  }
  
  return { 
    samples: pointsLL, 
    carryCount, 
    rollCount 
  };
}

export class HaltonSampler {
  private index: number = 0;

  constructor(private base1: number = 2, private base2: number = 3) {}

  private halton(index: number, base: number): number {
    let result = 0;
    let fraction = 1 / base;
    let i = index;
    
    while (i > 0) {
      result += (i % base) * fraction;
      i = Math.floor(i / base);
      fraction /= base;
    }
    
    return result;
  }

  next(): [number, number] {
    const u1 = this.halton(this.index, this.base1);
    const u2 = this.halton(this.index, this.base2);
    this.index++;
    return [u1, u2];
  }

  reset(): void {
    this.index = 0;
  }
}

export class UniformEllipseSampler {
  private sampler: HaltonSampler;
  
  constructor(
    private center: LatLon,
    private semiMajor: number, // longitudinal in yards
    private semiMinor: number, // lateral in yards
    private bearing: number    // aim bearing in radians
  ) {
    this.sampler = new HaltonSampler();
  }

  // Calculate ellipse dimensions from skill and distance
  static calculateEllipseDimensions(distance: number, skill: SkillPreset) {
    const longitudinal = (skill.distPct / 100) * distance;
    const lateral = distance * Math.tan(skill.offlineDeg * Math.PI / 180);
    return { longitudinal, lateral };
  }

  // Sample uniformly within ellipse
  samplePoint(): LatLon {
    const [u1, u2] = this.sampler.next();
    
    // Uniform sampling in unit disk
    const r = Math.sqrt(u1);
    const theta = 2 * Math.PI * u2;
    
    // Transform to ellipse in local coordinates
    const x_local = this.semiMajor * r * Math.cos(theta);
    const y_local = this.semiMinor * r * Math.sin(theta);
    
    // Rotate by bearing
    const cos_bearing = Math.cos(this.bearing);
    const sin_bearing = Math.sin(this.bearing);
    
    const x_rotated = x_local * cos_bearing - y_local * sin_bearing;
    const y_rotated = x_local * sin_bearing + y_local * cos_bearing;
    
    // Convert yards to approximate lat/lon offsets
    const metersPerYard = 0.9144;
    const latOffset = (y_rotated * metersPerYard) / 111320; // approximate
    const lonOffset = (x_rotated * metersPerYard) / (111320 * Math.cos(this.center.lat * Math.PI / 180));
    
    return {
      lat: this.center.lat + latOffset,
      lon: this.center.lon + lonOffset
    };
  }

  sampleBatch(count: number): LatLon[] {
    const points: LatLon[] = [];
    for (let i = 0; i < count; i++) {
      points.push(this.samplePoint());
    }
    return points;
  }

  reset(): void {
    this.sampler.reset();
  }
}

// Welford's online variance algorithm for progressive confidence intervals
export class ProgressiveStats {
  private count = 0;
  private mean = 0;
  private m2 = 0;

  add(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  getMean(): number {
    return this.mean;
  }

  getVariance(): number {
    return this.count < 2 ? 0 : this.m2 / (this.count - 1);
  }

  getStandardError(): number {
    return Math.sqrt(this.getVariance() / this.count);
  }

  getConfidenceInterval95(): number {
    // 95% CI = ±1.96 * SE
    return 1.96 * this.getStandardError();
  }

  getCount(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.mean = 0;
    this.m2 = 0;
  }
}
