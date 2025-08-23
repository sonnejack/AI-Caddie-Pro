-- RLS Policies for AI Caddie Pro Database
-- These policies ensure proper access control for course editing and raster management

-- Enable RLS on new tables
ALTER TABLE course_user_polygons ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_raster_versions ENABLE ROW LEVEL SECURITY;

-- Course User Polygons Policies
-- Users can only read/write their own polygons
CREATE POLICY "Users can view their own polygons" ON course_user_polygons
  FOR SELECT 
  USING (created_by = auth.uid()::text);

CREATE POLICY "Users can insert their own polygons" ON course_user_polygons
  FOR INSERT 
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "Users can update their own polygons" ON course_user_polygons
  FOR UPDATE 
  USING (created_by = auth.uid()::text)
  WITH CHECK (created_by = auth.uid()::text);

CREATE POLICY "Users can delete their own polygons" ON course_user_polygons
  FOR DELETE 
  USING (created_by = auth.uid()::text);

-- Allow anonymous/public read access for published polygon data (optional)
-- Uncomment if you want public visibility of enhanced courses
-- CREATE POLICY "Public can view published polygons" ON course_user_polygons
--   FOR SELECT 
--   USING (true);

-- Course Raster Versions Policies
-- Users can create draft raster versions
CREATE POLICY "Users can create draft raster versions" ON course_raster_versions
  FOR INSERT 
  WITH CHECK (
    created_by = auth.uid()::text 
    AND status = 'draft'
  );

-- Users can view their own raster versions
CREATE POLICY "Users can view their own raster versions" ON course_raster_versions
  FOR SELECT 
  USING (created_by = auth.uid()::text);

-- Everyone can view published raster versions (for curated tab)
CREATE POLICY "Public can view published raster versions" ON course_raster_versions
  FOR SELECT 
  USING (status = 'published');

-- Only admins can publish raster versions
-- Note: You'll need to create an admin role or check in your application logic
-- CREATE POLICY "Admins can publish raster versions" ON course_raster_versions
--   FOR UPDATE 
--   USING (
--     auth.jwt() ->> 'role' = 'admin'
--     AND status = 'draft'
--   )
--   WITH CHECK (status = 'published');

-- Storage Bucket Policies
-- Create policies for the course-rasters bucket

-- Allow authenticated users to upload their own rasters
INSERT INTO storage.policies (id, bucket_id, name, definition, check_definition)
VALUES (
  'course-rasters-auth-insert',
  'course-rasters',
  'Authenticated users can upload course rasters',
  '(role() = ''authenticated''::"text")',
  '(role() = ''authenticated''::"text")'
);

-- Allow users to read raster files they created
INSERT INTO storage.policies (id, bucket_id, name, definition)
VALUES (
  'course-rasters-own-select',
  'course-rasters',
  'Users can download their own raster files',
  '(role() = ''authenticated''::"text" AND (storage.foldername(name))[1] = auth.uid()::text)'
);

-- Allow public read access to published raster files
-- This enables serving enhanced course rasters to all users
INSERT INTO storage.policies (id, bucket_id, name, definition)
VALUES (
  'course-rasters-public-select',
  'course-rasters',
  'Public can download published raster files',
  'true' -- Note: In production, you'd want to check if the raster version is published
);

-- Grant storage permissions
GRANT SELECT ON storage.objects TO authenticated;
GRANT INSERT ON storage.objects TO authenticated;
GRANT UPDATE ON storage.objects TO authenticated;
GRANT DELETE ON storage.objects TO authenticated;

-- Additional security considerations:
-- 1. Consider adding rate limiting for raster uploads
-- 2. Add file size limits in storage bucket settings
-- 3. Validate file types (only allow .bin and .png files)
-- 4. Add audit logging for raster version publishing
-- 5. Implement admin role checking for publish operations

-- Example admin role function (optional)
-- CREATE OR REPLACE FUNCTION is_admin()
-- RETURNS BOOLEAN AS $$
-- BEGIN
--   RETURN auth.jwt() ->> 'role' = 'admin';
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Usage in policies:
-- CREATE POLICY "Admins can publish raster versions" ON course_raster_versions
--   FOR UPDATE 
--   USING (is_admin() AND status = 'draft')
--   WITH CHECK (status = 'published');