// Direct mask pixel lookup for instant classification
import type { MaskBuffer } from './maskBuffer';

export function classifyPointInstant(lon: number, lat: number, maskBuffer: MaskBuffer): number {
  // Calculate pixel coordinates
  const x = Math.floor(((lon - maskBuffer.bbox.west) / (maskBuffer.bbox.east - maskBuffer.bbox.west)) * maskBuffer.width);
  const y = Math.floor(((maskBuffer.bbox.north - lat) / (maskBuffer.bbox.north - maskBuffer.bbox.south)) * maskBuffer.height);
  
  // Clamp to bounds
  const clampedX = Math.max(0, Math.min(maskBuffer.width - 1, x));
  const clampedY = Math.max(0, Math.min(maskBuffer.height - 1, y));
  
  // Get pixel data (red channel contains class)
  const pixelIndex = (clampedY * maskBuffer.width + clampedX) * 4;
  let classId = maskBuffer.data[pixelIndex];
  
  // Handle in-between colors by rounding to nearest valid class
  if (classId > 0 && classId < 255) {
    // Round to nearest valid class ID (0,1,2,3,4,5,6,7,8,9)
    const validClasses = [0,1,2,3,4,5,6,7,8,9];
    classId = validClasses.reduce((prev, curr) => 
      Math.abs(curr - classId) < Math.abs(prev - classId) ? curr : prev
    );
  }
  
  // Return class, defaulting to 8 (rough) for unknown/transparent
  return classId === 0 ? 8 : Math.max(0, Math.min(9, classId));
}

export function classifyPointsInstant(pointsLL: Float64Array, maskBuffer: MaskBuffer): Uint8Array {
  const n = Math.floor(pointsLL.length / 2);
  const classes = new Uint8Array(n);
  
  for (let i = 0; i < n; i++) {
    const lon = pointsLL[i * 2];
    const lat = pointsLL[i * 2 + 1];
    classes[i] = classifyPointInstant(lon, lat, maskBuffer);
  }
  
  return classes;
}