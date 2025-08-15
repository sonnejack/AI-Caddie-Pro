# Golf Analytics Pro - Repository Status

## High-Level Summary

The Prepare workflow currently provides end-to-end course analysis: users can select curated courses, import OSM data to generate 3D vector overlays and raster masks, navigate between holes with proper tee/green endpoint detection, and run dispersion analysis with colored sample visualization. The system includes camera automation, real-time terrain height sampling, elevation-aware "plays like" distance calculations, and ES (Expected Strokes) evaluation with live sample classification counts. All data is processed in-memory (no persistence), and the app runs as a single full-stack application combining React/Cesium frontend with Express backend.

## Architecture Map

### Server/API
- **server/index.ts**: Express server entry point with session middleware, port 8080
- **server/routes.ts**: API endpoints for courses, holes, user polygons, and `/api/courses/import-osm`
- **server/storage.ts**: In-memory storage layer (courses, holes, user polygons)
- **server/vite.ts**: Vite dev server integration for development mode

Import endpoint `/api/courses/import-osm` accepts `{seeds: string[]}` and returns `ImportResponse` with course bbox, hole polylines, and categorized feature collections.

### OSM/Overpass Import
- **shared/overpass.ts**: `OverpassImporter` class fetches course data from OSM relations
- Categorizes features: greens (polygons), fairways (polygons), bunkers (golf=bunker + surface=sand), water (natural=water + golf hazards), tees (nodes/polygons)
- Returns hole polylines with ref numbers, par, and distance when available
- Used by: server routes, dashboard course loading

### Raster/Mask
- **client/src/lib/maskPainter.ts**: `createMaskFromFeatures()` converts GeoJSON to canvas raster
- **client/src/lib/maskBuffer.ts**: Bbox expansion, aspect ratio preservation, class mapping utilities
- **client/src/lib/rasterOverlay.ts**: Cesium terrain overlay rendering with depth settings
- Class mapping: 0=unknown, 2=water, 4=bunker, 5=green, 6=fairway, 7=recovery, 8=rough, 9=tee
- 4096x512 max resolution with aspect ratio preservation, imageSmoothing disabled

### Vector Feature Layers
- **client/src/components/prepare/VectorFeatureLayers.ts**: `showVectorFeatures()` renders GeoJSON as Cesium entities
- **client/src/components/prepare/VectorLayerPanel.tsx**: UI toggles for polylines, greens, fairways, bunkers, water, hazards, OB
- Used by: CesiumCanvas for 3D feature visualization

### Cesium Canvas
- **client/src/components/prepare/CesiumCanvas.tsx**: Main 3D viewer with camera controls, overlays, sample rendering
- Camera functions: `flyTeeView()`, `flyFairwayView()`, `flyGreenView()` with proper endpoint-based bearings
- Integrates SamplesLayer, VectorFeatureLayers, raster overlays, point elevation system
- 0.35s animation duration, heading/pitch calculations based on hole geometry

### Hole Navigation
- **client/src/components/prepare/HoleNavigator.tsx**: Hole selection, camera view buttons, auto-navigation
- **client/src/lib/holeGeom.ts**: `assignEndpoints()` determines tee/green from polyline proximity, geodesic calculations, bearing math
- Custom camera formula: `hole_offset = (holeLen ** 0.87) * 0.7 + 50`, positioned behind tee with proper heading
- Used by: dashboard for hole switching, camera positioning

### Sampling/Dispersion
- **client/src/components/prepare/SamplesLayer.ts**: Point primitive collection for sample visualization
- **client/src/lib/sampling.ts**: `generateEllipseSamples()` for uniform ellipse sampling
- **client/src/prepare/lib/ellipse.ts**: Ellipse geometry and sampling algorithms
- 1200 default capacity, async height refinement with +0.05m lift, color-coded by class
- Used by: DispersionInspector, ES workers

### Expected Strokes
- **shared/expected-strokes.js**: `ExpectedStrokesEngine` with PGA Tour polynomial regression
- **shared/expectedStrokesAdapter.ts**: TypeScript adapter for ES calculations
- **client/src/workers/esWorker.ts**: Web worker for Monte Carlo ES evaluation
- Supports fairway, rough, bunker, water, green conditions with distance-based calculations
- Used by: DispersionInspector, ShotMetrics, MetricsBar

### Height Providers
- **client/src/lib/heightProvider.ts**: `CesiumHeightProvider` with sync/async terrain sampling
- **client/src/lib/pointElevation.ts**: Point elevation system with validation and subscriptions
- Batch terrain sampling via `sampleTerrainMostDetailed()`, elevation-aware distance calculations
- Used by: SamplesLayer, MetricsBar, navigation systems

### UI Panels
- **client/src/components/prepare/MetricsBar.tsx**: Shot metrics with real ES result integration, condition breakdown percentages
- **client/src/components/prepare/ShotMetrics.tsx**: ES results display, proximity calculations, class counts
- **client/src/components/prepare/AimPanel.tsx**: Point placement controls, skill presets
- **client/src/components/prepare/DispersionInspector.tsx**: ES worker integration, sample generation

## Current Behavior

### Course Import Path
1. User selects curated course from `public/curated.json`
2. `/api/courses/import-osm` called with OSM relation seeds
3. `OverpassImporter.importCourse()` fetches relation data, extracts hole ways, categorizes features
4. Returns `ImportResponse`: course (id, name, bbox), holes (ref, polyline positions), features (greens, fairways, bunkers, water, tees as GeoJSON FeatureCollections)
5. Client creates mask via `createMaskFromFeatures()`, stores hole polylines by ref Map

### Hole Navigation
1. Click hole number → `handleHoleNavigation()` with custom camera formula
2. Finds polyline by ref, runs `assignEndpoints()` to determine tee/green from proximity
3. Sets start/aim/pin points, flies camera behind tee with `hole_offset` calculation
4. Camera views (Tee/Fairway/Green buttons) use same endpoints for consistent bearings
5. Animation: 0.5s duration, heading from tee→green, pitch based on hole length

### Dispersion Samples
1. Generated via `generateEllipseSamples()` with uniform distribution inside ellipse
2. 1200 sample capacity, initially placed at ground level + 0.05m
3. Async batch refinement via `CesiumHeightProvider.sampleHeightsAsync()`
4. Colored by class ID: 6=limegreen (fairway), 5=lightgreen (green), 2=cornflowerblue (water), etc.
5. Real-time classification via mask pixel sampling

### Raster Overlay
1. Built from GeoJSON features via canvas painting: fairway→green→bunker→water→tee order
2. 4096x512 max resolution, bbox expanded by 0.01°, aspect ratio preserved
3. Rendered as Cesium ImageryLayer with imageSmoothing disabled
4. Depth testing disabled to prevent terrain occlusion
5. Toggle modes: off, fill (0.8 opacity), edges (1.0 opacity)

### What's Not Wired
- Optimizer panel (CEM algorithm) - UI exists but worker not implemented
- Google Photorealistic 3D Tiles - toggle exists but integration not complete
- User polygon drawing - storage routes exist but UI not connected
- Slope arrows around greens - planned but not implemented
- Course persistence - all data is in-memory only

## Raster Class Map

```javascript
// Class ID → Color/Condition mapping (as implemented)
0: UNKNOWN/ROUGH → olive (treated as rough in ES calculations)
1: OB → whitesmoke (+2 strokes penalty in ES)
2: WATER → cornflowerblue (+1 stroke penalty)
3: HAZARD → tomato (+1 stroke penalty)
4: BUNKER → peachpuff (+0.5 strokes penalty)
5: GREEN → lightgreen (putting calculations)
6: FAIRWAY → limegreen (baseline condition)
7: RECOVERY → plum (+0.25 strokes penalty)
8: ROUGH → olive (+0.25 strokes penalty)
9: TEE → powderblue (treated as fairway)
```

Paint order (later overwrites earlier): fairway → green → bunker → water → tee
Special rules: hazard=rough+1, OB=rough+2, water/bunker based on ES engine polynomials

## Developer How-To

### Run/Dev
```bash
npm run dev    # Development server (frontend + backend) → localhost:8080
npm run build  # Production build (client + server bundle)
npm start      # Run production build
npm run check  # TypeScript type checking
npm run db:push # Push database schema (Drizzle Kit)
```

### Environment
- Google Photorealistic 3D Tiles API key: Set `VITE_CESIUM_ION_ACCESS_TOKEN` (partially wired)
- Development runs on port 8080, production respects `PORT` env var
- No other external API keys required for current functionality

### Testing a Course
1. Start dev server: `npm run dev`
2. Navigate to localhost:8080
3. Click "Select Course" → choose "St Andrews Links" or other curated course
4. Wait for import progress (OSM fetch → feature processing → mask creation)
5. Navigate holes using grid or Prev/Next buttons
6. Click "Tee/Fairway/Green" camera views to test navigation
7. Run dispersion analysis in right panel to see colored samples
8. Verify landing conditions show real percentages/counts from samples

## Immediate TODOs (P0)

### ☐ Implement optimizer (CEM) replacing ring grid
**Files**: `client/src/workers/optimizerWorker.ts` (exists but not implemented), hook from `OptimizerPanel.tsx`
Use progressive Monte Carlo ES with CI early-stop; use raster classes + expected-strokes for evaluation; use baked elevation (when available) for plays-like; return top K candidates with min spatial separation.

### ☐ Implement Google Photorealistic 3D Tiles  
**Files**: Add API key plumbing to `CesiumCanvas.tsx`, create UI toggle in `VectorLayerPanel.tsx`
Load tileset in CesiumCanvas.tsx; ensure depth ordering so vectors/samples remain visible over photorealistic terrain.

### ☐ Implement user polygons & conversion into mask
**Files**: Create drawing UI in new component, wire to existing storage routes in `server/routes.ts`
Drawing UI with classification palette, saving to storage; rasterization via `maskPainter.ts` path that aligns exactly with mask bbox/resolution; merge with OSM polygons.

### ☐ Implement course condition counts from sampled points
**Files**: Update `ShotMetrics.tsx` and `MetricsBar.tsx` to show detailed breakdowns
From each ES run, compute per-class counts/histograms and show in Shot Metrics (in-play vs. penalty classes separately). Currently shows basic counts but needs histogram visualization.

### ☐ Implement Expected Strokes (real engine)
**Files**: Verify `shared/expected-strokes.js` integration in `client/src/workers/esWorker.ts`
Ensure adapter is called for every sample; wire CI ± display in Shot Metrics; remove any simplified placeholders in favor of full polynomial calculations.

### ☐ Implement Advanced Short Game  
**Files**: Extend `expectedStrokesAdapter.ts`, add toggle in `AimPanel.tsx`
Within 45 yds: slope, green-available, up/downhill, toward/away modifiers; integrate in adapter and surface toggle in UI.

### ☐ Implement slope arrows around greens
**Files**: New component for arrow rendering, integrate into `CesiumCanvas.tsx`
Use prebaked elevation fine grid around greens; compute local gradient; render arrow glyphs with controllable density, magnitude scaling, and an on/off toggle.

## Near-Term (P1)

### ☐ Prebaked elevation grid (coarse + fine patches around greens)
**Files**: `client/src/lib/elevationBake.ts` (exists), worker integration
Aligned to raster bbox; bilinear sampling and feathering; worker transfer for large grids.

### ☐ Persist baked grids per hole (IndexedDB)  
Avoid re-bake on subsequent hole visits; cache management with size limits.

### ☐ Robust error messages for missing features
Handle no hole polylines, missing tees/greens gracefully; Overpass fallbacks for incomplete data.

## Open Issues / Known Gaps

### Console Warnings
- `ositogeojson` CJS/ESM import warnings in `shared/overpass.ts:3` - resolved with fallback pattern
- Missing terrain provider warnings when Cesium viewer initializes without Ion token
- Point elevation validation warnings when points change faster than async sampling

### Raster Alignment
- Mask bbox expansion by 0.01° may cause slight misalignment with very small courses
- Canvas painting order occasionally shows edge artifacts between adjacent polygons
- High-resolution masks (4096px) may cause memory pressure on lower-end devices

### Unhandled Promise Rejections
- Terrain sampling failures in `heightProvider.ts` are caught but not surfaced to UI
- ES worker termination edge cases when multiple calculations overlap

## API Shapes

### /api/courses/import-osm Response
```typescript
interface ImportResponse {
  course: { 
    id: string;           // "standrews-old-course"
    name: string;         // "St Andrews Old Course"
    bbox: { west: number; south: number; east: number; north: number }
  };
  holes: Array<{
    ref: string;          // "1", "2", ..., "18"
    polyline: { 
      positions: {lon: number; lat: number}[];
      par?: number;       // extracted from tags
      dist?: number;      // distance in yards if available
    };
  }>;
  features: {
    greens: GeoJSON.FeatureCollection;    // Polygon geometries only
    fairways: GeoJSON.FeatureCollection;  // Polygon geometries only  
    bunkers: GeoJSON.FeatureCollection;   // Polygon geometries only
    water: GeoJSON.FeatureCollection;     // Polygon geometries only
    tees: GeoJSON.FeatureCollection;      // Point/Polygon geometries
  };
}
```

### Internal Structures
```typescript
// SamplesLayer.setSamples()
setSamples(pointsLL: Float64Array, classes?: Uint8Array)

// ES Worker Message
{
  pointsLL: Float64Array,    // [lon0,lat0, lon1,lat1, ...]
  classes: Uint8Array,       // class per sample
  maskBuffer: MaskBuffer,    // raster data
  skill: SkillPreset        // dispersion parameters
}

// Camera Helper (CesiumCanvas)
hole: {
  polyline: { positions: {lon: number; lat: number}[] },
  teeLL: {lon: number; lat: number},     // from assignEndpoints()
  greenLL: {lon: number; lat: number},   // from assignEndpoints()
  primaryGreen: GeoJSON.Polygon|MultiPolygon
}
```

## Changelog (Recent)

### Course Navigation & Camera System
- ✅ Fixed hole polyline integration with real OSM data (vs. mock polylines)
- ✅ Implemented `assignEndpoints()` for proper tee/green detection from proximity
- ✅ Added custom camera positioning formula behind tee with offset calculation
- ✅ Fixed green view to show same green as pin location (not largest green)
- ✅ Resolved camera bearing alignment (~90° off) between view buttons and hole navigation

### Sample Visualization & Height  
- ✅ Fixed sample points appearing underground via async batch height refinement
- ✅ Implemented elevation subscription system for reactive UI updates
- ✅ Added real sample count percentages in landing conditions (vs. mock data)
- ✅ Updated color scheme to match SamplesLayer visualization

### Data Flow & Integration
- ✅ Integrated real ES result data into MetricsBar component
- ✅ Connected height provider system with point elevation validation
- ✅ Wired hole polylines from OSM import through to navigation system
- ✅ Added collapsible course picker with auto-collapse on selection

All core Prepare workflow functionality is now working end-to-end with real data.

## Session Update - 8/14/2025 5:30 PM

### Expected Strokes & Proximity Calculation Overhaul

**Major Changes Made:**
- ✅ **Fixed Ranking Points Display**: Converted from PointPrimitiveCollection to Entity system with `heightReference: CLAMP_TO_GROUND` for proper ground clamping
- ✅ **Overhauled Expected Strokes Calculation**: Replaced Monte Carlo convergence system with fixed 600-sample approach for consistent evaluation
- ✅ **Implemented Auto-Evaluation**: Added automatic ES calculation when start/aim/pin points change (300ms debounced) by resetting status to 'idle' on point changes
- ✅ **Enhanced Shot Metrics Display**: Updated proximity formatting (feet up to 100ft, then yards) and clarified Expected Strokes vs. proximity labels
- ✅ **Fixed Image Decoding Errors**: Added comprehensive error handling for PaletteMask class and canvas operations to prevent crashes from corrupted images
- ✅ **Switched to MaskBuffer Sampling**: Replaced URL-based PaletteMask with direct maskBuffer sampling using `sampleClassFromMask()` for client-side generated masks
- ✅ **Added Comprehensive Logging**: Detailed console output showing sample point coordinates, distances to pin, course conditions, and ES calculations for debugging

**Technical Implementation Details:**
- Removed Monte Carlo statistical convergence (minSamples, maxSamples, epsilon) in favor of fixed sample count
- Direct ES calculation in main thread instead of web worker for simpler debugging
- Auto-evaluation triggers on start/aim/pin coordinate changes with proper status management
- Enhanced proximity calculations with accurate distance-to-pin measurements for each sample point
- Condition mapping from class IDs (0-9) to readable names (fairway, rough, bunker, etc.)

**Known Issues Identified:**
- ⚠️ **Condition Counts**: Rough count appears inaccurate in sample breakdown
- ⚠️ **Ranking Points Not Visible**: Optimizer candidate points don't appear on Cesium viewer despite entity implementation
- ⚠️ **ES Calculation Accuracy**: Expected Strokes values seem slightly off, need polynomial verification
- ⚠️ **Vector Feature Processing**: CesiumCanvas unnecessarily recreates vector features on every render (performance issue)

**Files Modified:**
- `DispersionInspector.tsx`: Complete rewrite of ES evaluation system
- `ShotMetrics.tsx`: Enhanced proximity formatting and labeling
- `CandidateLayer.ts`: Entity-based ranking point system with ground clamping
- `mask.ts`: Robust error handling for image loading failures
- `rasterOverlay.ts`: Canvas validation and safe image encoding
- `maskPainter.ts`: Canvas dimension validation and error handling
- `CesiumCanvas.tsx`: Reduced console log noise from vector processing

**Next Priority Tasks:**
1. Debug and fix ranking point visibility in Cesium viewer
2. Verify Expected Strokes polynomial calculations for accuracy
3. Fix condition count accuracy in sample breakdown
4. Optimize vector feature processing to prevent unnecessary re-renders

## UI/UX Enhancement TODOs

### ☐ Enhanced About Page with Golf Insights
**Files**: Create/update about page component, find old about page for reference
- **Research & Content**: Look back at old about page, find good reads for about page content
- **Summarized Insights**: Present key golf insights with clear summaries, then show the math behind them
- **Expectation Numbers**: Include key statistics derived from polynomials:
  - 50/50 chance of making a putt on tour is ~8 ft (determine exact value from polynomial)
  - 50/50 chance of 3-putting on tour is ~60 ft
  - 50/50 chance of making birdie from fairway vs rough vs sand (calculate X, Y, Z values)
  - Explain why penalties are so devastating to scores
  - Explain why making bogey on hard holes isn't terrible (insights from Alex Huang)
- **Interactive Elements**: Display polynomial interactive plot (code exists in old files)
- **Visual Polish**: Make visuals prettier throughout

### ☐ Loading Experience Improvements  
**Files**: Create loading components, tips system
- **Loading Tips**: Bring over loading tips system from old implementation
- **Progress Indicators**: Enhanced loading states with educational content

### ☐ Theme & Accessibility
**Files**: Theme provider, CSS variable system, accessibility audit
- **Light/Dark Mode**: Add theme toggle with proper contrast ratios
- **Text Readability**: Confirm all text is readable in both themes
- **Accessibility**: Ensure proper contrast ratios and keyboard navigation

## Session Update - 8/15/2025 1:30 AM

### Outstanding Issues & Development Roadmap

**Existing Issues:**
- ⚠️ **Optimization Results Not Viewable**: Still unable to view ranked options from optimization process
- ⚠️ **Missing Grid Search Optimizer**: Need to implement grid search optimizer as alternative to CEM
- ⚠️ **Drawing Features Incomplete**: Need to implement drawing features and the re-rasterization pipeline
- ⚠️ **Advanced Features Missing**: Need to add advanced short game and slope arrow toggles for enhanced analysis

**User Experience Enhancements:**
- 📚 **Loading Experience**: Add helpful tips instead of the default loading message to educate users
- 📄 **Documentation Pages**: Add comprehensive about page and light/dark mode toggle
- 🎯 **Fundamentals Education**: Add fundamentals page covering basics of golf dispersion and shot analysis

**Technical Priorities:**
1. **Optimization System**: Debug ranked candidates display and implement grid search fallback
2. **Drawing Tools**: Complete polygon drawing UI with real-time rasterization
3. **Advanced Analysis**: Implement slope-aware calculations and green reading features
4. **Educational Content**: Create comprehensive learning resources for golf analytics