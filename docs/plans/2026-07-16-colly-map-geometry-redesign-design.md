# COLLY map geometry redesign

## Goal

Replace the five frame-led COLLY experiments with five polished map-led variations. The globe must remain fully visible and circular. Visual differentiation must come from the geography itself: coastline curvature, country-boundary treatment, land and ocean depth, labels, graticules, and museum data marks.

## Corrected interpretation

“Round the map” means smoothing the angular turns in land polygons and country boundaries while retaining recognizable geography. It does not mean clipping the canvas into rounded rectangles, superellipses, glass panels, or editorial cutouts.

All custom frame paths, frame borders, frame shadows, and frame hit-testing will be removed from the COLLY variants. The shared globe projection and interaction model remain unchanged.

## Geometry and rendering architecture

The existing D3 orthographic globe remains the only map engine. TopoJSON land, border mesh, and country features are prepared once at load time in three renderable forms:

- original geometry for geographic hit-testing;
- balanced rounded geometry for most variants;
- soft rounded geometry for variants that intentionally emphasize flowing coastlines.

Chaikin subdivision provides the rounded geometry. The number of passes stays conservative so coastlines remain recognizable. Canvas strokes use round joins and caps. Hit-testing continues to use the original feature geometry, so visual smoothing cannot make selection inaccurate.

Each COLLY profile selects render tokens rather than a frame:

- geometry softness;
- ocean treatment;
- land fill and directional light;
- coastline and internal-border color, width, dash, and glow;
- graticule density and opacity;
- country-label threshold and scale;
- museum-marker shape, size, and emphasis.

## Five design systems

### 1. Soft Contour — `redesign-existing-projects`

The closest evolution of the current product. Graphite ocean, softly modeled slate land, a stronger rounded coastline, and restrained internal borders. Museum marks use a clear three-level hierarchy. This is the calmest and most broadly usable candidate.

Signature: a pale outer coastline laid over quieter internal borders, making the world readable without a bright sphere rim.

### 2. Signal Cartography — `frontend-design`

A contemporary cultural-signal map. Deep blue-green ocean, blue-gray land, fine cyan boundary signals, sparse dotted graticules, and museum points that vary strongly with collection size.

Signature: primary museum marks emit a short concentric pulse while minor locations remain quiet pinpricks.

### 3. Night Relief — `high-end-visual-design`

A cinematic museum-night globe. Near-black mineral ocean, charcoal relief, champagne coastlines, dim oxblood internal borders, and selective luminous data points. No yellow sphere outline is used.

Signature: layered coastline light with a very soft ambient bloom, confined to the geography.

### 4. Ink Atlas — `design-taste-frontend`

An editorial cartographic plate translated to a dark interface. Desaturated ink-blue ocean, parchment-gray land, dark rounded borders, fewer labels, and vermilion museum notations. The map remains a full globe rather than a cropped print frame.

Signature: paired coastline strokes that resemble ink spreading slightly into paper fibers.

### 5. Legible Boundaries — `ui-ux-pro-max`

A clarity-first map. Cool mineral ocean, high-separation land, explicit country borders, larger labels, and accessible orange markers. Border hierarchy remains visible at multiple zoom levels and touch targets remain unchanged.

Signature: a subtle light under-stroke below dark country borders, improving separation without harsh outlines.

## Page composition

The five routes and the shared globe interaction remain. Page-level layouts may retain distinct typography and control arrangements, but all decorative enclosures around the map stage are removed. The map should visually sit in open space and remain the dominant element.

The variant switcher names change to the five map-design names above. Region controls keep generous targets and receive palette-specific active states without card-like wrappers around the globe.

## Interaction and data

Drag, wheel/pinch zoom, continent filtering, country drill-down, city selection, museum selection, and exhibition opening remain shared. Existing proximity-based city visibility in the main workspace is preserved.

Collection size determines marker emphasis through the existing museum data. Label density is profile-driven. No fabricated map or museum data is introduced.

## Responsive behavior

At desktop widths the globe is large and unobstructed. At tablet and mobile widths the statement and controls compact before the map loses usable area. The full globe remains visible; no variant clips it into a decorative shape. Region and variant controls remain at least 44px in either dimension where practical, with no horizontal page overflow.

## Verification

- Contract tests confirm five routes, five map profiles, and the absence of COLLY frame techniques.
- Geometry tests confirm balanced and soft smoothing preserve closed rings and do not mutate source data.
- A production build confirms the shared map compiles.
- Browser checks cover five variants at phone, tablet, laptop, and desktop widths.
- Each variant is checked for drag, zoom, region selection, and visible geographic rendering.
- Screenshots are reviewed to confirm that all five globes are fully visible and that their map treatments are materially distinct.
