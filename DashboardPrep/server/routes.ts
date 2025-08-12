import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserPolygonSchema } from "@shared/schema";
import express from "express";
import path from "path";

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
