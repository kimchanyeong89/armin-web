# Evolved COLLY Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a read-only redesign that preserves the current COLLY full-screen shell and core navigation while upgrading its visual system and real-data presentation.

**Architecture:** Add an independent `/redesign/evolved/*` experience under the existing lazy redesign bundle. Reuse normalized preview data, the read-only globe, and exhibition archive modal through small configurable interfaces; keep Evolved panel state in the URL and leave production components untouched.

**Tech Stack:** React 19, React Router, TypeScript, D3 geo/SVG, CSS, Vitest, Vite.

---

### Task 1: Route and render contracts

**Files:**
- Modify: `src/hooks/redesignPreview.test.ts`
- Create: `src/redesign/evolved/model.ts`
- Create: `src/redesign/evolved/EvolvedApp.tsx`
- Modify: `src/redesign/RedesignApp.tsx`

1. Write failing tests for `/redesign/evolved/{globe,community,ai,profile,search,work/:id}`.
2. Assert a persistent top bar and bottom five-item navigator on every panel.
3. Run the focused Vitest file and confirm the Evolved exports/routes are missing.
4. Implement minimal route parsing and shell markup.
5. Re-run the focused tests.

### Task 2: Configurable shared core

**Files:**
- Modify: `src/redesign/components/ReadonlyGlobe.tsx`
- Modify: `src/redesign/components/ExhibitionArtworkModal.tsx`

1. Add failing render assertions for an immersive globe variant and Evolved modal links.
2. Add an optional modal-path builder and immersive variant to the globe.
3. Add optional work/detail path builders to the modal.
4. Keep existing Hybrid/Dark/Light behavior unchanged.

### Task 3: Five familiar panels

**Files:**
- Create: `src/redesign/evolved/EvolvedPanels.tsx`
- Modify: `src/redesign/evolved/EvolvedApp.tsx`
- Modify: `src/redesign/redesign.css`

1. Write failing assertions for real globe counts, community topics, AI selection, profile counts, and search controls.
2. Implement the five panels using existing data and current COLLY interaction labels.
3. Implement the work-detail panel and connect artwork links.
4. Add the refined ink/carbon/bone/gold visual system and responsive shell.

### Task 4: Representative entry

**Files:**
- Modify: `src/redesign/RedesignApp.tsx`
- Modify: `src/redesign/redesign.css`

1. Add Evolved COLLY as the recommended entry on `/redesign` while retaining the three research cards.
2. Verify production `/` and existing preview routes still render unchanged.

### Task 5: Verification

**Files:**
- Test: `src/hooks/redesignPreview.test.ts`

1. Run focused Vitest, redesign-only strict TypeScript, ESLint, and `git diff --check`.
2. Run `npx vite build` and record pre-existing warnings separately.
3. Browser-test all Evolved panels, globe museum selection, exhibition modal, work navigation, desktop, and mobile.

