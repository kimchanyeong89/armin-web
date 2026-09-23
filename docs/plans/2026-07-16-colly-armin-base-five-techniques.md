# COLLY Armin-base Five Map Techniques Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the five Globe Lab studies from the original production Armin globe so they differ through cartographic structure and data behavior, while sharing the same page shell, palette, real museum data, circular globe, and interactions.

**Architecture:** Keep `Globe.tsx` as the authoritative canvas and hit-testing renderer. Replace the previous visual-variant contract with a small `mapTechnique` contract, derive every extra mark deterministically from existing geography and museum data, and render each technique through shared underlay/overlay hooks. The page shell and route slugs remain fixed; only the map internals and continent-control composition vary.

**Tech Stack:** React, TypeScript, D3 v7, Canvas 2D, Vitest, Playwright, CSS

---

## Shared success criteria

- All five studies use the production Armin near-black, gray, white, and gold palette.
- No study has a decorative frame, aperture, clipped card, colored globe outline, or alternate page theme.
- Every visible geographic or museum-derived element comes from the existing data.
- The five studies remain clearly different in grayscale.
- Drag, zoom, continent, country, city, hover, pointer hit testing, and keyboard behavior keep working.
- Mobile continent controls use at least 44px targets with no horizontal page overflow.

### Task 1: Replace the rejected visual-variant contract

**Files:**
- Modify: `src/components/InteractiveGlobeMap/collyGlobeVariants.ts`
- Modify: `src/globe-lab/model.ts`
- Test: `src/hooks/globeLab.test.ts`

**Step 1: Write the failing contract tests**

Add assertions that the five stable route slugs resolve to these study names and techniques:

```ts
[
  ["soft-aperture", "Armin Refined", "armin-refined"],
  ["rounded-observatory", "Cultural Routes", "cultural-routes"],
  ["superellipse-lens", "Relief Layers", "relief-layers"],
  ["floating-glass", "Atlas Index", "atlas-index"],
  ["editorial-cutout", "Museum Territories", "museum-territories"],
]
```

Assert every profile has the production scale and offset and that serialized profiles do not contain the rejected surface concepts: `palette`, `color`, `frame`, `clip`, `aperture`, `glow`, or alternate atmosphere fields.

**Step 2: Run the focused test and confirm it fails**

Run:

```bash
npx vitest run src/hooks/globeLab.test.ts
```

Expected: failures because the old profiles still encode five surface treatments and old names.

**Step 3: Implement the smallest structural profile**

Replace the old variant type with:

```ts
export type CollyMapTechnique =
  | "armin-refined"
  | "cultural-routes"
  | "relief-layers"
  | "atlas-index"
  | "museum-territories";

export interface CollyGlobeVariantProfile {
  technique: CollyMapTechnique;
  scaleRatio: 0.38;
  offset: readonly [0, 0];
  detail: Readonly<Record<string, number | boolean>>;
}
```

Keep existing slugs so bookmarks and navigation do not break. Update the study titles and concise copy in `model.ts`. Do not add a replacement palette property; the existing production preset remains authoritative.

**Step 4: Re-run the focused test**

Run:

```bash
npx vitest run src/hooks/globeLab.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/components/InteractiveGlobeMap/collyGlobeVariants.ts src/globe-lab/model.ts src/hooks/globeLab.test.ts
git commit -m "refactor: define five armin map techniques"
```

### Task 2: Add deterministic technique-data derivation

**Files:**
- Create: `src/components/InteractiveGlobeMap/collyMapTechniqueData.ts`
- Create: `src/hooks/collyMapTechniqueData.test.ts`

**Step 1: Write failing pure-function tests**

Cover these contracts with small fixture arrays:

- projected clusters are deterministic, preserve the total museum/collection weight, and never fabricate coordinates;
- cultural-route hubs are selected from real museum coordinates and produce a capped, stable edge set without duplicate undirected edges;
- country aggregates preserve the original country keys and total weight;
- projected territory nodes discard hidden or non-finite points and preserve source identity;
- empty and single-point inputs return safe empty/fallback structures.

**Step 2: Run the new test and confirm it fails**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts
```

Expected: module-not-found failure.

**Step 3: Implement minimum pure derivation helpers**

Implement exported helpers with stable input ordering and no React or canvas dependencies:

```ts
clusterProjectedMuseums(points, radius)
deriveCulturalRouteGraph(points, options)
aggregateMuseumsByCountry(points)
deriveTerritoryNodes(points)
```

Use existing museum ids, coordinates, country keys, city values, and collection counts. Abstract only shared input normalization; keep the four concepts independent.

**Step 4: Run the new and existing focused tests**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts src/hooks/globeLab.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/components/InteractiveGlobeMap/collyMapTechniqueData.ts src/hooks/collyMapTechniqueData.test.ts
git commit -m "feat: derive real map technique data"
```

### Task 3: Introduce production-safe renderer hooks

**Files:**
- Create: `src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Test: `src/hooks/globeLab.test.ts`

**Step 1: Add failing renderer-contract tests**

Assert that each technique declares only:

- an underlay renderer,
- an overlay renderer,
- whether it replaces production overview markers,
- numeric detail parameters.

Assert failure or missing derived data falls back to the production globe contract.

**Step 2: Run the test and confirm it fails**

Run:

```bash
npx vitest run src/hooks/globeLab.test.ts
```

Expected: missing renderer contract.

**Step 3: Implement the shared hooks**

Add a renderer module with small functions:

```ts
drawTechniqueUnderlay(args)
drawTechniqueOverlay(args)
shouldDrawProductionPreviewMarkers(technique, interactionState)
```

Pass the current `ctx`, projection, path, sphere, land, production palette, visible museum points, active region, zoom, focus state, and detail parameters. Preserve `Globe.tsx` as the owner of frame lifecycle, base land, borders, labels, hit testing, and interactions.

Render order:

1. production sphere and atmosphere,
2. technique underlay,
3. production land,
4. technique geographic/data overlay,
5. production borders and required labels,
6. production interaction overlays.

Wrap technique drawing with `ctx.save()`/`ctx.restore()` and a safe fallback so a technique error cannot blank the canvas. Do not change original geography used for hit testing.

**Step 4: Re-run the focused tests**

Run:

```bash
npx vitest run src/hooks/globeLab.test.ts src/hooks/globeGeometrySmoothing.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts src/components/InteractiveGlobeMap/Globe.tsx src/hooks/globeLab.test.ts
git commit -m "refactor: add map technique render pipeline"
```

### Task 4: Build Armin Refined and Cultural Routes

**Files:**
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Modify: `src/hooks/collyMapTechniqueData.test.ts`

**Step 1: Extend tests for both studies**

Test that:

- Refined cluster glyph tiers are based on real projected cluster weights and split predictably across the threshold values;
- Cultural Routes uses only real hub coordinates, limits graph degree/edge count, and recomposes from the active-region subset;
- neither technique emits a custom color token or globe outline.

**Step 2: Run tests and confirm the new assertions fail**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts src/hooks/globeLab.test.ts
```

Expected: missing glyph and route rendering behavior.

**Step 3: Implement Armin Refined**

Use projected distance clustering at overview scale. Draw weighted cluster marks with gold production accent, neutral white micro-points, and boundary emphasis derived from real country aggregate weight. Keep the original point set at country/city focus so users can reach actual museums.

**Step 4: Implement Cultural Routes**

Select a capped set of major real museum-city hubs. Connect stable nearest/strongest neighbors with great-circle paths from `d3.geoInterpolate` or geographic line strings. Draw restrained neutral route lines, gold hubs, and small directional ticks; avoid a full mesh. Filter the graph to the active continent when selected.

**Step 5: Run tests**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts src/hooks/globeLab.test.ts src/hooks/globeGeometrySmoothing.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts src/components/InteractiveGlobeMap/Globe.tsx src/hooks/collyMapTechniqueData.test.ts
git commit -m "feat: add refined clusters and cultural routes"
```

### Task 5: Build Relief Layers and Atlas Index

**Files:**
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueData.ts`
- Modify: `src/hooks/collyMapTechniqueData.test.ts`

**Step 1: Add failing geometry tests**

Test that:

- relief offsets are a short, ordered list of small screen-space translations and collapse under reduced motion;
- atlas aggregates use actual country centroids and existing aggregate totals;
- edge-label placement is deterministic, remains within the canvas inset, and avoids overlap for the representative fixture;
- selecting a country disables aggregate replacement so real museum points can unfold.

**Step 2: Run and confirm failure**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts
```

Expected: missing relief/label-placement helpers.

**Step 3: Implement Relief Layers**

Render three or four copies of the real land feature at subtle screen-space offsets before the production land. Use only the production land/border channels at different opacity. Keep the sphere complete and unframed. Reduce layer separation as semantic zoom increases or when reduced motion is active.

**Step 4: Implement Atlas Index**

At overview, replace individual points with country aggregates positioned from real geographic centroids. Place a capped set of non-overlapping text labels around the globe perimeter and draw thin leader lines to centroids. The labels are part of the map composition, not a surrounding card. At country or city focus, restore real points and existing detail behavior.

**Step 5: Run focused tests**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts src/hooks/globeLab.test.ts src/hooks/globeGeometrySmoothing.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts src/components/InteractiveGlobeMap/Globe.tsx src/components/InteractiveGlobeMap/collyMapTechniqueData.ts src/hooks/collyMapTechniqueData.test.ts
git commit -m "feat: add relief map and atlas index"
```

### Task 6: Build Museum Territories

**Files:**
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueData.ts`
- Modify: `src/hooks/collyMapTechniqueData.test.ts`

**Step 1: Add failing territory tests**

Use fixture projected nodes to assert:

- Delaunay edges reference only existing visible museum nodes;
- Voronoi focus geometry is finite and bounded;
- zero, one, and two nodes fall back without throwing;
- the active/focused museum id maps to the correct cell;
- no territory contract adds color or a decorative clipping shape.

**Step 2: Run and confirm failure**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts
```

Expected: missing territory geometry.

**Step 3: Implement territory geometry and drawing**

Use `Delaunay.from(projectedCoordinates)`. Draw a sparse neutral triangulation clipped only by the real geographic sphere path. Reveal one production-gold Voronoi focus cell for the hovered, keyboard-focused, or selected museum. Keep a simple node fallback for fewer than three visible points. Expose the focused museum name through the existing accessible status text so the geometry is not the only representation.

**Step 4: Run focused tests**

Run:

```bash
npx vitest run src/hooks/collyMapTechniqueData.test.ts src/hooks/globeLab.test.ts src/hooks/globeGeometrySmoothing.test.ts
```

Expected: pass.

**Step 5: Commit**

```bash
git add src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts src/components/InteractiveGlobeMap/Globe.tsx src/components/InteractiveGlobeMap/collyMapTechniqueData.ts src/hooks/collyMapTechniqueData.test.ts
git commit -m "feat: add museum territory geometry"
```

### Task 7: Rebuild the continent controls and remove rejected CSS

**Files:**
- Modify: `src/components/InteractiveGlobeMap/InteractiveGlobeMap.tsx`
- Modify: `src/globe-lab/globe-lab-colly-variants.css`
- Modify: `src/hooks/globeLab.test.ts`

**Step 1: Add failing markup and CSS-source tests**

Assert:

- the control exposes `data-colly-map-technique` and keeps the same region button actions/counts;
- all region buttons keep semantic button markup and accessible pressed state;
- the stylesheet no longer contains old frame/aperture/lens/glass/cutout selectors or alternate per-variant color tokens;
- mobile targets declare a 44px minimum size.

**Step 2: Run and confirm failure**

Run:

```bash
npx vitest run src/hooks/globeLab.test.ts
```

Expected: old visual-variant markup and CSS still present.

**Step 3: Implement five structural control compositions**

Keep the same data and actions while varying layout only:

- Armin Refined: quiet single-line rail with restrained active underline;
- Cultural Routes: connected hub strip whose counts sit with labels;
- Relief Layers: compact centered tab sequence aligned to the engraved map hierarchy;
- Atlas Index: compact editorial two-line index;
- Museum Territories: explicit accessible two-row grid with at least 44px targets and 8px gaps.

Use the production palette for every composition. Do not add outer cards, pills around the whole control, decorative numbering, or page-theme changes.

**Step 4: Delete old rejected styling**

Remove variant color variables, clipped-frame geometry, aperture/lens/glass/cutout rules, and page-level alternate themes. Add only the shared production tokens and the five structural layouts. Preserve current responsive page-shell behavior.

**Step 5: Run focused tests**

Run:

```bash
npx vitest run src/hooks/globeLab.test.ts src/hooks/redesignPreview.test.ts
```

Expected: pass.

**Step 6: Commit**

```bash
git add src/components/InteractiveGlobeMap/InteractiveGlobeMap.tsx src/globe-lab/globe-lab-colly-variants.css src/hooks/globeLab.test.ts
git commit -m "style: rebuild map technique controls"
```

### Task 8: Verify behavior and structural distinction in-browser

**Files:**
- Modify if required: `src/globe-lab/GlobeLabPage.tsx`
- Modify if required: `src/hooks/globeLab.test.ts`
- Create: `tests/globe-lab-map-techniques.spec.ts`

**Step 1: Write failing browser checks**

For all five routes at 1440x1000 and 390x844, verify:

- the expected `data-colly-map-technique` value;
- no decorative map-frame element or old frame attribute;
- complete globe visibility and no horizontal overflow;
- continent button click updates the pressed state;
- dragging the canvas changes captured canvas pixels;
- mobile continent targets are at least 44px high;
- no page errors.

Take normal and browser-filtered grayscale screenshots. Compare the five grayscale captures with a conservative pixel-difference threshold to catch accidental same-structure regressions without requiring exact image snapshots.

**Step 2: Start the isolated dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 4175
```

Expected: Vite serves the worktree at `http://127.0.0.1:4175`.

**Step 3: Run browser tests and fix only observed issues**

Run:

```bash
npx playwright test tests/globe-lab-map-techniques.spec.ts
```

Expected: pass. If a visual or behavior failure appears, make the smallest relevant renderer/CSS correction and add or tighten the matching assertion.

**Step 4: Run the complete focused verification**

Run:

```bash
npx vitest run src/hooks/globeGeometrySmoothing.test.ts src/hooks/globeLab.test.ts src/hooks/redesignPreview.test.ts src/hooks/collyMapTechniqueData.test.ts
npm run build
npx playwright test tests/globe-lab-map-techniques.spec.ts
```

Expected: all tests and the production build pass.

**Step 5: Commit**

```bash
git add tests/globe-lab-map-techniques.spec.ts src/globe-lab/GlobeLabPage.tsx src/hooks/globeLab.test.ts
git commit -m "test: verify five map techniques"
```

### Task 9: Integrate carefully into the user's active workspace

**Files:**
- Compare: worktree changes against `/Users/kietzsche/armin-web-main`
- Preserve: all unrelated dirty files and the current production proximity/city-state logic in `src/components/InteractiveGlobeMap/Globe.tsx`

**Step 1: Review the feature diff**

Run:

```bash
git status --short
git diff HEAD~7..HEAD --stat
git diff HEAD~7..HEAD -- src/components/InteractiveGlobeMap src/globe-lab src/hooks tests
```

Check for invented data, alternate colors, decorative frame remnants, broad refactors, and unrelated edits. Because sub-agents are disallowed for this task, perform a direct self-review rather than delegating review.

**Step 2: Merge without overwriting the user's newer globe work**

Apply the feature commits or exact patches to `/Users/kietzsche/armin-web-main`. For `Globe.tsx`, manually retain the active workspace's newer proximity behavior, including `COUNTRY_VIEW_INNER`, `COUNTRY_VIEW_OUTER`, `viewCenterFromRot`, `viewProximityAlpha`, city-state labels, and proximity-aware marker hit/fade rules.

**Step 3: Verify in the active workspace**

Run:

```bash
npx vitest run src/hooks/globeGeometrySmoothing.test.ts src/hooks/globeLab.test.ts src/hooks/redesignPreview.test.ts src/hooks/collyMapTechniqueData.test.ts
npm run build
```

Start or confirm the user's `4173` dev server, run the five-route browser check against it, and inspect browser console output.

**Step 4: Open the finished result**

Only after verification, navigate the in-app browser to:

```text
http://127.0.0.1:4173/globe-lab/colly-evolved
```

Leave the page open for the user, as explicitly requested.

