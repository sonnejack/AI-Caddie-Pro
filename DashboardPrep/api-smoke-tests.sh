#!/bin/bash

# API Smoke Tests for Auto-Save Raster Implementation
# Run this script to verify the API endpoints are working correctly

BASE_URL="http://localhost:3000"
COURSE_ID="test-course-123"
USER_TOKEN="your-user-jwt-token"
ADMIN_TOKEN="your-admin-jwt-token"

echo "🧪 Starting API smoke tests..."

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/api/health" | jq '.' || echo "❌ Health check failed"
echo ""

# Test 2: Add a polygon (requires auth)
echo "2. Testing polygon creation..."
POLYGON_RESULT=$(curl -s -X POST "$BASE_URL/api/courses/$COURSE_ID/polygons" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "polygons": [{
      "condition": "bunker",
      "geom": {
        "type": "Polygon",
        "coordinates": [[
          [-84.1, 39.1],
          [-84.1, 39.11], 
          [-84.09, 39.11],
          [-84.09, 39.1],
          [-84.1, 39.1]
        ]]
      },
      "createdBy": "test-user",
      "version": 1
    }],
    "userId": "test-user"
  }')

if [[ $POLYGON_RESULT == *"successfully"* ]]; then
  echo "✅ Polygon creation succeeded"
else
  echo "❌ Polygon creation failed: $POLYGON_RESULT"
fi
echo ""

# Test 3: Trigger raster rebake
echo "3. Testing raster rebaking..."
REBAKE_RESULT=$(curl -s -X POST "$BASE_URL/api/courses/$COURSE_ID/raster/rebake" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "baseFeatures": {
      "greens": {"type": "FeatureCollection", "features": []},
      "fairways": {"type": "FeatureCollection", "features": []}, 
      "bunkers": {"type": "FeatureCollection", "features": []},
      "water": {"type": "FeatureCollection", "features": []},
      "tees": {"type": "FeatureCollection", "features": []}
    },
    "userPolygons": [{
      "condition": "bunker",
      "coordinates": [
        {"lat": 39.1, "lon": -84.1},
        {"lat": 39.11, "lon": -84.1},
        {"lat": 39.11, "lon": -84.09},
        {"lat": 39.1, "lon": -84.09}
      ]
    }],
    "bbox": {"west": -84.1, "south": 39.1, "east": -84.09, "north": 39.11},
    "courseName": "Test Course"
  }')

VERSION_ID=$(echo $REBAKE_RESULT | jq -r '.versionId' 2>/dev/null)
if [[ $VERSION_ID != "null" && $VERSION_ID != "" ]]; then
  echo "✅ Raster rebaking succeeded, version: $VERSION_ID"
else
  echo "❌ Raster rebaking failed: $REBAKE_RESULT"
fi
echo ""

# Test 4: Get latest raster version
echo "4. Testing latest raster version fetch..."
LATEST_RESULT=$(curl -s "$BASE_URL/api/courses/$COURSE_ID/raster/latest")
if [[ $LATEST_RESULT == *"not found"* ]]; then
  echo "ℹ️ No published raster version found (expected for new course)"
else
  echo "✅ Latest raster version: $LATEST_RESULT"
fi
echo ""

# Test 5: Publish raster version (if we got one)
if [[ $VERSION_ID != "null" && $VERSION_ID != "" ]]; then
  echo "5. Testing raster version publishing..."
  PUBLISH_RESULT=$(curl -s -X POST "$BASE_URL/api/courses/$COURSE_ID/raster/publish" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"versionId\": \"$VERSION_ID\", \"adminId\": \"test-admin\"}")
  
  if [[ $PUBLISH_RESULT == *"successfully"* ]]; then
    echo "✅ Raster version publishing succeeded"
  else
    echo "❌ Raster version publishing failed: $PUBLISH_RESULT"
  fi
else
  echo "5. Skipping publish test (no version ID)"
fi
echo ""

# Test 6: Enhanced curated courses 
echo "6. Testing enhanced curated courses..."
CURATED_RESULT=$(curl -s "$BASE_URL/api/courses/curated/enhanced")
ENHANCED_COUNT=$(echo $CURATED_RESULT | jq '. | length' 2>/dev/null || echo "0")
echo "✅ Found $ENHANCED_COUNT enhanced curated courses"
echo ""

# Test 7: Get polygons for course
echo "7. Testing polygon retrieval..."
POLYGONS_RESULT=$(curl -s "$BASE_URL/api/courses/$COURSE_ID/polygons" \
  -H "Authorization: Bearer $USER_TOKEN")
POLYGON_COUNT=$(echo $POLYGONS_RESULT | jq '. | length' 2>/dev/null || echo "0")
echo "✅ Found $POLYGON_COUNT polygons for course"
echo ""

echo "🏁 Smoke tests completed!"
echo ""
echo "Next steps:"
echo "1. Set USER_TOKEN and ADMIN_TOKEN variables with actual JWT tokens"
echo "2. Run against your actual server: BASE_URL=https://your-domain.com ./api-smoke-tests.sh"
echo "3. Check server logs for detailed baking information"
echo "4. Verify that enhanced courses appear in the curated tab UI"