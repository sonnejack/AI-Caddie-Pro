-- Migration: Auto-Save User-Edited Rasters
-- Creates tables and policies for vector-first course enhancement storage
-- Run this migration in your Supabase SQL editor or via CLI

-- Step 1: Add new fields to existing courses table
ALTER TABLE courses 
  ADD COLUMN IF NOT EXISTS latest_raster_version_id UUID NULL,
  ADD COLUMN IF NOT EXISTS osm_seeds JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS base_features JSONB NULL;

-- Step 2: Create course_user_polygons table
CREATE TABLE IF NOT EXISTS course_user_polygons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  condition TEXT NOT NULL CHECK (condition IN ('green','fairway','tee','bunker','water','hazard','ob','recovery','rough')),
  geom JSONB NOT NULL, -- GeoJSON Polygon/MultiPolygon
  created_by UUID NOT NULL, -- References auth.users(id)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

-- Step 3: Create course_raster_versions table  
CREATE TABLE IF NOT EXISTS course_raster_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  bin_url TEXT NOT NULL, -- storage path to mask.bin (private)
  png_url TEXT NULL, -- storage path to mask.png (optional preview)
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bbox JSONB NOT NULL, -- {west,south,east,north}
  class_map_version INTEGER NOT NULL,
  smoothing_version INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  created_by UUID NOT NULL, -- References auth.users(id)
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_user_polygons_course_id ON course_user_polygons(course_id);
CREATE INDEX IF NOT EXISTS idx_course_user_polygons_created_by ON course_user_polygons(created_by);
CREATE INDEX IF NOT EXISTS idx_course_raster_versions_course_id ON course_raster_versions(course_id);
CREATE INDEX IF NOT EXISTS idx_course_raster_versions_status ON course_raster_versions(status);
CREATE INDEX IF NOT EXISTS idx_course_raster_versions_checksum ON course_raster_versions(checksum);
CREATE INDEX IF NOT EXISTS idx_courses_osm_seeds ON courses USING GIN (osm_seeds);

-- Step 5: Create foreign key constraint for latest_raster_version_id
ALTER TABLE courses 
  ADD CONSTRAINT fk_courses_latest_raster_version 
  FOREIGN KEY (latest_raster_version_id) 
  REFERENCES course_raster_versions(id) 
  ON DELETE SET NULL;

-- Step 6: Create storage bucket for course rasters (if not exists)
-- Note: This needs to be run in Supabase dashboard or via API, not SQL
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('course-rasters', 'course-rasters', false);

-- Step 7: Enable RLS on new tables
ALTER TABLE course_user_polygons ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_raster_versions ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies

-- Course User Polygons: Users can only manage their own polygons
CREATE POLICY "Users can view their own polygons" ON course_user_polygons
  FOR SELECT USING (created_by::text = auth.uid()::text);

CREATE POLICY "Users can insert their own polygons" ON course_user_polygons
  FOR INSERT WITH CHECK (created_by::text = auth.uid()::text);

CREATE POLICY "Users can update their own polygons" ON course_user_polygons
  FOR UPDATE USING (created_by::text = auth.uid()::text);

CREATE POLICY "Users can delete their own polygons" ON course_user_polygons
  FOR DELETE USING (created_by::text = auth.uid()::text);

-- Course Raster Versions: Users can create drafts, everyone can view published
CREATE POLICY "Users can create draft raster versions" ON course_raster_versions
  FOR INSERT WITH CHECK (
    created_by::text = auth.uid()::text 
    AND status = 'draft'
  );

CREATE POLICY "Users can view their own raster versions" ON course_raster_versions
  FOR SELECT USING (created_by::text = auth.uid()::text);

CREATE POLICY "Public can view published raster versions" ON course_raster_versions
  FOR SELECT USING (status = 'published');

-- Note: Admin publishing policies should be added based on your admin role implementation

-- Step 9: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON course_user_polygons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_raster_versions TO authenticated;
GRANT SELECT ON courses TO authenticated;
GRANT UPDATE ON courses TO authenticated; -- For updating latest_raster_version_id

-- Step 10: Create helper functions

-- Function to get enhanced courses (courses with published raster versions)
CREATE OR REPLACE FUNCTION get_enhanced_curated_courses(near_lat FLOAT DEFAULT NULL, near_lon FLOAT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  name TEXT,
  location TEXT,
  bbox JSONB,
  quality_score NUMERIC,
  enhanced BOOLEAN,
  latest_raster_version_id UUID,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.location,
    c.bbox,
    c.quality_score,
    c.enhanced,
    c.latest_raster_version_id,
    c.thumbnail_url,
    c.created_at
  FROM courses c
  WHERE c.enhanced = true
    AND EXISTS (
      SELECT 1 FROM course_raster_versions crv 
      WHERE crv.course_id = c.id AND crv.status = 'published'
    )
  ORDER BY 
    CASE 
      WHEN near_lat IS NOT NULL AND near_lon IS NOT NULL THEN
        -- Simple distance calculation (for more accuracy, use PostGIS)
        ABS((c.bbox->>'west')::FLOAT - near_lon) + ABS((c.bbox->>'south')::FLOAT - near_lat)
      ELSE 0
    END,
    c.quality_score::FLOAT DESC;
END;
$$;

-- Grant execute permission on helper function
GRANT EXECUTE ON FUNCTION get_enhanced_curated_courses TO authenticated;
GRANT EXECUTE ON FUNCTION get_enhanced_curated_courses TO anon;

COMMENT ON MIGRATION IS 'Auto-Save User-Edited Rasters: Vector-first architecture for course enhancements with versioned raster caching, proper RLS policies, and performance indexes.';

-- Migration complete!
-- Next steps:
-- 1. Create 'course-rasters' storage bucket in Supabase dashboard
-- 2. Configure storage policies for bucket access
-- 3. Update your application to use new API endpoints
-- 4. Test polygon saving and raster version creation