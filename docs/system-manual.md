# System Manual

## 1. System Overview

This project is a monorepo with:

- `apps/web`: React/Vite frontend
- `apps/api`: Express + Prisma backend
- PostgreSQL database managed through Prisma

The application supports:

- Public project browsing
- Fullscreen map and project detail flows
- Admin inventory management for developers, projects, buildings, floors, units, amenities, facilities, leads, site visits, and bookings

## 2. Runtime Architecture

### 2.1 Frontend flow

`apps/web/src/main.jsx` mounts the React app from `apps/web/src/App.jsx`.

`apps/web/src/App.jsx` is the central coordinator for:

- Authentication state
- Public page state
- Admin page state
- Project selection
- Floor / unit / map interactions

It calls backend helper functions from `apps/web/src/api.js`.

### 2.2 Backend flow

`apps/api/src/server.js` starts the Express server.

`apps/api/src/app.js` wires:

- CORS
- JSON parsing
- Logging
- Static uploads
- Route mounting
- Error handling

Route modules live under `apps/api/src/routes/`.

### 2.3 Database flow

The backend uses Prisma with the schema in:

- `apps/api/prisma/schema.prisma`

Migrations are stored in:

- `apps/api/prisma/migrations/`

## 3. File Linkage Map

### 3.1 Frontend entry and orchestration

| File | Role | Connects to |
|---|---|---|
| `apps/web/src/main.jsx` | React entry point | `App.jsx` |
| `apps/web/src/App.jsx` | Main UI coordinator | `api.js`, all major components |
| `apps/web/src/api.js` | Fetch wrapper and API client | `apps/api/src/app.js` and route modules |
| `apps/web/src/styles.css` | Global styling | All frontend components |

### 3.2 Frontend components

| File | Role | Notes |
|---|---|---|
| `apps/web/src/components/PublicProjectExplorerV2.jsx` | Public homepage explorer | Builder/project/building selection and video showcase |
| `apps/web/src/components/PublicProjectLearnMoreV2.jsx` | Public project detail page | Floor, unit, gallery, and media browsing |
| `apps/web/src/components/ProjectDetailV2.jsx` | Project detail view | Map and nested project structure display |
| `apps/web/src/components/ProjectAdminEditorV2.jsx` | Admin project editor | Project metadata, gallery, cover image, 3D model upload |
| `apps/web/src/components/StructureManagerV2.jsx` | Buildings/floors/units manager | Build nested inventory tree and edit forms |
| `apps/web/src/components/AmenityManagerV2.jsx` | Amenity management | Create, edit, delete, assign amenities |
| `apps/web/src/components/FacilityManagerV2.jsx` | Facility management | Create, edit, delete, assign POIs/facilities |
| `apps/web/src/components/MapStoreStaticMap.jsx` | Map rendering | Map pins, routes, zoom, map style |
| `apps/web/src/components/MapStoreLocationPicker.jsx` | Admin coordinate picker | Optional coordinate selection helper |
| `apps/web/src/components/Project3DViewer.jsx` | 3D model preview | Displays project `.glb` / `.gltf` model |

### 3.3 Backend routes

| File | Role | Main endpoints |
|---|---|---|
| `apps/api/src/routes/auth.js` | Login and session identity | `/auth/login`, `/auth/me` |
| `apps/api/src/routes/users.js` | Admin user management | `/users`, `/users/:id/password` |
| `apps/api/src/routes/developers.js` | Developer CRUD | `/developers` |
| `apps/api/src/routes/projects.js` | Project CRUD | `/projects`, `/projects/public`, `/projects/:id` |
| `apps/api/src/routes/structure.js` | Buildings, floors, units, nearby destinations | `/projects/:projectId/structure`, `/buildings`, `/floors`, `/units`, `/nearby-destinations` |
| `apps/api/src/routes/facilities.js` | Facility CRUD | `/facilities` |
| `apps/api/src/routes/amenities.js` | Amenity CRUD | `/amenities` |
| `apps/api/src/routes/leads.js` | Leads, site visits, bookings | `/leads`, `/leads/site-visits`, `/leads/bookings` |
| `apps/api/src/routes/health.js` | Health check | `/health` |

### 3.4 Backend service files

| File | Role |
|---|---|
| `apps/api/src/lib/prisma.js` | Prisma client instance |
| `apps/api/src/lib/jwt.js` | JWT signing/verification helpers |
| `apps/api/src/lib/roles.js` | Role/permission helpers |
| `apps/api/src/lib/slug.js` | Project slug generation |
| `apps/api/src/lib/geo.js` | Distance calculations and route metadata |
| `apps/api/src/middleware/auth.js` | Auth middleware and role checks |

## 4. Request Flow Summary

### 4.1 Public browsing

1. Browser loads `App.jsx`.
2. `App.jsx` calls `listPublicProjects()` from `api.js`.
3. Backend serves public projects from `projectsRouter` and `listProjectsHandler`.
4. User selects a project in the explorer.
5. `App.jsx` loads the selected project detail and map data.
6. Project media, floors, units, amenities, and POIs are shown through the detail components.

### 4.2 Admin editing

1. Admin signs in through `authRouter`.
2. `App.jsx` stores the token and loads admin reference data.
3. CRUD calls go through `api.js`.
4. Backend route modules validate the payload with Zod.
5. Prisma writes to PostgreSQL.
6. `App.jsx` refreshes the selected project and list views.

### 4.3 Structure editing

1. The admin selects a project.
2. `StructureManagerV2.jsx` renders buildings, floors, and units.
3. Create/update/delete actions call handlers in `App.jsx`.
4. Those handlers call backend route functions in `api.js`.
5. The structure route stores the data in the `Building`, `Floor`, and `Unit` tables.

## 5. Database Tables

### 5.1 Identity and security

- `User`: application users and login identity.
- `Role`: role definitions such as admin/system administrator/developer.
- `Permission`: individual permissions.
- `RolePermission`: role-to-permission join table.
- `User`: login accounts and password hash.

### 5.2 Master data

- `Developer`: developer profile and owner user.
- `Project`: top-level project record.
- `Facility`: points of interest, airports, hospitals, etc.
- `Amenity`: in-project amenities such as gym, pool, park, etc.

### 5.3 Property structure

- `Building`: building under a project.
- `Floor`: floor under a building and project.
- `Unit`: unit under a floor, building, and project.

### 5.4 Lead and sales workflow

- `Lead`: inquiry record from public or admin flows.
- `SiteVisit`: visit request or scheduled site visit.
- `Booking`: reservation / booking tied to a lead, project, and optional unit.

### 5.5 Location and assignment tables

- `NearbyDestination`: project-level POI with distance and travel time.
- `ProjectFacility`: join table linking a project to a facility.
- `ProjectAmenity`: join table linking a project to an amenity.

## 6. Schema Notes

Important serialized fields:

- `Project.gallery` is JSON
- `Project.coverImage` is a single image URL or data URL
- `Project.model3dUrl` stores a 3D model link
- `Floor.floorPlan` stores the floor image
- `Unit.layoutPlan` stores the unit layout image
- `Unit.media` stores unit gallery media
- `Unit.amenities` stores unit amenity tags

Location and measurement fields use decimal values in the database and are serialized to strings for the frontend.

## 7. Environment Variables

Common environment values used by the project:

- `DATABASE_URL`
- `VITE_API_BASE_URL`
- `VITE_MAPSTORE_API_URL`

## 8. Admin User Management

- `apps/web/src/App.jsx` contains the admin sidebar forms for:
  - creating users
  - resetting passwords
- `apps/web/src/api.js` exposes:
  - `listUsers`
  - `createUser`
  - `resetUserPassword`
- `apps/api/src/routes/users.js` handles the matching backend operations.

## 9. External Integrations

- PostgreSQL stores application data.
- MapStore provides map display and map-based coordinate picking.
- 3D model preview uses `@google/model-viewer` on the frontend.

## 10. Maintenance Notes

- Generated Prisma client files under `apps/api/src/generated/` are build outputs and should not be edited manually.
- Database changes should be made in `apps/api/prisma/schema.prisma` and then applied with migrations.
- Frontend API changes should flow through `apps/web/src/api.js` first, then into `App.jsx` and the relevant component.
