# Mobile Chrome Tweaks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add six query-selectable mobile top-control and bottom-navigation design tweaks to the production interactive globe without changing the globe renderer.

**Architecture:** One typed model validates tweak ids. The application shell resolves `?tweak=` and passes the id independently to `InteractiveGlobeMap` and `BottomPageNavigator`. Stable data attributes and dedicated CSS selectors provide six mobile-only visual systems while the current styles remain the no-query fallback.

**Tech Stack:** React 19, TypeScript, React Router, Framer Motion, Lucide React, vanilla CSS, Vitest, Vite.

---

### Task 1: Define the mobile chrome tweak model

**Files:**
- Create: `src/components/mobileChromeTweaks.ts`
- Create: `src/components/mobileChromeTweaks.test.ts`

**Step 1: Write the failing model test**

Assert that the six ids are returned in the approved order, valid ids resolve, unknown ids return `undefined`, and every profile has a skill and public URL.

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/mobileChromeTweaks.test.ts`

Expected: FAIL because the module does not exist.

**Step 3: Implement the minimal model**

Export:

```ts
export const MOBILE_CHROME_TWEAK_IDS = [
  "museum-ticket",
  "editorial-accordion",
  "double-bezel",
  "adaptive-ledger",
  "accessible-tray",
  "colly-hybrid",
] as const;

export type MobileChromeTweakId = typeof MOBILE_CHROME_TWEAK_IDS[number];
export function resolveMobileChromeTweak(value: string | null | undefined): MobileChromeTweakId | undefined;
```

Keep profile copy and skill attribution in the same module.

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/mobileChromeTweaks.test.ts`

Expected: PASS.

**Step 5: Commit**

Commit message: `feat: define mobile chrome tweaks`

### Task 2: Wire the query selection through production chrome

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/components/BottomPageNavigator.tsx`
- Modify: `src/components/InteractiveGlobeMap/InteractiveGlobeMap.tsx`
- Modify: `src/hooks/globeLab.test.ts`

**Step 1: Write failing render and source-contract tests**

Render `InteractiveGlobeMap` with `mobileChromeTweak="museum-ticket"` and expect `data-mobile-chrome-tweak="museum-ticket"`. Read `App.tsx` and `HomePage.tsx` and assert the resolved tweak is passed to both chrome surfaces.

**Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/hooks/globeLab.test.ts src/components/mobileChromeTweaks.test.ts`

Expected: FAIL on the missing data attribute and prop wiring.

**Step 3: Implement query resolution and props**

Resolve `new URLSearchParams(location.search).get("tweak")` with the shared resolver in both existing shells. Add typed optional props and data attributes. Do not couple this selection to `visualPreset` or `collyVariant`.

**Step 4: Run focused tests and verify success**

Expected: PASS.

**Step 5: Commit**

Commit message: `feat: wire mobile chrome tweak selection`

### Task 3: Implement six responsive top-control variations

**Files:**
- Modify: `src/components/InteractiveGlobeMap/InteractiveGlobe.css`
- Modify: `src/hooks/globeLab.test.ts`

**Step 1: Write a failing CSS contract test**

Assert the stylesheet contains all six `data-mobile-chrome-tweak` selectors, mobile scroll snap, safe-area positioning, edge masking or clipping guards, 44px targets, and reduced-motion handling.

**Step 2: Run the test and verify failure**

Run: `npx vitest run src/hooks/globeLab.test.ts`

Expected: FAIL on missing variation selectors.

**Step 3: Implement the mobile styles**

Keep all rules under `@media (max-width: 720px)`. Use the existing region button markup and its index, label, and count spans. Give each variation a distinct layout rule rather than a palette swap. Preserve horizontal touch scrolling only where the variation explicitly uses a rail, and hide the scrollbar.

**Step 4: Run the test and verify success**

Expected: PASS.

**Step 5: Commit**

Commit message: `feat: add mobile continent control tweaks`

### Task 4: Implement six Liquid Glass bottom-navigation variations

**Files:**
- Create: `src/components/BottomPageNavigator.css`
- Modify: `src/components/BottomPageNavigator.tsx`
- Modify: `src/components/mobileChromeTweaks.test.ts`

**Step 1: Write a failing render/CSS contract test**

Render each tweak and assert its data attribute. Assert the stylesheet provides a shared web Liquid Glass base, six distinct selectors, safe-area padding, solid transparency fallback, focus-visible state, 44px minimum targets, and reduced-motion handling.

**Step 2: Run the test and verify failure**

Run: `npx vitest run src/components/mobileChromeTweaks.test.ts`

Expected: FAIL because the CSS and class contract do not exist.

**Step 3: Refactor only the mobile branch to stable classes**

Move the existing mobile inline shell, tab, active lens, icon, and label styles into the stylesheet as the default class rules. Leave the desktop branch unchanged. Apply six data-scoped variations and use only transform/opacity for selection motion.

**Step 4: Run the test and verify success**

Expected: PASS.

**Step 5: Commit**

Commit message: `feat: add liquid glass navigation tweaks`

### Task 5: Verify, integrate, and open the variations

**Files:**
- Verify all changed files above.

**Step 1: Run automated verification**

Run:

```bash
npx vitest run src/components/mobileChromeTweaks.test.ts src/hooks/globeLab.test.ts
npx tsc --noEmit
npx vite build
git diff --check
```

Expected: all commands exit 0.

**Step 2: Inspect responsive behavior**

Open every `/interactive?tweak=<slug>` variation and inspect at 375x812, 430x932, 768x1024, and default viewport. Confirm no unintended page-level horizontal overflow, clipped controls, unreachable tabs, or safe-area collision.

**Step 3: Exercise interactions**

For each variation select Europe and Asia, then use all five bottom tabs. Check accessible names, selected state, focus visibility, reduced-motion behavior, and console errors.

**Step 4: Leave the strongest production-oriented variation open**

Open `/interactive?tweak=colly-hybrid` in the in-app browser after verification.
