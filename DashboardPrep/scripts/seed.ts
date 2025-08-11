import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { courses, holes, holeMasks } from "../shared/schema.js";

// Load environment variables
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const connection = postgres(process.env.DATABASE_URL);
const db = drizzle(connection);

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Upsert St Andrews course
    const [course] = await db
      .insert(courses)
      .values({
        id: "standrews-old",
        name: "St Andrews (Old Course)",
        location: "St Andrews, Scotland",
        bbox: {
          west: -2.8275,
          south: 56.3330,
          east: -2.7805,
          north: 56.3505
        },
        qualityScore: "9.50",
        enhanced: true,
        thumbnailUrl: "/thumbnails/standrews.jpg"
      })
      .onConflictDoUpdate({
        target: courses.id,
        set: {
          name: "St Andrews (Old Course)",
          location: "St Andrews, Scotland",
          bbox: {
            west: -2.8275,
            south: 56.3330,
            east: -2.7805,
            north: 56.3505
          },
          qualityScore: "9.50",
          enhanced: true,
          thumbnailUrl: "/thumbnails/standrews.jpg"
        }
      })
      .returning();

    console.log("✅ Course created:", course);

    // Upsert Hole 1
    const [hole] = await db
      .insert(holes)
      .values({
        id: "standrews-hole-1",
        courseId: "standrews-old",
        number: 1,
        par: 4,
        yards: 376,
        handicap: 10,
        viewBookmarks: {
          tee: { lon: -2.82, lat: 56.348, height: 50 },
          green: { lon: -2.8185, lat: 56.3495, height: 30 },
          overview: { lon: -2.8192, lat: 56.3487, height: 400 }
        }
      })
      .onConflictDoUpdate({
        target: holes.id,
        set: {
          courseId: "standrews-old",
          number: 1,
          par: 4,
          yards: 376,
          handicap: 10,
          viewBookmarks: {
            tee: { lon: -2.82, lat: 56.348, height: 50 },
            green: { lon: -2.8185, lat: 56.3495, height: 30 },
            overview: { lon: -2.8192, lat: 56.3487, height: 400 }
          }
        }
      })
      .returning();

    console.log("✅ Hole created:", hole);

    // Upsert hole mask
    const [mask] = await db
      .insert(holeMasks)
      .values({
        holeId: "standrews-hole-1",
        palettePngUrl: "/masks/standrews_h01.png",
        slopePngUrl: null,
        width: 1024,
        height: 1024,
        bbox: {
          west: -2.8275,
          south: 56.3330,
          east: -2.7805,
          north: 56.3505
        },
        paletteVersion: 1
      })
      .onConflictDoUpdate({
        target: holeMasks.holeId,
        set: {
          palettePngUrl: "/masks/standrews_h01.png",
          width: 1024,
          height: 1024,
          bbox: {
            west: -2.8275,
            south: 56.3330,
            east: -2.7805,
            north: 56.3505
          },
          paletteVersion: 1
        }
      })
      .returning();

    console.log("✅ Hole mask created:", mask);

    console.log("🎉 Seeding completed successfully!");

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

seed();