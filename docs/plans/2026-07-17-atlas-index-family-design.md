# Atlas Index Family Design

## Goal

Replace the mixed five-study COLLY set with one coherent Atlas Index family: retain the approved Atlas Index, refine its clutter and vertical markers, add five structurally distinct editorial cartography variations, and visibly round country geography across all six studies.

## Approved interpretation

- Keep Atlas Index as the anchor study.
- Add five more studies for six total.
- Remove Armin Refined, Cultural Routes, Relief Layers, and Museum Territories.
- Preserve the original Armin page shell, near-black palette, gold accent, orthographic globe, production museum data, and all current interactions.
- Let the family progress from the denser original toward more controlled and selective annotation systems.

## Design read

This is a redesign-preserve task for a design-conscious museum audience. The visual language is editorial cartography: mono typography, real geographic indexes, restrained gold anchors, and asymmetrical annotation. It uses the existing Canvas and CSS system rather than adding a third-party design system.

- `DESIGN_VARIANCE: 7`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 7`, reducing across the six-study sequence

The page remains dark throughout. The original Armin gold is the only accent. Containers stay sharp and frameless; the geographic polygons themselves become visibly softer.

## Shared geography system

The current Chaikin pass still reads as angular at country zoom. Replace it with an adaptive corner-rounding pass for polygon rings and shared border lines.

The rounding algorithm will:

1. unwrap adjacent longitude coordinates across the antimeridian;
2. calculate an entry and exit point around each corner from adjacent segment lengths;
3. sample a quadratic curve through the original vertex;
4. clamp rounding on short segments and small islands;
5. close polygon rings without mutating source data;
6. use the same softness setting for land, country hover fills, and border geometry.

Original unsmoothed TopoJSON features remain authoritative for hit testing. Rounded geometry is render-only, so selecting countries remains accurate.

## Shared Atlas rules

- No page-level map frame, card, aperture, or clip mask.
- No palette changes between studies.
- No long vertical gold bars.
- Gold anchors use a compact dot and short horizontal tick or ring.
- At country zoom, local annotations take priority over lines that cross the entire map.
- Desktop labels remain outside the globe only when they can stay close to its edge.
- Mobile reduces annotation count and keeps text inside the canvas.
- Existing drag, zoom, continent, country, city, hover, pointer, and keyboard behavior remains intact.

## Six studies

### 1. Atlas Index

The approved original, revised. Two-sided country labels remain, but their vertical range is compressed and leaders are capped. The tall gold density bar becomes a compact dot with a short horizontal tick. At country zoom, it switches to shorter local callouts.

### 2. Margin Ledger

Countries are sorted into stable left and right ledger columns. Leaders use one restrained elbow and terminate at aligned rows. Counts sit in a separate narrow numeric column, creating a cleaner reading order than Atlas Index.

### 3. Radial Register

Country annotations are placed around the globe circumference according to bearing. Short radial ticks connect each label to its country centroid. Collision handling operates by angular sectors rather than vertical columns.

### 4. Country Folio

Country boundaries receive data-weighted strokes. Only the highest-value visible countries receive callouts. Each callout combines country name, museum count, and a small horizontal density rule beside the centroid.

### 5. Coordinate Index

The six strongest visible countries receive compact coordinate labels. Each annotation includes a country code, latitude/longitude, and museum count. Leaders remain local, producing the sparsest country-based version.

### 6. City Gazetteer

The aggregation changes from countries to real museum cities. Top visible cities receive short catalog labels and compact rank markers. No fake locations or generated metrics are introduced.

## Continent controls

All six controls belong to one editorial family, but layout reflects the active annotation system:

- Atlas Index: two-row indexed grid.
- Margin Ledger: left-aligned tabular ledger.
- Radial Register: centered bearing-like rail.
- Country Folio: compact measured strip with data-weight emphasis.
- Coordinate Index: abbreviated coordinate-style keys.
- City Gazetteer: city-directory tabs with restrained counts.

Controls keep 44px mobile targets, visible focus states, readable labels, and no surrounding card.

## Data and architecture

One shared Atlas data module remains the source of truth for country and city aggregates. New pure helpers derive margin rows, radial placements, ranked folio candidates, coordinate annotations, and city aggregates. Renderers consume those structures and draw within the existing Canvas pipeline.

Each renderer is isolated behind the existing technique renderer map. A renderer exception restores the production museum markers instead of blanking the map. No interaction or hit-testing code is duplicated.

## Testing

Unit tests will verify:

- exactly six Atlas-family variants and no retired names or techniques;
- deterministic country and city aggregation;
- compact anchor dimensions and capped leader reach;
- radial placement remains within canvas bounds;
- mobile annotation limits;
- adaptive rounding closes rings, preserves source input, handles antimeridian points, and curves square corners;
- renderer fallback behavior.

Browser QA will cover all six studies at desktop and mobile sizes. It will verify no frames, no horizontal overflow, minimum touch targets, functioning drag and continent selection, visibly distinct grayscale structures, and successful country zoom.

## Success criteria

1. Atlas Index no longer uses long vertical gold marks or excessive leader reach.
2. Country coastlines and borders visibly read as rounded at the screenshot zoom level.
3. The switcher contains Atlas Index plus five new Atlas-family studies only.
4. The six maps differ through real layout and aggregation logic, not color.
5. Original Armin palette, page shell, data, and interactions remain intact.
6. Focused tests, production build, and desktop/mobile browser QA pass.
