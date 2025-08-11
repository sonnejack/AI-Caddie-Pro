# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

The application is built with a full-stack TypeScript architecture using Vite and Express. All commands should be run from the `DashboardPrep/` directory:

- `npm run dev` - Start development server with hot reloading (both frontend and backend)
- `npm run build` - Build for production (client + server bundle)
- `npm start` - Run production build
- `npm run check` - TypeScript type checking
- `npm run db:push` - Push database schema changes using Drizzle Kit

The project uses a single package.json with a full-stack setup where the server runs on the same port as the Vite dev server in development mode.

## Architecture Overview

This is a professional golf course analysis and shot optimization platform with the following key architectural components:

### Database Architecture
- **PostgreSQL with PostGIS** for spatial data via Neon Database
- **Drizzle ORM** with type-safe schema in `shared/schema.ts`
- Core tables: `courses`, `holes`, `osm_features`, `user_polygons`, `merged_features`, `hole_masks`
- Spatial geometry data stored as PostGIS geometry types for course boundaries and hole features

### Frontend Architecture (React/TypeScript)
- **Client root**: `client/src/` with Vite build system
- **State Management**: Event-driven prepare tab state via `hooks/usePrepareState.ts`
- **3D Visualization**: Cesium.js integration in `components/prepare/CesiumCanvas.tsx`
- **UI Framework**: shadcn/ui components built on Radix primitives in `components/ui/`
- **Query Management**: TanStack Query in `lib/queryClient.ts`

### Backend Architecture (Express/TypeScript)
- **Server root**: `server/` with Express.js REST API
- **Route registration**: `server/routes.ts` handles all API endpoints
- **Session-based auth**: PostgreSQL session storage with Passport.js
- **Database operations**: Drizzle ORM with Zod validation schemas

### Mathematical Engine
- **Expected Strokes**: Proprietary calculation engine in `lib/expectedStrokes.ts` and `shared/expected-strokes.js`
- **Optimization**: Cross-Entropy Method implementation in `workers/optimizerWorker.ts`
- **Sampling**: Halton sequence quasi-random sampling in `lib/sampling.ts`
- **Dispersion modeling**: Skill-based uniform ellipse sampling for shot outcome prediction

### Key Data Flow Patterns
1. **Course Data**: OpenStreetMap integration with crowd-sourced enhancements stored in `osm_features` and `user_polygons` tables
2. **Prepare Tab State**: Centralized event dispatch system handling course loading, hole navigation, point setting, and optimization
3. **Worker Threads**: Heavy computations (Expected Strokes, optimization) run in dedicated workers to maintain UI responsiveness
4. **Spatial Queries**: PostGIS geometry operations for course boundary calculations and feature intersections

### Path Aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*`

## Development Notes

- The project uses a monorepo structure with shared types and schemas between client and server
- Database migrations are handled through Drizzle Kit with schema definitions in `shared/schema.ts`
- All spatial data uses PostGIS geometry types for efficient geographic calculations
- Web workers are used extensively for mathematical computations to prevent UI blocking
- The prepare tab is the main feature area with complex state management for golf shot analysis
- Cesium.js provides 3D terrain visualization with optional Google Photorealistic 3D Tiles integration


