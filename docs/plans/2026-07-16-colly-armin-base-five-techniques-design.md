# COLLY Armin-base five map techniques

## Status

Approved on 2026-07-16.

## Design read

This is a preserve-mode redesign for design-conscious museum visitors. The original Armin globe is the product signature. Its dark neutral palette, gold museum accent, circular orthographic globe, exhibition data, and navigation behavior stay fixed. The five studies must differ through cartographic structure and interaction, not through new colors, decorative frames, or alternate page themes.

Design dials:

- DESIGN_VARIANCE: 8
- MOTION_INTENSITY: 4
- VISUAL_DENSITY: 5

## Shared foundation

All five studies use the production Armin map as their single source of truth:

- the production dark palette from `globeVisualPresets.ts`
- the existing orthographic projection and complete circular globe
- the existing 290-museum data and collection counts
- the existing drag, zoom, continent, country, city, hover, and keyboard behavior
- the existing page shell and route slugs

The studies may change only:

- the cartographic technique rendered inside the globe
- how the existing museum data is aggregated or related
- label composition and semantic zoom presentation
- the structure of the continent control at the top of the map

The studies must not introduce:

- per-study color palettes
- decorative map frames, clipping windows, or aperture shapes
- a colored sphere outline
- page-level theme changes
- fake geographic or museum data

## Chosen approach

The primary approach is data and geometry composition. Interaction changes support the cartographic idea but do not carry the visual distinction alone. Surface-only styling was rejected because it repeats the failure mode of the previous studies, where variants read as the same map with different colors and line effects.

## Five studies

### 1. Armin Refined

Skill: `redesign-existing-projects`

This is the closest evolution of the production globe. Country boundaries vary by real museum density, museum points use deterministic spatial clustering, and cluster glyphs separate major, secondary, and trace locations without changing the palette. The top continent control becomes a quiet single-line rail.

Signature: the original Armin globe with a clearer data hierarchy.

### 2. Cultural Routes

Skill: `frontend-design`

Major museum cities become network hubs. Great-circle routes connect hubs within the active region, revealing the cultural network already implied by the data. Routes are derived from existing coordinates and collection counts. Selecting a continent filters and recomposes the network without replacing the base globe.

Signature: museum points become a legible spherical connection system.

### 3. Relief Layers

Skill: `high-end-visual-design`

Land is rendered as a small stack of offset geographic silhouettes. The offset follows a consistent virtual light direction, creating shallow cartographic relief without a frame, alternate palette, or generic shadowed container. Focus transitions compress or expand the layer spacing to communicate zoom state.

Signature: the original Armin landmass feels physically engraved.

### 4. Atlas Index

Skill: `design-taste-frontend`

The overview replaces individual museum points with country aggregates. Labels sit around the globe edge and connect to country centroids with collision-aware leader lines. Selecting a country unfolds its aggregate into the real museum locations. The top continent control becomes a compact editorial index, with no section-number decoration.

Signature: a globe that reads like a live museum atlas index.

### 5. Museum Territories

Skill: `ui-ux-pro-max`

Visible museum locations create a projected Delaunay network. Hover, keyboard focus, or selection reveals the related Voronoi focus cell for one location. The layer stays clipped to the geographic sphere, not to a decorative frame. The top continent control uses an accessible two-row layout with 44-pixel minimum targets and explicit counts.

Signature: museum coverage becomes a spatial territory system.

## Architecture

The existing `Globe` canvas renderer remains authoritative. A single data-driven `mapTechnique` profile selects one of five technique layers. Every technique receives the same projection, production palette, geographic features, museum points, active region, zoom, and interaction state.

Shared production rendering executes first. Each study then adds one technique layer at the appropriate point in the render order:

1. sphere and production land
2. technique-specific geographic or data layer
3. production borders and labels as required by the technique
4. production interaction states and overlays

Country and city hit testing continues to use the original unsmoothed geographic features. Technique geometry is visual only.

## Data flow

Museum and geography data remain unchanged. Derived structures are deterministic and computed from existing data:

- Refined clusters use projected screen distance and collection weight.
- Cultural Routes uses real hub coordinates and great-circle interpolation.
- Relief Layers reuses the same land feature at several small screen offsets.
- Atlas Index aggregates museums by existing country keys and uses geographic centroids.
- Museum Territories uses visible projected museum coordinates for Delaunay and Voronoi geometry.

No network endpoint or persistent data model changes are required.

## Responsive behavior

Desktop preserves the current split page shell. The complete globe remains visible at all five routes. On viewports below 768 pixels:

- the page shell keeps its existing single-column behavior
- leader labels reduce to the highest-value non-colliding subset
- route and territory layers reduce their node count
- the two-row accessible control remains at least 44 pixels tall per target
- no technique may cause horizontal page overflow

## Accessibility and motion

Color is never the only differentiator. Line form, grouping, labels, glyph shape, and spatial structure communicate each study. Existing keyboard globe controls and focus behavior remain intact. Technique transitions use transform and opacity only and respect `prefers-reduced-motion`.

## Loading and failure behavior

If geography or derived technique data is unavailable, the renderer falls back to the production Armin globe. A technique failure must not blank the canvas or disable map interactions.

## Verification criteria

The redesign is complete only when:

- all five studies serialize to the same production Armin palette
- screenshots are structurally distinguishable when converted to grayscale
- no study exposes a frame, clip, aperture, or alternate palette contract
- the complete globe is visible on desktop and mobile
- drag changes canvas pixels on every route
- continent selection works on every route
- keyboard and pointer hit testing still target the original geography
- all continent controls meet 44-pixel touch targets on mobile
- 390, 768, 1024, and 1440 pixel layouts have no horizontal overflow
- focused tests and the production build pass

