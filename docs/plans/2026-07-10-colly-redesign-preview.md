# COLLY Redesign Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build three complete, read-only COLLY redesign concepts across nine major views without changing existing production routes.

**Architecture:** `src/main.tsx` selects a lazy preview application only for `/redesign` paths. The preview application shares route and data contracts, then delegates layout to three concept renderers so content stays authoritative while composition remains distinct.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Vite 6, Vitest, native CSS, existing project data.

---

### Task 1: Route contract

**Files:**
- Create: `src/redesign/model.test.ts`
- Create: `src/redesign/model.ts`

**Step 1: Write the failing test**

Cover valid concept/view parsing, invalid values, optional record ids, and concept-switch URL preservation.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/redesign/model.test.ts`

Expected: FAIL because `src/redesign/model.ts` does not exist.

**Step 3: Write minimal implementation**

Export literal concept and view arrays, type guards, `parsePreviewPath`, and `buildPreviewPath`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/redesign/model.test.ts`

Expected: PASS.

### Task 2: Current-data adapter

**Files:**
- Modify: `src/redesign/model.test.ts`
- Create: `src/redesign/data.ts`

**Step 1: Add failing selector tests**

Assert that museums, exhibitions, artworks, artists, and posts are derived from existing sources, contain display images where required, and return deterministic default records.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/redesign/model.test.ts`

Expected: FAIL because preview selectors are missing.

**Step 3: Implement the adapter**

Flatten existing exhibition records and inline artworks. Group artists by name and map current sample community posts. Do not create a duplicate content fixture.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/redesign/model.test.ts`

Expected: PASS.

### Task 3: Isolated entry point and preview shell

**Files:**
- Modify: `src/main.tsx`
- Create: `src/redesign/RedesignApp.tsx`
- Create: `src/redesign/components/PreviewShell.tsx`
- Create: `src/redesign/redesign.css`

**Step 1: Add a failing source contract test**

Assert that the preview defines the three concepts and nine views and that existing routes do not match the preview selector.

**Step 2: Implement lazy entry selection**

Render the existing `App` unchanged unless the pathname starts with `/redesign`. Add a Suspense skeleton for the preview chunk.

**Step 3: Implement the comparison index and shell**

Add the COLLY wordmark, concept switcher, view navigation, language-independent labels, skip link, and semantic main region.

**Step 4: Verify**

Run: `npm test -- src/redesign/model.test.ts && npm run typecheck`

Expected: PASS.

### Task 4: Hybrid editorial concept

**Files:**
- Create: `src/redesign/concepts/HybridConcept.tsx`
- Modify: `src/redesign/redesign.css`

**Step 1: Implement nine view compositions**

Use an asymmetric split, dominant artwork plane, and one controlled dark-to-light surface transition per view. Use shared data selectors and real images.

**Step 2: Implement states**

Add search filtering, artwork taste selection, empty results, image fallback, and read-only profile collection behavior.

**Step 3: Verify**

Run: `npm run typecheck && npm run build`

Expected: PASS.

### Task 5: Dark gallery concept

**Files:**
- Create: `src/redesign/concepts/DarkConcept.tsx`
- Modify: `src/redesign/redesign.css`

**Step 1: Implement nine view compositions**

Use an image field, gallery-wall rail, sharp control deck, and edge-aligned metadata. Avoid generic cards and excessive blur.

**Step 2: Implement motion and reduced-motion fallback**

Use CSS transforms and opacity for purposeful reveals and selections only.

**Step 3: Verify**

Run: `npm run typecheck && npm run build`

Expected: PASS.

### Task 6: Light museum concept

**Files:**
- Create: `src/redesign/concepts/LightConcept.tsx`
- Modify: `src/redesign/redesign.css`

**Step 1: Implement nine view compositions**

Use catalogue folios, editorial columns, square sheets, and cobalt as the single accent.

**Step 2: Implement responsive rules**

Collapse multi-column structures below 768px, preserve 44px targets, and prevent horizontal overflow.

**Step 3: Verify**

Run: `npm run typecheck && npm run build`

Expected: PASS.

### Task 7: Accessibility and visual verification

**Files:**
- Modify as needed: `src/redesign/**/*.tsx`
- Modify as needed: `src/redesign/redesign.css`

**Step 1: Run automated checks**

Run: `npm test -- src/redesign/model.test.ts && npm run typecheck && npm run build`

Expected: all commands exit 0.

**Step 2: Audit current web guidelines**

Fetch the latest Vercel Web Interface Guidelines and inspect every preview file.

**Step 3: Run browser checks**

Check 27 desktop paths and representative 375px mobile paths. Inspect console errors, focus visibility, reduced motion, navigation state, and horizontal overflow.

**Step 4: Iterate from screenshots**

Capture each concept's index, home, search, and one detail view. Correct hierarchy, spacing, crop, and contrast issues before completion.

