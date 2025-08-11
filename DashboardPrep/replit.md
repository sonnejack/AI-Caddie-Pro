# Golf Analytics Pro

## Overview

Golf Analytics Pro is a professional-grade golf course analysis and shot optimization platform. The application combines 3D visualization with advanced mathematical models to provide golfers with data-driven insights for course strategy and shot selection.

The system features a comprehensive "Prepare" tab that allows users to load golf courses, navigate holes, set up shots with start/aim/pin positions, analyze dispersion patterns based on skill level, and optimize aim points using Expected Strokes calculations. The platform leverages real course data enhanced with crowd-sourced improvements and provides tools for drawing course conditions like greens, fairways, bunkers, and hazards.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Framework**: Tailwind CSS with shadcn/ui components for consistent, modern interface
- **State Management**: Custom React hooks with typed event dispatch system for prepare tab functionality
- **3D Visualization**: Cesium.js integration for terrain rendering and course visualization
- **Query Management**: TanStack Query for efficient data fetching and caching

### Backend Architecture
- **Runtime**: Node.js with Express.js REST API
- **Language**: TypeScript throughout the entire stack for type safety
- **Database ORM**: Drizzle ORM with PostgreSQL as the primary database
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple
- **API Design**: RESTful endpoints with typed request/response schemas using Zod validation

### Data Storage Solutions
- **Primary Database**: PostgreSQL with spatial data support (PostGIS geometry types)
- **Schema Design**: Normalized structure with courses, holes, OSM features, and user-generated polygons
- **Spatial Data**: Course boundaries stored as bounding boxes, hole geometries as PostGIS geometry types
- **Migration System**: Drizzle Kit for database schema migrations and type-safe database operations

### Core Mathematical Engine
- **Expected Strokes Engine**: Proprietary black-box calculation engine for shot outcome prediction
- **Dispersion Modeling**: Uniform ellipse sampling based on skill presets (distance percentage and offline angle)
- **Optimization Algorithm**: Cross-Entropy Method (CEM) implementation for aim point optimization
- **Statistical Analysis**: Progressive statistics with confidence intervals for shot dispersion analysis

### Specialized Components
- **Course Data Integration**: OpenStreetMap (OSM) integration via Overpass API with crowd-sourced enhancements
- **Sampling System**: Halton sequence quasi-random sampling for efficient dispersion pattern generation
- **Web Workers**: Dedicated workers for Expected Strokes calculations and aim optimization to maintain UI responsiveness
- **Real-time Updates**: Event-driven state management for live updates across prepare tab components

### Authentication and Authorization
- **Session-based Authentication**: Server-side session management with PostgreSQL storage
- **User Management**: Basic user system with support for user-generated course condition polygons
- **Data Access Control**: Course and hole data access patterns with user-specific polygon associations

## External Dependencies

### Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting via @neondatabase/serverless
- **PostGIS**: Spatial database extension for geographic data types and operations

### Mapping and Visualization
- **Cesium.js**: 3D globe and map visualization engine for course terrain rendering
- **Google 3D Tiles**: Optional photorealistic 3D imagery integration
- **OpenStreetMap**: Course feature data via Overpass API queries
- **Nominatim**: Geocoding service for course search functionality

### UI and Styling
- **Radix UI**: Comprehensive primitive component library (@radix-ui/react-*)
- **Tailwind CSS**: Utility-first CSS framework with custom golf-specific color palette
- **Lucide Icons**: Icon library with Font Awesome as supplementary icon source
- **shadcn/ui**: Pre-built component system built on Radix primitives

### Development and Build Tools
- **Vite**: Fast build tool and development server with React plugin
- **TypeScript**: Static type checking across entire application
- **ESBuild**: Fast JavaScript bundler for production builds
- **Replit Integration**: Development environment plugins for Replit platform support

### Mathematical and Data Processing
- **Drizzle ORM**: Type-safe database ORM with Zod schema integration
- **Date-fns**: Date manipulation library for temporal data handling
- **React Hook Form**: Form handling with @hookform/resolvers for validation
- **Class Variance Authority**: Utility for component variant management