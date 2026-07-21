# COLLY Community Six Studies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add six fully interactive community redesign studies and refine the Atlas city-detail minimap/list entrance motion without losing production community behavior.

**Architecture:** Extract only the community feed knowledge needed by both production and preview into a shared feature module. Add a route-driven redesign study shell that owns common state and dispatches to six semantic view renderers, while existing production detail and write routes continue to provide authenticated mutations. Keep visual differences in a dedicated stylesheet and preserve the current mobile detail-panel path.

**Tech Stack:** React 19, TypeScript, React Router, Firebase Firestore, Framer Motion, Vite, Vitest, vanilla CSS.

---

### Task 1: Lock the Atlas entrance-motion contract

**Files:**
- Modify: `src/hooks/globeLab.test.ts`
- Modify: `src/components/InteractiveGlobeMap/VenuePanel.tsx`
- Modify: `src/components/InteractiveGlobeMap/InteractiveGlobe.css`

1. Add a failing test asserting a minimap reveal wrapper, capped per-row stagger, and reduced-motion fallback.
2. Run `./node_modules/.bin/vitest run src/hooks/globeLab.test.ts --pool=threads` and confirm failure.
3. Wrap the minimap and museum rows with transform/opacity motion using the existing reduced-motion value.
4. Add only the supporting Atlas panel CSS.
5. Re-run the targeted test and confirm it passes.

### Task 2: Create the shared community feed contract

**Files:**
- Create: `src/features/community/communityFeed.ts`
- Create: `src/features/community/useCommunityFeed.ts`
- Modify: `src/pages/community/CommunityPage.tsx`
- Test: `src/hooks/communityRedesign.test.ts`

1. Write failing tests for category normalization, header normalization, sample fallback shape, and latest/popular sorting.
2. Run the targeted test and confirm failure.
3. Move the authoritative post type, normalizers, sample mapping, and fetch/sort behavior into the feature files.
4. Replace the production page's local feed effect with the shared hook without changing its rendered behavior.
5. Run community and existing test suites.

### Task 3: Add route model and functional study shell

**Files:**
- Create: `src/redesign/community/model.ts`
- Create: `src/redesign/community/CommunityStudiesApp.tsx`
- Modify: `src/redesign/RedesignApp.tsx`
- Modify: `src/hooks/redesignPreview.test.ts`

1. Add failing tests for the six slugs and their `/redesign/community/:study` paths.
2. Implement typed study metadata and route parsing.
3. Build the common shell with feed state, sort, category, review filter, nearby view, language, theme, write navigation, and post navigation.
4. Add the route before the generic redesign wildcard.
5. Run the targeted route tests.

### Task 4: Implement the six semantic renderers

**Files:**
- Create: `src/redesign/community/CommunityStudyViews.tsx`
- Create: `src/redesign/community/community-studies.css`
- Modify: `src/redesign/community/CommunityStudiesApp.tsx`
- Test: `src/hooks/communityRedesign.test.ts`

1. Add failing render-contract tests requiring every study, shared controls, status regions, write action, and post links.
2. Implement Living Archive and Salon Stream.
3. Implement Critics' Index and Afterimage Gallery.
4. Implement Civic Forum and Collection Grid.
5. Add responsive rules, visible focus, active/pressed states, loading/empty states, and reduced-motion overrides.
6. Run the targeted tests after each pair.

### Task 5: Add the redesign index entry and study switcher

**Files:**
- Modify: `src/redesign/RedesignApp.tsx`
- Modify: `src/redesign/redesign.css`
- Test: `src/hooks/redesignPreview.test.ts`

1. Add a failing test for the community studies index and six links.
2. Add an editorial community section to `/redesign` without changing the existing concept cards.
3. Add a compact, responsive six-study switcher to the study shell.
4. Run targeted tests.

### Task 6: Verify behavior and presentation

**Files:**
- Test: `src/hooks/communityRedesign.test.ts`
- Test: `src/hooks/globeLab.test.ts`

1. Run `./node_modules/.bin/vitest run --reporter=dot --pool=threads`.
2. Run `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`.
3. Run `./node_modules/.bin/vite build`.
4. Run `git diff --check` for the touched files.
5. Open the Atlas Paris city panel and verify minimap/list entrance visually.
6. Open all six community studies, exercise sort/category/nearby, verify one post navigation, and check a mobile viewport.
7. Leave the redesign community index and recommended study open for the user.
