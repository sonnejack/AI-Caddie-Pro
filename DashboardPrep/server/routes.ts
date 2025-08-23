import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserPolygonSchema } from "@shared/schema";
import express from "express";
import path from "path";

interface SearchCourse {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  type: string;
  center: { lat: number; lon: number };
  display_name: string;
}

async function searchCoursesByName(courseName: string, maxResults = 10): Promise<SearchCourse[]> {
  try {
    // Add rate limiting delay to be respectful to Nominatim
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Step 1: Use Nominatim to find golf courses by name
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(courseName + ' golf course')}&` +
      `format=json&` +
      `limit=${maxResults}&` +
      `addressdetails=1&` +
      `extratags=1&` +
      `namedetails=1&` +
      `class=leisure&` +
      `type=golf_course`;
    
    const nominatimResponse = await fetch(nominatimUrl, {
      headers: { 
        'User-Agent': 'AI-Caddie-Pro/1.0 (https://github.com/your-repo)',
        'Accept': 'application/json'
      }
    });
    
    if (!nominatimResponse.ok) {
      throw new Error(`Nominatim search failed: ${nominatimResponse.statusText}`);
    }
    
    const nominatimData = await nominatimResponse.json();
    
    if (nominatimData.length === 0) {
      console.log('No results from Nominatim, falling back to Overpass direct search...');
      return await fallbackOverpassSearch(courseName, maxResults);
    }
    
    // Step 2: Process Nominatim results and format for our system
    console.log(`Found ${nominatimData.length} raw Nominatim results`);
    
    const courses = nominatimData
      .filter((result: any) => result.osm_type && result.osm_id)
      .slice(0, maxResults)
      .map((result: any) => {
        console.log(`Processing: ${result.display_name.split(',')[0]} (${result.osm_type}:${result.osm_id})`);
        
        // Generate the proper ID format for Overpass API
        let courseId;
        if (result.osm_type === 'relation') {
          const areaId = parseInt(result.osm_id) + 3600000000;
          courseId = areaId.toString();
        } else if (result.osm_type === 'way') {
          const areaId = parseInt(result.osm_id) + 2400000000;
          courseId = areaId.toString();
        } else {
          // Skip nodes as they're not suitable for area queries
          console.log(`Skipping ${result.osm_type} (not suitable for area queries)`);
          return null;
        }
        
        return {
          id: courseId,
          name: result.display_name.split(',')[0], // First part is usually the course name
          city: result.address?.city || result.address?.town || result.address?.village || '',
          state: result.address?.state || '',
          country: result.address?.country || '',
          type: result.osm_type,
          center: { lat: parseFloat(result.lat), lon: parseFloat(result.lon) },
          display_name: result.display_name
        };
      })
      .filter((course: any) => course !== null); // Remove null entries
    
    console.log(`Found ${courses.length} golf courses via Nominatim`);
    return courses;
    
  } catch (error) {
    console.error('Nominatim search failed, falling back to Overpass:', error);
    return await fallbackOverpassSearch(courseName, maxResults);
  }
}

async function fallbackOverpassSearch(courseName: string, maxResults = 10): Promise<SearchCourse[]> {
  // Improved query with better timeout and more specific search
  const searchQuery = `[out:json][timeout:15];
    (
      relation["golf"="course"]["name"~"${courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",i];
      way["golf"="course"]["name"~"${courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",i];
    );
    out center meta;`;
  
  try {
    console.log(`Overpass fallback search for: ${courseName}`);
    
    const response = await fetch("https://overpass.kumi.systems/api/interpreter", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "AI-Caddie-Pro/1.0"
      },
      body: "data=" + encodeURIComponent(searchQuery)
    });
    
    if (!response.ok) {
      throw new Error(`Overpass search failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Overpass found ${data.elements?.length || 0} elements`);
    
    if (!data.elements || data.elements.length === 0) {
      return [];
    }
    
    // Process results with correct area ID conversion
    const courses = data.elements
      .filter((element: any) => element.tags && element.tags.name)
      .slice(0, maxResults)
      .map((element: any) => {
        let courseId;
        if (element.type === 'relation') {
          courseId = (parseInt(element.id) + 3600000000).toString();
        } else if (element.type === 'way') {
          courseId = (parseInt(element.id) + 2400000000).toString();
        } else {
          return null;
        }
        
        // Try to get location info from tags
        const city = element.tags['addr:city'] || element.tags.city || '';
        const state = element.tags['addr:state'] || element.tags.state || '';
        const country = element.tags['addr:country'] || element.tags.country || '';
        
        return {
          id: courseId,
          name: element.tags.name,
          city: city,
          state: state,
          country: country,
          type: element.type,
          center: element.center || (element.lat && element.lon ? {lat: element.lat, lon: element.lon} : { lat: 0, lon: 0 }),
          display_name: `${element.tags.name}${city ? `, ${city}` : ''}${state ? `, ${state}` : ''}${country ? `, ${country}` : ''}`
        };
      })
      .filter((course: any) => course !== null);
    
    console.log(`Processed ${courses.length} courses from Overpass`);
    return courses;
  } catch (error) {
    console.error('Fallback Overpass search failed:', error);
    return [];
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve static files from public directory
  app.use(express.static(path.resolve(import.meta.dirname, "..", "public")));

  // Golf course routes
  app.get("/api/courses", async (req, res) => {
    try {
      const courses = await storage.getCourses();
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch courses" });
    }
  });

  app.get("/api/courses/curated", async (req, res) => {
    try {
      let near;
      if (req.query.near) {
        const [lat, lon] = String(req.query.near).split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lon)) {
          near = { lat, lon };
        }
      }
      const courses = await storage.getCuratedCourses(near);
      res.json(courses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch curated courses" });
    }
  });

  app.get("/api/courses/search", async (req, res) => {
    try {
      const { q: courseName, limit = "10" } = req.query;
      
      if (!courseName || typeof courseName !== 'string') {
        return res.status(400).json({ message: "Course name query parameter 'q' is required" });
      }

      const maxResults = Math.min(parseInt(limit as string) || 10, 20);
      const courses = await searchCoursesByName(courseName, maxResults);
      res.json(courses);
    } catch (error: any) {
      console.error("Course search error:", error);
      res.status(500).json({ message: "Failed to search courses", error: error.message });
    }
  });

  app.get("/api/courses/:id", async (req, res) => {
    try {
      const course = await storage.getCourseById(req.params.id);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }
      res.json(course);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch course" });
    }
  });

  app.get("/api/courses/:courseId/holes", async (req, res) => {
    try {
      const holes = await storage.getHolesByCourseId(req.params.courseId);
      res.json(holes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch holes" });
    }
  });

  app.get("/api/holes/:id", async (req, res) => {
    try {
      const hole = await storage.getHoleById(req.params.id);
      if (!hole) {
        return res.status(404).json({ message: "Hole not found" });
      }
      res.json(hole);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch hole" });
    }
  });

  // User polygon routes
  app.get("/api/holes/:holeId/polygons", async (req, res) => {
    try {
      const polygons = await storage.getUserPolygons(req.params.holeId);
      res.json(polygons);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch polygons" });
    }
  });

  app.post("/api/holes/:holeId/polygons", async (req, res) => {
    try {
      const validation = insertUserPolygonSchema.extend({
        holeId: z.string(),
      }).safeParse({ ...req.body, holeId: req.params.holeId });

      if (!validation.success) {
        return res.status(400).json({ message: "Invalid polygon data", errors: validation.error.errors });
      }

      const polygon = await storage.createUserPolygon(validation.data);
      res.status(201).json(polygon);
    } catch (error) {
      res.status(500).json({ message: "Failed to create polygon" });
    }
  });

  // Course import from OSM
  app.post("/api/courses/import-osm", async (req, res) => {
    try {
      console.log("=== Import request received ===");
      console.log("Request body:", JSON.stringify(req.body, null, 2));

      const { seeds } = z.object({ seeds: z.array(z.string()).min(1) }).parse(req.body);

      // Import whichever export exists
      const mod = await import("@shared/overpass");
      const importer = (mod as any).overpassImporter ?? (mod as any).overpassAPI;
      if (!importer?.importCourse) throw new Error("Overpass importer not found");

      const result = await importer.importCourse(seeds);
      res.json(result);
    } catch (error: any) {
      console.error("=== OSM import error ===", error);
      const code = error?.code || "IMPORT_FAILED";
      const message = error?.message || "Failed to import course from OSM";
      const debug = error?.debug || { stack: error?.stack };
      res.status(code === "NO_HOLE_WAYS" ? 404 : 500).json({ code, message, debug });
    }
  });

  // Compat alias so the client can call /api/import-osm
  app.post("/api/import-osm", (req, res, next) => {
    (req as any).url = "/api/courses/import-osm";
    (app as any)._router.handle(req, res, next);
  });

  // Placeholder routes for future Supabase Edge functions
  app.post("/api/overpass/fetch", async (req, res) => {
    // TODO: Implement Overpass API integration
    res.status(501).json({ message: "Overpass fetch not yet implemented" });
  });

  app.post("/api/features/merge", async (req, res) => {
    // TODO: Implement feature merging
    res.status(501).json({ message: "Feature merging not yet implemented" });
  });

  app.post("/api/masks/bake", async (req, res) => {
    // TODO: Implement mask baking
    res.status(501).json({ message: "Mask baking not yet implemented" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
