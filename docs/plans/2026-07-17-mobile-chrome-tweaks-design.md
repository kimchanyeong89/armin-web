# Mobile Chrome Tweak Variations

## Goal

Provide six independently selectable mobile chrome variations for the production interactive globe. Change only the continent control at the top and the primary navigator at the bottom. Preserve the globe renderer, data, country boundaries, markers, routes, and existing product palette.

## Delivery model

Each variation is selected with `/interactive?tweak=<slug>`. The default `/interactive` remains unchanged until a variation is chosen for production.

The six slugs are:

- `museum-ticket`: frontend-design
- `editorial-accordion`: design-taste-frontend
- `double-bezel`: high-end-visual-design
- `adaptive-ledger`: redesign-existing-projects
- `accessible-tray`: ui-ux-pro-max
- `colly-hybrid`: design-system-builder

## Shared constraints

- Existing React, Framer Motion, Lucide, and vanilla CSS remain the only implementation system. No dependency is added.
- Mobile controls use safe-area insets and stable viewport units.
- Touch targets are at least 44px. Focus remains visible and every tab keeps an accessible name.
- Motion communicates selection continuity only and disables under `prefers-reduced-motion`.
- Liquid Glass is an honest web approximation using translucent layers, backdrop blur, inner highlights, and a high-contrast solid fallback.
- Narrow layouts prioritize labels and selection state instead of shrinking the desktop controls uniformly.

## Variations

### Museum Ticket

The continent list becomes a horizontal sequence of ticket-like cells with scroll snap and clipped perforation cues. The bottom navigator becomes an optical lens dock where the selected item receives the label and inactive items remain concise icons.

### Editorial Accordion

Only the selected continent expands to show its complete label and count; the remaining tabs compress to short geographic codes. The bottom navigator is a low-profile glass film strip with one expanding active segment.

### Double Bezel

The top separates the current region from its compact region dial as two floating islands. The bottom uses a nested outer tray and inner glass core with concentric radii and a springing selection lens.

### Adaptive Ledger

The existing Margin Ledger is retained but reorganized into a scroll-snap rail with edge masks and a clearer active underline. The bottom bar is full-width on the narrowest devices and becomes a detached pill when enough inline space exists.

### Accessible Tray

All region and route labels stay explicit. The top uses 44px region targets with strong selected-state contrast. The bottom uses five equal 48px targets, restrained transparency, and redundant icon-plus-label selection cues.

### COLLY Hybrid

The current COLLY type, gold accent, spacing scale, and interaction language are consolidated into the most production-oriented option. The top is a compact current-region row above a measured swipe rail; the bottom is a light-refraction capsule with a stable five-column grid.

## Architecture

Define tweak ids and metadata in one module. Resolve the query parameter once in the application shell and pass the selected id to `BottomPageNavigator` and `InteractiveGlobeMap`. Both components expose a data attribute and stable class names; a dedicated stylesheet owns the variation rules. Existing default styles remain the fallback.

## Verification

- Unit-test tweak id validation and the production query contract.
- Render-test all six data attributes without enabling COLLY globe variants.
- Run focused globe and navigation tests, TypeScript, and the production build.
- Inspect 375px, 430px, 768px, and the default desktop viewport.
- Exercise region selection and every bottom tab at mobile width, check focus, overflow, safe-area spacing, reduced-motion CSS, and console errors.
