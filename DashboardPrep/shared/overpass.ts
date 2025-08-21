// Robust osmtogeojson import for both CJS/ESM
import * as osmtogeojsonNS from "osmtogeojson";
const osmtogeojson: any = (osmtogeojsonNS as any).default ?? osmtogeojsonNS;

export interface OverpassQuery {
  seeds: string[];
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
    ref: string;                 // hole number (from way.tags.ref)
    polyline: { positions: {lon: number; lat: number}[]; par?: number; dist?: number };
  }>;
  features: {
    greens: GeoJSON.FeatureCollection;   // polygons only
    fairways: GeoJSON.FeatureCollection; // polygons only
    bunkers: GeoJSON.FeatureCollection;  // polygons only (merge golf=bunker + surface=sand polygons)
    water: GeoJSON.FeatureCollection;    // polygons only (natural=water + golf water hazards)
    tees: GeoJSON.FeatureCollection;     // nodes or polygons (keep both)
  };
}

export class OverpassImporter {
  async importCourse(seeds: string[]): Promise<ImportResponse> {
    console.log(`[Import] Starting import for seeds: ${seeds}`);
    
    // Parse the course ID
    const courseId = seeds[0];
    const osmData = await this.fetchOSMData(courseId);
    
    // Convert to GeoJSON with flat properties
    const geoJson = await this.convertToGeoJSON(osmData);
    console.log(`[Import] Converted to GeoJSON: ${geoJson.features.length} features`);
    
    // Process features
    const { holes, features } = this.processFeatures(geoJson);
    
    // Compute course bbox
    const bbox = this.computeBbox(geoJson);
    
    // Validate we have holes
    if (holes.length === 0) {
      const counts: Record<string,number> = {};
      for (const f of geoJson.features) { 
        const g = (f.properties as any)?.golf; 
        if (g) counts[g] = (counts[g]||0)+1; 
      }
      throw { 
        code:"NO_HOLE_WAYS", 
        message:"No golf=hole centerlines found near seed", 
        debug:{ counts } 
      };
    }

    const pc = {
      greens: features.greens.features.length,
      fairways: features.fairways.features.length,
      bunkers: features.bunkers.features.length,
      water: features.water.features.length,
      tees_nodes: features.tees.features.filter(f=>f.geometry?.type==="Point").length,
      tees_polys: features.tees.features.filter(f=>f.geometry?.type==="Polygon"||f.geometry?.type==="MultiPolygon").length
    };
    
    console.log(`[Import] holes: ${holes.length}, refs: [${holes.map(h=>h.ref).join(",")}]`);
    console.log(`[Import] polygons: greens=${pc.greens} fairways=${pc.fairways} bunkers=${pc.bunkers} water=${pc.water} tees(nodes)=${pc.tees_nodes} tees(polys)=${pc.tees_polys}`);

    return {
      course: { 
        id: courseId, 
        name: `Course ${courseId}`, 
        bbox: this.expandBbox(bbox, 0.01) 
      },
      holes,
      features
    };
  }

  /**
   * Fetch OSM data using proper area/fallback queries
   */
  async fetchOSMData(courseId: string): Promise<OverpassResponse> {
    console.log('Course ID being used:', courseId);
    
    // Try area query first
    let query = `[out:json][timeout:60];
      area(id:${courseId})->.a;
      (
        nwr["golf"](area.a);
        nwr["surface"="sand"](area.a);
        nwr["natural"="water"](area.a);
        nwr["waterway"](area.a);
      );
      (._;>;);
      out geom;`;
      
    console.log('Trying area query first...');
    console.log('Overpass Query:', query);
      
    let response = await fetch("https://overpass.kumi.systems/api/interpreter", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "AI-Caddie/1.0"
      },
      body: "data=" + encodeURIComponent(query)
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.elements && data.elements.length > 0) {
        console.log(`Area query successful: found ${data.elements.length} elements`);
        return data;
      } else {
        console.log('Area query returned no elements, trying direct relation/way query...');
      }
    } else {
      console.log('Area query failed, trying direct relation/way query...');
    }
    
    // Fallback: Query the relation/way directly and search around it
    // Convert area ID back to relation/way ID
    let osmId: number, osmType: string;
    const areaId = parseInt(courseId);
    if (areaId >= 3600000000) {
      osmId = areaId - 3600000000;
      osmType = 'relation';
    } else if (areaId >= 2400000000) {
      osmId = areaId - 2400000000;
      osmType = 'way';
    } else {
      throw new Error(`Invalid area ID format: ${courseId}`);
    }
    
    console.log(`Fallback: Querying ${osmType} ${osmId} directly...`);
    
    query = `[out:json][timeout:60];
      ${osmType}(${osmId});
      out geom;
      (
        nwr["golf"](around:1000);
        nwr["surface"="sand"](around:1000);
        nwr["natural"="water"](around:1000);
        nwr["waterway"](around:1000);
      );
      (._;>;);
      out geom;`;
      
    console.log('Fallback Overpass Query:', query);
      
    response = await fetch("https://overpass.kumi.systems/api/interpreter", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "AI-Caddie/1.0"
      },
      body: "data=" + encodeURIComponent(query)
    });
    
    if (!response.ok) {
      console.error('Overpass API Error Response:', response.status, response.statusText);
      
      // Try to get the error details from the response
      try {
        const errorText = await response.text();
        console.error('Overpass Error Details:', errorText);
        throw new Error(`Failed to fetch OSM data: ${response.statusText}. Details: ${errorText}`);
      } catch (textError) {
        throw new Error(`Failed to fetch OSM data: ${response.statusText}`);
      }
    }
    
    const data = await response.json();
    console.log(`Fallback query successful: found ${data.elements ? data.elements.length : 0} elements`);
    return data;
  }

  /**
   * Convert OSM to GeoJSON
   */
  async convertToGeoJSON(osmJson: OverpassResponse): Promise<GeoJSON.FeatureCollection> {
    return osmtogeojson(osmJson, { flatProperties: true }) as GeoJSON.FeatureCollection;
  }

  /**
   * Process GeoJSON features into holes and feature collections
   */
  processFeatures(geoJson: GeoJSON.FeatureCollection): {
    holes: ImportResponse['holes'];
    features: ImportResponse['features'];
  } {
    const holes: ImportResponse['holes'] = [];
    const greens: GeoJSON.Feature[] = [];
    const fairways: GeoJSON.Feature[] = [];
    const bunkers: GeoJSON.Feature[] = [];
    const water: GeoJSON.Feature[] = [];
    const tees: GeoJSON.Feature[] = [];

    console.log(`[Import] Processing ${geoJson.features.length} features`);

    let processed = 0;
    for (const feature of geoJson.features) {
      const properties = feature.properties || {};
      const geometry = feature.geometry;
      
      if (!geometry) continue;

      // Reduce verbose logging - only log every 50th feature
      if (processed % 50 === 0) {
        console.log(`[Import] Processing ${processed}/${geoJson.features.length} features...`);
      }
      processed++;

      // Extract hole polylines (golf=hole ways)
      if (properties.golf === 'hole' && this.isLineGeometry(geometry)) {
        const ref = (properties.ref || properties.name || "").toString().trim();
        if (ref) {
          const positions = this.extractLineCoordinates(geometry as GeoJSON.LineString | GeoJSON.MultiLineString).map(([lon, lat]) => ({lon, lat}));
          if (positions.length >= 2) {
            holes.push({
              ref,
              polyline: {
                positions,
                par: properties.par ? parseInt(properties.par) : undefined,
                dist: properties.distance || properties.dist
              }
            });
            console.log(`[Import] Found hole way: ref=${ref}, positions=${positions.length}`);
          }
        }
        continue;
      }

      // Process polygon features for mask painting
      if (this.isPolygonGeometry(geometry)) {
        if (properties.golf === 'green') {
          greens.push(feature);
          console.log('[Import] Added green polygon');
        } else if (properties.golf === 'fairway') {
          fairways.push(feature);
          console.log('[Import] Added fairway polygon');
        } else if (properties.golf === 'bunker' || properties.surface === 'sand') {
          bunkers.push(feature);
          console.log('[Import] Added bunker polygon');
        } else if (properties.natural === 'water' || 
                   properties.golf === 'water_hazard' || 
                   properties.golf === 'lateral_water_hazard' ||
                   properties.waterway) {
          water.push(feature);
          console.log('[Import] Added water polygon');
        }
      }

      // Process tee features (nodes or polygons)
      if (properties.golf === 'tee' && (this.isPointGeometry(geometry) || this.isPolygonGeometry(geometry))) {
        tees.push(feature);
        console.log('[Import] Added tee feature');
      }
    }

    return {
      holes,
      features: {
        greens: { type: 'FeatureCollection', features: greens },
        fairways: { type: 'FeatureCollection', features: fairways },
        bunkers: { type: 'FeatureCollection', features: bunkers },
        water: { type: 'FeatureCollection', features: water },
        tees: { type: 'FeatureCollection', features: tees }
      }
    };
  }

  private isPolygonGeometry(geometry: GeoJSON.Geometry): boolean {
    return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
  }

  private isPointGeometry(geometry: GeoJSON.Geometry): boolean {
    return geometry.type === "Point" || geometry.type === "MultiPoint";
  }

  private isLineGeometry(geometry: GeoJSON.Geometry): boolean {
    return geometry.type === "LineString" || geometry.type === "MultiLineString";
  }

  private extractLineCoordinates(geometry: GeoJSON.LineString | GeoJSON.MultiLineString): [number, number][] {
    if (geometry.type === "LineString") {
      return geometry.coordinates as [number, number][];
    }
    
    // For MultiLineString, find the longest line
    let longest: [number, number][] = [];
    let maxLength = 0;
    
    for (const line of geometry.coordinates) {
      let length = 0;
      for (let i = 1; i < line.length; i++) {
        const [x1, y1] = line[i-1];
        const [x2, y2] = line[i];
        length += Math.hypot(x2-x1, y2-y1);
      }
      if (length > maxLength) {
        maxLength = length;
        longest = line as [number, number][];
      }
    }
    
    return longest;
  }

  private computeBbox(geoJson: GeoJSON.FeatureCollection): { west: number; south: number; east: number; north: number } {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    
    const processCoordinates = (coords: any[]): void => {
      if (Array.isArray(coords[0])) {
        coords.forEach(coord => processCoordinates(coord));
      } else {
        const [lon, lat] = coords as [number, number];
        if (Number.isFinite(lon) && Number.isFinite(lat)) {
          west = Math.min(west, lon);
          east = Math.max(east, lon);
          south = Math.min(south, lat);
          north = Math.max(north, lat);
        }
      }
    };

    for (const feature of geoJson.features) {
      const geom = feature.geometry;
      if (geom && 'coordinates' in geom && geom.coordinates) {
        processCoordinates(geom.coordinates);
      }
    }

    // Fallback bbox if no valid coordinates found
    if (!Number.isFinite(west)) {
      return { west: -1, south: -1, east: 1, north: 1 };
    }

    return { west, south, east, north };
  }

  private expandBbox(bbox: { west: number; south: number; east: number; north: number }, margin: number) {
    const latMargin = (bbox.north - bbox.south) * margin;
    const lonMargin = (bbox.east - bbox.west) * margin;
    
    return {
      west: bbox.west - lonMargin,
      south: bbox.south - latMargin,
      east: bbox.east + lonMargin,
      north: bbox.north + latMargin
    };
  }
}

export const overpassImporter = new OverpassImporter();
// Alias for existing server import
export const overpassAPI = overpassImporter;