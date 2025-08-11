CREATE TABLE "courses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"bbox" jsonb,
	"quality_score" numeric(3, 2),
	"status" text DEFAULT 'active',
	"synonyms" jsonb,
	"enhanced" boolean DEFAULT false,
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hole_masks" (
	"hole_id" varchar PRIMARY KEY NOT NULL,
	"palette_png_url" text,
	"slope_png_url" text,
	"width" integer,
	"height" integer,
	"bbox" jsonb,
	"palette_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "holes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"number" integer NOT NULL,
	"par" integer NOT NULL,
	"yards" integer,
	"handicap" integer,
	"view_bookmarks" jsonb,
	"tee_points" geometry(point),
	"green_polygon" geometry(point)
);
--> statement-breakpoint
CREATE TABLE "merged_features" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"hole_id" varchar,
	"ftype" text NOT NULL,
	"geom" geometry(point),
	"version" integer DEFAULT 1,
	"built_from" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "osm_features" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"hole_id" varchar,
	"ftype" text NOT NULL,
	"geom" geometry(point),
	"source" text DEFAULT 'overpass',
	"version" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "user_polygons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar NOT NULL,
	"hole_id" varchar,
	"ftype" text NOT NULL,
	"geom" geometry(point),
	"author_id" varchar,
	"status" text DEFAULT 'active',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "hole_masks" ADD CONSTRAINT "hole_masks_hole_id_holes_id_fk" FOREIGN KEY ("hole_id") REFERENCES "public"."holes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holes" ADD CONSTRAINT "holes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merged_features" ADD CONSTRAINT "merged_features_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merged_features" ADD CONSTRAINT "merged_features_hole_id_holes_id_fk" FOREIGN KEY ("hole_id") REFERENCES "public"."holes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "osm_features" ADD CONSTRAINT "osm_features_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "osm_features" ADD CONSTRAINT "osm_features_hole_id_holes_id_fk" FOREIGN KEY ("hole_id") REFERENCES "public"."holes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_polygons" ADD CONSTRAINT "user_polygons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_polygons" ADD CONSTRAINT "user_polygons_hole_id_holes_id_fk" FOREIGN KEY ("hole_id") REFERENCES "public"."holes"("id") ON DELETE no action ON UPDATE no action;