import osmtogeojson from 'osmtogeojson';

export interface OverpassQuery {
  seeds: string[];
  bbox?: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
}

export interface OverpassElement {
  type: string;
  id: number;
  nodes?: number[];
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: any[];
}

export interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

export interface ImportResponse {
  course: { 
    id: string; 
    name: string; 
    bbox: { west: number; south: number; east: number; north: number } 
  };
  holes: Array<{
    number: number;
    bbox: { west: number; south: number; east: number; north: number };
    features: {
      tees: GeoJSON.FeatureCollection;
      greens: GeoJSON.FeatureCollection;
      fairways: GeoJSON.FeatureCollection;
      bunkers: GeoJSON.FeatureCollection;
      water: GeoJSON.FeatureCollection;
      hazards: GeoJSON.FeatureCollection;
      ob: GeoJSON.FeatureCollection;
      recovery: GeoJSON.FeatureCollection;
      rough: GeoJSON.FeatureCollection;
    };
  }>;
  holeMarkers: Array<{
    number: number;
    par: number;
    coordinates: [number, number]; // [longitude, latitude]
  }>;
}

export class OverpassAPI {
  private baseUrl = 'https://overpass-api.de/api/interpreter';

  async fetchCourseData(query: OverpassQuery): Promise<OverpassResponse> {
    let overpassQuery = this.buildQuery(query);
    
    try {
      console.log('Initial Overpass Query:', overpassQuery);
      
      let response = await fetch(this.baseUrl, {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.ok) {
        console.error('Primary query failed, trying fallback...');
        console.error('Primary query status:', response.status, response.statusText);
        
        // Log the error details from the primary query
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('Primary query error details:', errorText);
        } catch (e) {
          console.error('Could not read error response');
        }
        
        // Fallback: Query the relation/way directly and search around it
        overpassQuery = this.buildFallbackQuery(query.seeds[0]);
        console.log('Fallback Overpass Query:', overpassQuery);
        
        response = await fetch("https://overpass.kumi.systems/api/interpreter", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: "data=" + encodeURIComponent(overpassQuery)
        });
        
        if (!response.ok) {
          console.error('Fallback query also failed!');
          console.error('Overpass API Error Response:', response.status, response.statusText);
          const fallbackErrorText = await response.text();
          console.error('Fallback Error Details:', fallbackErrorText);
          throw new Error(`Failed to fetch OSM data: ${response.statusText}. Primary error: ${errorText}. Fallback error: ${fallbackErrorText}`);
        }
      }

      const data = await response.json();
      console.log(`Query successful: found ${data.elements ? data.elements.length : 0} elements`);
      return data;
      
    } catch (error) {
      console.error('Overpass API error:', error);
      throw error;
    }
  }

  private buildFallbackQuery(seedId: string): string {
    // Convert area ID back to relation/way ID
    let osmId, osmType;
    const areaId = parseInt(seedId);
    
    if (areaId >= 3600000000) {
      osmId = areaId - 3600000000;
      osmType = 'relation';
    } else if (areaId >= 2400000000) {
      osmId = areaId - 2400000000;
      osmType = 'way';
    } else {
      // Direct ID, try as way first (since many golf courses are ways)
      osmId = areaId;
      osmType = 'way';
    }
    
    console.log(`Fallback: Querying ${osmType} ${osmId} directly...`);
    
    return `[out:json][timeout:60];
      ${osmType}(${osmId});
      out geom;
      (
        nwr["golf"](around:1000);
        nwr["surface"="sand"](around:1000);
        nwr["natural"="water"](around:1000);
        nwr["waterway"](around:1000);
        nwr["highway"="path"](around:1000);
      );
      (._;>;);
      out geom;`;
  }

  async importCourse(seeds: string[]): Promise<ImportResponse> {
    const overpassData = await this.fetchCourseData({ seeds });
    const geoJson = osmtogeojson(overpassData);
    
    // Compute bbox from all geometries
    const bbox = this.computeBbox(geoJson);
    
    // Extract features by type and hole markers
    const { features, holeMarkers } = this.categorizeFeatures(geoJson);
    
    // Generate course name from first seed
    const courseName = `Course ${seeds[0]}`;
    
    return {
      course: {
        id: seeds[0],
        name: courseName,
        bbox
      },
      holes: [{
        number: 1,
        bbox,
        features
      }],
      holeMarkers
    };
  }

  private buildQuery(query: OverpassQuery): string {
    // Use the simpler fallback approach as the primary query
    // since the complex area-based query is having syntax issues
    return this.buildFallbackQuery(query.seeds[0]);
  }

  private computeBbox(geoJson: any): { west: number; south: number; east: number; north: number } {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    
    const processCoordinates = (coords: any[]) => {
      if (Array.isArray(coords[0])) {
        coords.forEach(coord => processCoordinates(coord));
      } else {
        const [lon, lat] = coords;
        west = Math.min(west, lon);
        east = Math.max(east, lon);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    };

    geoJson.features.forEach((feature: any) => {
      if (feature.geometry?.coordinates) {
        processCoordinates(feature.geometry.coordinates);
      }
    });

    return { west, south, east, north };
  }

  private categorizeFeatures(geoJson: any): { features: ImportResponse['holes'][0]['features'], holeMarkers: ImportResponse['holeMarkers'] } {
    const categories = {
      tees: [] as any[],
      greens: [] as any[],
      fairways: [] as any[],
      bunkers: [] as any[],
      water: [] as any[],
      hazards: [] as any[],
      ob: [] as any[],
      recovery: [] as any[],
      rough: [] as any[]
    };

    const holeMarkers: ImportResponse['holeMarkers'] = [];

    geoJson.features.forEach((feature: any) => {
      const props = feature.properties || {};
      
      // Extract hole markers FIRST - before other golf categorization
      if (props.golf === 'hole' && props.ref) {
        // Extract hole markers with numbers and par
        const holeNumber = parseInt(props.ref);
        const par = props.par ? parseInt(props.par) : 4; // default to par 4
        
        // Get center coordinates of the hole feature
        let coords: [number, number] = [0, 0];
        if (feature.geometry?.coordinates) {
          if (feature.geometry.type === 'Point') {
            coords = feature.geometry.coordinates;
          } else if (feature.geometry.type === 'Polygon') {
            // Calculate centroid of polygon
            const polygon = feature.geometry.coordinates[0];
            let sumLon = 0, sumLat = 0;
            polygon.forEach((coord: [number, number]) => {
              sumLon += coord[0];
              sumLat += coord[1];
            });
            coords = [sumLon / polygon.length, sumLat / polygon.length];
          } else if (feature.geometry.type === 'LineString') {
            // For LineString, take the middle point
            const lineCoords = feature.geometry.coordinates;
            const midIndex = Math.floor(lineCoords.length / 2);
            coords = lineCoords[midIndex];
          } else if (feature.geometry.type === 'MultiPolygon') {
            // For MultiPolygon, use the first polygon's centroid
            const firstPolygon = feature.geometry.coordinates[0][0];
            let sumLon = 0, sumLat = 0;
            firstPolygon.forEach((coord: [number, number]) => {
              sumLon += coord[0];
              sumLat += coord[1];
            });
            coords = [sumLon / firstPolygon.length, sumLat / firstPolygon.length];
          }
        }
        
        holeMarkers.push({
          number: holeNumber,
          par,
          coordinates: coords
        });
        console.log(`Extracted hole marker: ${holeNumber} (par ${par}) at [${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}]`);
        
        // Still add to rough category for mask painting
        categories.rough.push(feature);
      
      // Bunkers - check for sand surfaces first
      } else if (props.surface === "sand" || props.natural === "sand" || props.golf === "bunker") {
        categories.bunkers.push(feature);
        console.log('Categorized bunker:', props);
        
      // Greens
      } else if (props.golf === "green") {
        categories.greens.push(feature);
        console.log('Categorized green:', props);
        
      // Fairways 
      } else if (props.golf === "fairway") {
        categories.fairways.push(feature);
        console.log('Categorized fairway:', props);
        
      // Tees
      } else if (props.golf === "tee") {
        categories.tees.push(feature);
        console.log('Categorized tee:', props);
        
      // Water hazards - comprehensive water detection
      } else if (props.natural === "water" || 
                 props.leisure === "water" || 
                 props.waterway || 
                 props.water ||
                 props.golf === "water_hazard") {
        categories.water.push(feature);
        console.log('Categorized water:', props);
        
      // Rough
      } else if (props.golf === "rough") {
        categories.rough.push(feature);
        console.log('Categorized rough:', props);
        
      // Other hazards
      } else if (props.hazard || props.golf === "lateral_water_hazard") {
        categories.hazards.push(feature);
        console.log('Categorized hazard:', props);
        
      // Cart paths as recovery areas
      } else if (props.golf === "cartpath" || 
                 (props.highway === "path" && props.golf)) {
        categories.recovery.push(feature);
        console.log('Categorized cart path as recovery:', props);
        
      // Trees/forest as recovery
      } else if (props.natural === "wood" || 
                 props.natural === "tree" || 
                 props.landuse === "forest") {
        categories.recovery.push(feature);
        console.log('Categorized trees/forest as recovery:', props);
        
      } else if (props.golf) {
        // Any other golf-tagged feature gets put in rough as default
        categories.rough.push(feature);
        console.log('Categorized unknown golf feature as rough:', props);
      }
    });

    console.log('Feature categorization summary:', {
      tees: categories.tees.length,
      greens: categories.greens.length,
      fairways: categories.fairways.length,
      bunkers: categories.bunkers.length,
      water: categories.water.length,
      hazards: categories.hazards.length,
      recovery: categories.recovery.length,
      rough: categories.rough.length
    });

    // If hole markers have no coordinates, distribute them evenly across the bbox
    if (holeMarkers.length > 0 && holeMarkers.every(h => h.coordinates[0] === 0 && h.coordinates[1] === 0)) {
      const bbox = this.computeBbox(geoJson);
      holeMarkers.forEach((marker, index) => {
        // Arrange holes in a rough grid pattern across the course
        const cols = Math.ceil(Math.sqrt(holeMarkers.length));
        const rows = Math.ceil(holeMarkers.length / cols);
        const col = index % cols;
        const row = Math.floor(index / cols);
        
        const lon = bbox.west + (col + 0.5) * (bbox.east - bbox.west) / cols;
        const lat = bbox.south + (row + 0.5) * (bbox.north - bbox.south) / rows;
        
        marker.coordinates = [lon, lat];
      });
      console.log(`Distributed ${holeMarkers.length} hole markers across course bbox`);
    }

    console.log(`Extracted ${holeMarkers.length} hole markers`);

    return {
      features: {
        tees: { type: 'FeatureCollection', features: categories.tees },
        greens: { type: 'FeatureCollection', features: categories.greens },
        fairways: { type: 'FeatureCollection', features: categories.fairways },
        bunkers: { type: 'FeatureCollection', features: categories.bunkers },
        water: { type: 'FeatureCollection', features: categories.water },
        hazards: { type: 'FeatureCollection', features: categories.hazards },
        ob: { type: 'FeatureCollection', features: categories.ob },
        recovery: { type: 'FeatureCollection', features: categories.recovery },
        rough: { type: 'FeatureCollection', features: categories.rough }
      },
      holeMarkers
    };
  }
}

export const overpassAPI = new OverpassAPI();