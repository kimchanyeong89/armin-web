# COLLY Map Geometry Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all decorative map clipping and deliver five polished COLLY globe variants differentiated by rounded geographic geometry, boundary hierarchy, terrain lighting, labels, and museum data marks.

**Architecture:** Keep `InteractiveGlobeMap` and the D3 orthographic projection as the single behavior and data source. Move geometry smoothing into a small pure module, prepare balanced and soft geometries once when TopoJSON loads, and let typed COLLY map profiles select render tokens and geometry softness without changing hit-testing. Page CSS remains scoped to Globe Lab and removes all map enclosures.

**Tech Stack:** React 18, TypeScript, D3 geo, TopoJSON, Canvas 2D, vanilla CSS, Vitest, Vite, Playwright.

---

### Task 1: Replace frame contracts with map-treatment contracts

**Skills:** @redesign-existing-projects, @karpathy-guidelines, @test-driven-development

**Files:**
- Modify: `src/hooks/globeLab.test.ts`
- Modify: `src/globe-lab/model.ts`
- Modify: `src/components/InteractiveGlobeMap/collyGlobeVariants.ts`

**Step 1: Write the failing contract tests**

Add assertions that the five visible names are `Soft Contour`, `Signal Cartography`, `Night Relief`, `Ink Atlas`, and `Legible Boundaries`. Assert that every profile exposes `mapStyle` and `geometrySoftness`, that map styles are unique, and that serialized profiles contain neither `frame` nor `clip`.

```ts
expect(COLLY_GLOBE_VARIANTS.map(({ name }) => name)).toEqual([
  "Soft Contour",
  "Signal Cartography",
  "Night Relief",
  "Ink Atlas",
  "Legible Boundaries",
]);

const profiles = Object.values(COLLY_GLOBE_VARIANT_PROFILES);
expect(new Set(profiles.map(({ mapStyle }) => mapStyle)).size).toBe(5);
expect(JSON.stringify(profiles)).not.toMatch(/"frame"|"clip"/);
```

**Step 2: Run the tests and confirm failure**

Run: `npx vitest run src/hooks/globeLab.test.ts`

Expected: FAIL because the old frame names and frame fields still exist.

**Step 3: Implement the map profile model**

Replace `CollyFrameTechnique` and `CollyFrameClip` with:

```ts
export type CollyMapStyle =
  | "soft-contour"
  | "signal-cartography"
  | "night-relief"
  | "ink-atlas"
  | "legible-boundaries";

export type CollyGeometrySoftness = "balanced" | "soft";
```

Define direct rendering tokens for sphere rim opacity, land light, coast stroke/glow, internal-border stroke/underlay/dash, graticule stroke/dash, labels, and markers. Keep route slugs stable so existing links do not break, but update visible names and descriptions in `model.ts`.

**Step 4: Run the tests and confirm pass**

Run: `npx vitest run src/hooks/globeLab.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/globeLab.test.ts src/globe-lab/model.ts src/components/InteractiveGlobeMap/collyGlobeVariants.ts
git commit -m "refactor: replace colly frames with map treatments"
```

### Task 2: Make rounded geography testable and reusable

**Skills:** @test-driven-development, @karpathy-guidelines

**Files:**
- Create: `src/components/InteractiveGlobeMap/globeGeometrySmoothing.ts`
- Create: `src/components/InteractiveGlobeMap/globeGeometrySmoothing.test.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`

**Step 1: Write failing geometry tests**

Cover closed polygon rings, open border lines, MultiPolygon and MultiLineString traversal, source immutability, and the fact that the soft profile creates more points than balanced geometry.

```ts
const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const rounded = smoothGlobeGeometry({ type: "Polygon", coordinates: [ring] }, "balanced");
expect(rounded.coordinates[0][0]).toEqual(rounded.coordinates[0].at(-1));
expect(rounded.coordinates[0].length).toBeGreaterThan(ring.length);
expect(ring).toHaveLength(5);
```

**Step 2: Run the tests and confirm failure**

Run: `npx vitest run src/components/InteractiveGlobeMap/globeGeometrySmoothing.test.ts`

Expected: FAIL because the module does not exist.

**Step 3: Extract the minimal smoothing module**

Move the current Chaikin functions out of `Globe.tsx`. Export only:

```ts
export function smoothGlobeGeometry(
  geometry: any,
  softness: "balanced" | "soft",
): any
```

Use two passes for balanced and three passes for soft. Preserve closed rings, dateline normalization, and endpoint retention for open lines.

**Step 4: Prepare geometry variants once**

When TopoJSON loads, store `_roundedBalanced` and `_roundedSoft` on land, border mesh, and country features. Keep the original geometry on each feature for `geoContains` hit-testing.

**Step 5: Run the geometry tests and Globe Lab tests**

Run: `npx vitest run src/components/InteractiveGlobeMap/globeGeometrySmoothing.test.ts src/hooks/globeLab.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/components/InteractiveGlobeMap/globeGeometrySmoothing.ts src/components/InteractiveGlobeMap/globeGeometrySmoothing.test.ts src/components/InteractiveGlobeMap/Globe.tsx
git commit -m "feat: prepare rounded globe geometry"
```

### Task 3: Render five map treatments without clipping

**Skills:** @frontend-design, @design-taste-frontend, @high-end-visual-design, @ui-ux-pro-max

**Files:**
- Modify: `src/components/InteractiveGlobeMap/globeCanvasStyles.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Modify: `src/components/InteractiveGlobeMap/collyGlobeVariants.ts`

**Step 1: Remove the frame rendering API**

Delete `CollyFrameGeometry`, `resolveCollyFrameGeometry`, `isPointInsideCollyFrame`, `beginCollyCanvasFrame`, `drawCollyFrameFinish`, and all associated imports, refs, data attributes, clipping, vignette, and frame-specific hit-test gates.

**Step 2: Select rounded geometry by profile**

Add a local helper in `Globe.tsx` that returns `_roundedSoft` for soft profiles and `_roundedBalanced` otherwise. Use it for land, border mesh, hovered-country fill, and drilled-country fill. Keep original features for containment and centroids.

**Step 3: Make ocean and land lighting data-driven**

For COLLY profiles, build the sphere gradient from `oceanHighlight`, `oceanMidtone`, and `oceanShadow`. Render land with a profile-specific directional gradient clipped to the rounded land geometry, then apply the profile coast treatment.

**Step 4: Make boundary hierarchy data-driven**

Draw internal borders with optional under-stroke, optional bloom, round joins/caps, and profile dash. Draw coastlines separately so they never become a yellow sphere outline. Set sphere-rim opacity to zero for all five profiles.

**Step 5: Differentiate graticules and museum marks**

Use profile graticule width, opacity, and dash. Preserve collection-size marker emphasis and add a restrained primary pulse only for Signal Cartography. Keep label thresholds and scales profile-specific.

**Step 6: Run focused tests and build**

Run: `npx vitest run src/components/InteractiveGlobeMap/globeGeometrySmoothing.test.ts src/hooks/globeLab.test.ts`

Run: `npx vite build`

Expected: tests PASS and Vite build succeeds.

**Step 7: Commit**

```bash
git add src/components/InteractiveGlobeMap/globeCanvasStyles.ts src/components/InteractiveGlobeMap/Globe.tsx src/components/InteractiveGlobeMap/collyGlobeVariants.ts
git commit -m "feat: render five rounded map treatments"
```

### Task 4: Remove map enclosures and refine the five page compositions

**Skills:** @redesign-existing-projects, @frontend-design, @design-taste-frontend, @high-end-visual-design, @ui-ux-pro-max

**Files:**
- Modify: `src/globe-lab/globe-lab-colly-variants.css`
- Modify: `src/globe-lab/GlobeLabPage.tsx`

**Step 1: Remove enclosure styles**

Delete map-stage borders, glass panels, pseudo-element frames, inset rings, clipped corner shapes, and frame-oriented shadows. Keep the globe container background transparent and overflow visible.

**Step 2: Refine each layout around its map treatment**

- Soft Contour: quiet graphite product layout with open whitespace.
- Signal Cartography: precise telemetry rhythm without a dashboard box.
- Night Relief: cinematic spacing and restrained champagne typography.
- Ink Atlas: editorial type rhythm and annotation-like controls without a print frame.
- Legible Boundaries: explicit hierarchy, high contrast, and larger control labels.

**Step 3: Update accessible variant labels**

Ensure the switcher exposes the new visible names and retains `aria-current`, focus-visible styling, and 44px targets.

**Step 4: Run route tests and build**

Run: `npx vitest run src/hooks/globeLab.test.ts src/hooks/redesignPreview.test.ts`

Run: `npx vite build`

Expected: all focused tests pass and build succeeds.

**Step 5: Commit**

```bash
git add src/globe-lab/globe-lab-colly-variants.css src/globe-lab/GlobeLabPage.tsx
git commit -m "style: open up colly map compositions"
```

### Task 5: Verify all five variants and integrate safely

**Skills:** @webapp-testing, @verification-before-completion, @requesting-code-review

**Files:**
- Verify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Verify: `src/components/InteractiveGlobeMap/globeCanvasStyles.ts`
- Verify: `src/globe-lab/globe-lab-colly-variants.css`

**Step 1: Run final automated verification**

Run: `npx vitest run src/components/InteractiveGlobeMap/globeGeometrySmoothing.test.ts src/hooks/globeLab.test.ts src/hooks/redesignPreview.test.ts`

Run: `npx vite build`

Expected: all tests pass and build succeeds.

**Step 2: Run browser checks at four viewports**

Check all five routes at 375×812, 768×1024, 1024×768, and 1440×1000. Assert no horizontal overflow, five variant controls, seven region controls, minimum target size, and no console errors.

**Step 3: Verify map interaction**

For each variant verify that canvas pixels change after drag and wheel zoom, and that selecting Asia sets the region control to `aria-pressed="true"`.

**Step 4: Review screenshots**

Confirm every globe is fully circular and visible, no rectangular or superellipse frame remains, boundary curves are visibly rounded, no yellow sphere outline is present, and the five map treatments are materially distinct.

**Step 5: Request code review and fix important findings**

Review specifically for production-map regressions, inaccurate hit-testing, source-geometry mutation, and frame remnants.

**Step 6: Integrate the focused diff into the main workspace**

Preserve main-only proximity logic in `Globe.tsx`. Copy exact-match files directly through patches and merge `Globe.tsx` manually. Re-run the final tests and build in the main workspace.

**Step 7: Open the finished page**

Keep the 4173 development server running, navigate the in-app browser to `/globe-lab`, verify no browser errors, and leave the tab open as the deliverable.
