import { describe, test, expect } from '@jest/globals';
import { ServerRasterBaker } from '../rasterBaker';
import { CLASS_IDS } from '@shared/constants';

describe('ServerRasterBaker', () => {
  const baker = new ServerRasterBaker();
  
  // Micro test course: 2 simple polygons in a small bbox
  const testBbox = {
    west: -84.1,
    south: 39.1, 
    east: -84.09,
    north: 39.11
  };
  
  const testFeatures = {
    greens: {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-84.095, 39.105], // Small green in center
            [-84.095, 39.106],
            [-84.094, 39.106], 
            [-84.094, 39.105],
            [-84.095, 39.105]
          ]]
        },
        properties: {}
      }]
    },
    fairways: {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-84.098, 39.102], // Fairway rectangle  
            [-84.098, 39.108],
            [-84.092, 39.108],
            [-84.092, 39.102], 
            [-84.098, 39.102]
          ]]
        },
        properties: {}
      }]
    },
    bunkers: { type: 'FeatureCollection' as const, features: [] },
    water: { type: 'FeatureCollection' as const, features: [] },
    tees: { type: 'FeatureCollection' as const, features: [] }
  };
  
  test('deterministic mask creation produces consistent results', async () => {
    const metadata = {
      courseId: 'test-course',
      courseName: 'Test Course',
      bbox: testBbox,
      contributorId: 'test-user'
    };
    
    // Bake the same data twice
    const result1 = await baker.createRasterVersion(metadata, testFeatures, []);
    const result2 = await baker.createRasterVersion(metadata, testFeatures, []);
    
    // Should produce identical checksums (deterministic)
    expect(result1.checksum).toBe(result2.checksum);
    
    // Verify expected dimensions
    expect(result1.rasterData.width).toBeGreaterThan(0);
    expect(result1.rasterData.height).toBeGreaterThan(0);
    expect(result1.rasterData.bbox).toEqual(testBbox);
    
    // Verify class histogram makes sense
    const data = result1.rasterData.data;
    const classCount = new Map<number, number>();
    
    for (let i = 0; i < data.length; i++) {
      const classId = data[i];
      classCount.set(classId, (classCount.get(classId) || 0) + 1);
    }
    
    console.log('Test mask class distribution:', Array.from(classCount.entries()));
    
    // Should have some fairway pixels (class 6)
    expect(classCount.get(CLASS_IDS.FAIRWAY) || 0).toBeGreaterThan(0);
    
    // Should have some green pixels (class 5)  
    expect(classCount.get(CLASS_IDS.GREEN) || 0).toBeGreaterThan(0);
    
    // Should have rough pixels as background (class 0)
    expect(classCount.get(CLASS_IDS.ROUGH) || 0).toBeGreaterThan(0);
  });
  
  test('user polygons override base features correctly', async () => {
    const metadata = {
      courseId: 'test-course-2',
      courseName: 'Test Course 2', 
      bbox: testBbox,
      contributorId: 'test-user'
    };
    
    // Add a bunker polygon over part of the fairway
    const userPolygons = [{
      condition: 'bunker',
      coordinates: [
        { lat: 39.104, lon: -84.096 },
        { lat: 39.105, lon: -84.096 },
        { lat: 39.105, lon: -84.095 },
        { lat: 39.104, lon: -84.095 }
      ]
    }];
    
    const baseResult = await baker.createRasterVersion(metadata, testFeatures, []);
    const userResult = await baker.createRasterVersion(metadata, testFeatures, userPolygons);
    
    // Should produce different checksums
    expect(baseResult.checksum).not.toBe(userResult.checksum);
    
    // User version should have bunker pixels
    const userData = userResult.rasterData.data;
    const classCount = new Map<number, number>();
    
    for (let i = 0; i < userData.length; i++) {
      const classId = userData[i];
      classCount.set(classId, (classCount.get(classId) || 0) + 1);
    }
    
    expect(classCount.get(CLASS_IDS.BUNKER) || 0).toBeGreaterThan(0);
  });
  
  test('bbox and dimensions are preserved exactly', async () => {
    const metadata = {
      courseId: 'test-course-3',
      courseName: 'Test Course 3',
      bbox: testBbox,
      contributorId: 'test-user'
    };
    
    const result = await baker.createRasterVersion(metadata, testFeatures, []);
    
    // Bbox should be preserved exactly
    expect(result.rasterData.bbox).toEqual(testBbox);
    
    // Aspect ratios should match
    const bboxAspect = (testBbox.east - testBbox.west) / (testBbox.north - testBbox.south);
    const rasterAspect = result.rasterData.width / result.rasterData.height;
    
    expect(Math.abs(bboxAspect - rasterAspect)).toBeLessThan(0.01); // Close match
  });
});