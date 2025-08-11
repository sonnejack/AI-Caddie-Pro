import { type Course, type InsertCourse, type Hole, type InsertHole, type UserPolygon, type InsertUserPolygon, type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods (keep existing)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Course methods
  getCourses(): Promise<Course[]>;
  getCourseById(id: string): Promise<Course | undefined>;
  createCourse(course: InsertCourse): Promise<Course>;
  getCuratedCourses(near?: { lat: number; lon: number }): Promise<Course[]>;
  
  // Hole methods
  getHolesByCourseId(courseId: string): Promise<Hole[]>;
  getHoleById(id: string): Promise<Hole | undefined>;
  createHole(hole: InsertHole): Promise<Hole>;
  
  // User polygon methods
  getUserPolygons(holeId: string): Promise<UserPolygon[]>;
  createUserPolygon(polygon: InsertUserPolygon): Promise<UserPolygon>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private courses: Map<string, Course>;
  private holes: Map<string, Hole>;
  private userPolygons: Map<string, UserPolygon>;

  constructor() {
    this.users = new Map();
    this.courses = new Map();
    this.holes = new Map();
    this.userPolygons = new Map();
    
    // Initialize with sample golf courses
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Sample courses
    const pebbleBeach: Course = {
      id: "pebble-beach-1",
      name: "Pebble Beach Golf Links",
      location: "Pebble Beach, CA",
      bbox: { west: -121.95, south: 36.56, east: -121.93, north: 36.58 },
      qualityScore: "9.8",
      status: "active",
      synonyms: ["Pebble Beach", "PBGL"],
      enhanced: true,
      thumbnailUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200",
      createdAt: new Date(),
    };

    const stAndrews: Course = {
      id: "st-andrews-old-1",
      name: "St. Andrews Old Course",
      location: "St. Andrews, Scotland",
      bbox: { west: -2.84, south: 56.34, east: -2.80, north: 56.36 },
      qualityScore: "9.9",
      status: "active",
      synonyms: ["St. Andrews", "Old Course"],
      enhanced: true,
      thumbnailUrl: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200",
      createdAt: new Date(),
    };

    const augusta: Course = {
      id: "augusta-national-1",
      name: "Augusta National Golf Club",
      location: "Augusta, GA",
      bbox: { west: -82.03, south: 33.50, east: -82.01, north: 33.52 },
      qualityScore: "9.7",
      status: "active",
      synonyms: ["Augusta National", "Augusta"],
      enhanced: true,
      thumbnailUrl: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200",
      createdAt: new Date(),
    };

    this.courses.set(pebbleBeach.id, pebbleBeach);
    this.courses.set(stAndrews.id, stAndrews);
    this.courses.set(augusta.id, augusta);

    // Sample holes for St. Andrews (current selection)
    for (let i = 1; i <= 18; i++) {
      const hole: Hole = {
        id: `st-andrews-hole-${i}`,
        courseId: stAndrews.id,
        number: i,
        par: i <= 6 ? 4 : i <= 12 ? (i % 2 === 0 ? 3 : 4) : (i % 2 === 0 ? 5 : 4),
        yards: 300 + Math.floor(Math.random() * 200) + (i > 12 ? 100 : 0),
        handicap: ((i - 1) % 18) + 1,
        viewBookmarks: {
          teeView: { lat: 56.348 + (i * 0.001), lon: -2.82 + (i * 0.001), alt: 50 },
          greenView: { lat: 56.349 + (i * 0.001), lon: -2.819 + (i * 0.001), alt: 30 },
          overview: { lat: 56.3485 + (i * 0.001), lon: -2.8195 + (i * 0.001), alt: 200 }
        },
        teePoints: null,
        greenPolygon: null,
      };
      this.holes.set(hole.id, hole);
    }
  }

  // User methods (existing)
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Course methods
  async getCourses(): Promise<Course[]> {
    return Array.from(this.courses.values());
  }

  async getCourseById(id: string): Promise<Course | undefined> {
    return this.courses.get(id);
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    const id = randomUUID();
    const newCourse: Course = { 
      ...course, 
      id, 
      createdAt: new Date(),
      bbox: course.bbox || null,
      status: course.status || 'active',
      location: course.location || null,
      qualityScore: course.qualityScore || null,
      synonyms: course.synonyms || null,
      enhanced: course.enhanced || false,
      thumbnailUrl: course.thumbnailUrl || null
    };
    this.courses.set(id, newCourse);
    return newCourse;
  }

  async getCuratedCourses(near?: { lat: number; lon: number }): Promise<Course[]> {
    const courses = Array.from(this.courses.values()).filter(c => c.enhanced);
    // Simple distance-based sorting if near is provided
    if (near) {
      return courses.sort((a, b) => {
        const aDist = Math.abs((a.bbox as any)?.west - near.lon) + Math.abs((a.bbox as any)?.south - near.lat);
        const bDist = Math.abs((b.bbox as any)?.west - near.lon) + Math.abs((b.bbox as any)?.south - near.lat);
        return aDist - bDist;
      });
    }
    return courses.sort((a, b) => parseFloat(b.qualityScore || "0") - parseFloat(a.qualityScore || "0"));
  }

  // Hole methods
  async getHolesByCourseId(courseId: string): Promise<Hole[]> {
    return Array.from(this.holes.values())
      .filter(h => h.courseId === courseId)
      .sort((a, b) => a.number - b.number);
  }

  async getHoleById(id: string): Promise<Hole | undefined> {
    return this.holes.get(id);
  }

  async createHole(hole: InsertHole): Promise<Hole> {
    const id = randomUUID();
    const newHole: Hole = { 
      ...hole, 
      id,
      yards: hole.yards || null,
      handicap: hole.handicap || null,
      viewBookmarks: hole.viewBookmarks || null,
      teePoints: hole.teePoints || null,
      greenPolygon: hole.greenPolygon || null
    };
    this.holes.set(id, newHole);
    return newHole;
  }

  // User polygon methods
  async getUserPolygons(holeId: string): Promise<UserPolygon[]> {
    return Array.from(this.userPolygons.values()).filter(p => p.holeId === holeId);
  }

  async createUserPolygon(polygon: InsertUserPolygon): Promise<UserPolygon> {
    const id = randomUUID();
    const newPolygon: UserPolygon = { 
      ...polygon, 
      id, 
      createdAt: new Date(),
      status: polygon.status || 'active',
      holeId: polygon.holeId || null,
      geom: polygon.geom || null,
      authorId: polygon.authorId || null,
      notes: polygon.notes || null
    };
    this.userPolygons.set(id, newPolygon);
    return newPolygon;
  }
}

export const storage = new MemStorage();
