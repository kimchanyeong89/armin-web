# COLLY Redesign Core Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an actual-data read-only globe and exhibition artwork modal to all three redesign concepts.

**Architecture:** Keep data normalization in `src/redesign/data.ts`, add small pure selectors for geographic and modal data, then render shared globe and dialog components from the isolated redesign app. Use a query parameter for modal state so links remain deep-linkable and concept pages stay independent.

**Tech Stack:** React 19, React Router, TypeScript, D3 geo, SVG, Vitest, Vite, CSS.

---

### Task 1: Define URL and data contracts

**Files:**
- Modify: `src/hooks/redesignPreview.test.ts`
- Modify: `src/redesign/model.ts`
- Modify: `src/redesign/data.ts`

1. Add failing tests for exhibition modal paths, valid-coordinate museums, and directly linked versus museum fallback works.
2. Run `npm test -- src/hooks/redesignPreview.test.ts` and confirm the missing exports fail.
3. Add the minimal pure helpers.
4. Re-run the focused test.

### Task 2: Add the read-only globe

**Files:**
- Create: `src/redesign/components/ReadonlyGlobe.tsx`
- Modify: `src/redesign/concepts/HybridConcept.tsx`
- Modify: `src/redesign/concepts/DarkConcept.tsx`
- Modify: `src/redesign/concepts/LightConcept.tsx`
- Modify: `src/redesign/redesign.css`

1. Add a failing render assertion for the globe landmark and museum count.
2. Implement a shared SVG orthographic globe with drag, zoom, reset, museum markers, and a selected-museum exhibition dock.
3. Mount it on each concept home page and style it through existing concept tokens.
4. Re-run tests and inspect desktop/mobile rendering.

### Task 3: Add the exhibition artwork modal

**Files:**
- Create: `src/redesign/components/ExhibitionArtworkModal.tsx`
- Modify: `src/redesign/RedesignApp.tsx`
- Modify: `src/redesign/concepts/HybridConcept.tsx`
- Modify: `src/redesign/concepts/DarkConcept.tsx`
- Modify: `src/redesign/concepts/LightConcept.tsx`
- Modify: `src/redesign/redesign.css`

1. Add a failing render assertion for a deep-linked dialog and linked artwork records.
2. Render the modal from `?exhibition=<id>` and implement Escape, backdrop, close control, focus, and body-scroll locking.
3. Change exhibition index links and detail actions to open the modal.
4. Keep artwork links on read-only preview routes.

### Task 4: Verify

**Files:**
- Test: `src/hooks/redesignPreview.test.ts`

1. Run focused Vitest, redesign-only strict TypeScript, ESLint, and `npx vite build`.
2. Test globe selection, modal deep link, close, and artwork navigation in the browser.
3. Check all concept homes and exhibition indexes at desktop and mobile widths.
4. Run `git diff --check` and report unrelated existing project warnings separately.

