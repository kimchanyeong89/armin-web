# Atlas Index Family Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the mixed map studies with six genuinely distinct Atlas Index variations and make country geometry visibly rounded at country zoom.

**Architecture:** Keep the existing Canvas/D3 globe, museum data, hit testing, and page shell. Add one render-only adaptive corner-rounding layer and six isolated annotation renderers backed by pure country/city aggregation and placement helpers.

**Tech Stack:** React, TypeScript, Canvas 2D, D3 geo, Vitest, Playwright

---

### Task 1: Replace the visible study taxonomy

**Files:**
- Modify: `src/globe-lab/model.ts`
- Modify: `src/components/InteractiveGlobeMap/collyGlobeVariants.ts`
- Test: `src/hooks/globeLab.test.ts`

**Steps:**
1. Add failing tests asserting exactly six techniques: Atlas Index, Margin Ledger, Radial Register, Country Folio, Coordinate Index, and City Gazetteer.
2. Remove retired visible names and technique identifiers.
3. Keep `/colly-evolved` as Atlas Index and preserve `/floating-glass` as a legacy alias.
4. Run `npx vitest run src/hooks/globeLab.test.ts`.
5. Commit the taxonomy change.

### Task 2: Implement render-only adaptive country rounding

**Files:**
- Modify: `src/components/InteractiveGlobeMap/globeGeometrySmoothing.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Test: `src/hooks/globeGeometrySmoothing.test.ts`

**Steps:**
1. Add failing tests for square-corner curvature, antimeridian continuity, ring closure, input immutability, and open border endpoints.
2. Replace the Chaikin-only pass with adaptive quadratic corner sampling using clamped entry and exit points.
3. Add an Atlas softness level and precompute it for land, country fills, and borders.
4. Keep original features for hit testing.
5. Run the geometry test and focused globe tests.
6. Commit the geometry change.

### Task 3: Add pure Atlas-family data and placement helpers

**Files:**
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueData.ts`
- Test: `src/hooks/collyMapTechniqueData.test.ts`

**Steps:**
1. Add failing tests for deterministic city aggregation, capped local labels, margin-ledger rows, radial bounds, and ranked candidate limits.
2. Implement the minimum pure helpers needed by the six renderers.
3. Avoid speculative abstractions; keep one authoritative country and city aggregate representation.
4. Run `npx vitest run src/hooks/collyMapTechniqueData.test.ts`.
5. Commit the data/layout helpers.

### Task 4: Build six structurally different map renderers

**Files:**
- Modify: `src/components/InteractiveGlobeMap/collyMapTechniqueRenderer.ts`
- Modify: `src/components/InteractiveGlobeMap/Globe.tsx`
- Test: `src/hooks/globeLab.test.ts`

**Steps:**
1. Add renderer coverage for all six technique identifiers.
2. Refine Atlas Index with compact dot/tick anchors, capped leaders, and local country-zoom callouts.
3. Implement Margin Ledger, Radial Register, Country Folio, Coordinate Index, and City Gazetteer with distinct layout logic.
4. Preserve safe renderer fallback to production museum markers.
5. Run focused renderer and data tests.
6. Commit the renderer work.

### Task 5: Rebuild the switcher and continent controls as one editorial family

**Files:**
- Modify: `src/globe-lab/GlobeLabPage.tsx`
- Modify: `src/globe-lab/globe-lab-colly-variants.css`
- Test: `src/hooks/globeLab.test.ts`

**Steps:**
1. Remove selectors and labels belonging to the four retired studies.
2. Add six frameless control structures that reflect each map technique while keeping the original Armin palette.
3. Preserve visible focus and 44px mobile targets.
4. Run tests and the production build.
5. Commit the UI family change.

### Task 6: Verify all six studies in the browser

**Files:**
- Modify: `scripts/qa-globe-lab-map-techniques.mjs`

**Steps:**
1. Update the QA route/technique list to the six Atlas-family studies.
2. Run focused Vitest suites and `npm run build`.
3. Run desktop and mobile QA for overflow, controls, drag, continent selection, country zoom, and screenshots.
4. Visually inspect Atlas Index at the UK/Europe zoom shown in the user's references.
5. Fix any failed check, rerun, and commit verification changes.

### Task 7: Integrate into the user's working tree and open the result

**Files:**
- Copy only the finalized feature files into `/Users/kietzsche/armin-web-main`

**Steps:**
1. Preserve the user's newer proximity fading, hit restrictions, and city-state labeling in the main `Globe.tsx`.
2. Run focused tests and the production build in the main workspace.
3. Run the updated browser QA at port 4173.
4. Open `/globe-lab/colly-evolved` in the in-app browser and leave the Atlas Index study visible.
