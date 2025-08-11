import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, jsonb, boolean, timestamp, geometry } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location"),
  bbox: jsonb("bbox"),
  qualityScore: decimal("quality_score", { precision: 3, scale: 2 }),
  status: text("status").default("active"),
  synonyms: jsonb("synonyms"),
  enhanced: boolean("enhanced").default(false),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const holes = pgTable("holes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id).notNull(),
  number: integer("number").notNull(),
  par: integer("par").notNull(),
  yards: integer("yards"),
  handicap: integer("handicap"),
  viewBookmarks: jsonb("view_bookmarks"),
  teePoints: geometry("tee_points"),
  greenPolygon: geometry("green_polygon"),
});

export const osmFeatures = pgTable("osm_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id).notNull(),
  holeId: varchar("hole_id").references(() => holes.id),
  ftype: text("ftype").notNull(),
  geom: geometry("geom"),
  source: text("source").default("overpass"),
  version: integer("version").default(1),
});

export const userPolygons = pgTable("user_polygons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id).notNull(),
  holeId: varchar("hole_id").references(() => holes.id),
  ftype: text("ftype").notNull(),
  geom: geometry("geom"),
  authorId: varchar("author_id"),
  status: text("status").default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mergedFeatures = pgTable("merged_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id).notNull(),
  holeId: varchar("hole_id").references(() => holes.id),
  ftype: text("ftype").notNull(),
  geom: geometry("geom"),
  version: integer("version").default(1),
  builtFrom: jsonb("built_from"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const holeMasks = pgTable("hole_masks", {
  holeId: varchar("hole_id").primaryKey().references(() => holes.id),
  palettePngUrl: text("palette_png_url"),
  slopePngUrl: text("slope_png_url"),
  width: integer("width"),
  height: integer("height"),
  bbox: jsonb("bbox"),
  paletteVersion: integer("palette_version").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  createdAt: true,
});

export const insertHoleSchema = createInsertSchema(holes).omit({
  id: true,
});

export const insertUserPolygonSchema = createInsertSchema(userPolygons).omit({
  id: true,
  createdAt: true,
});

export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;
export type InsertHole = z.infer<typeof insertHoleSchema>;
export type Hole = typeof holes.$inferSelect;
export type InsertUserPolygon = z.infer<typeof insertUserPolygonSchema>;
export type UserPolygon = typeof userPolygons.$inferSelect;
export type OSMFeature = typeof osmFeatures.$inferSelect;
export type MergedFeature = typeof mergedFeatures.$inferSelect;
export type HoleMask = typeof holeMasks.$inferSelect;

// Remove existing user schema to focus on golf data
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
