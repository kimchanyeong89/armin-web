# Globe Lab redesign

## Goal

Keep the production globe at `/` unchanged while creating five complete, independently reviewable globe-page candidates under `/globe-lab`.

Each candidate must reuse the existing D3 globe behavior and current exhibition data. Visual differences may extend into country fills, borders, labels, museum marks, information hierarchy, typography, controls, and responsive composition.

## Success criteria

- `/` and the existing `/interactive` routes retain their current behavior.
- `/globe-lab` lists all five candidates and links to a stable URL for each.
- Every candidate uses the same shared globe interaction and data path rather than a copied map implementation.
- Drag rotation, wheel or pinch zoom, geographic drill-down, city selection, venue details, and exhibition opening remain usable.
- Desktop and mobile layouts are intentionally composed, keyboard controls have visible focus, touch targets are at least 44px where practical, and reduced-motion preferences are respected.
- Type checking, targeted tests, production build, and browser checks pass.

## Architecture

The existing `InteractiveGlobeMap` and `Globe` components remain the source of truth for map state, data transformation, and interactions. Optional presentation props expose a lab skin and route behavior without changing the production defaults.

`GlobeLabApp` owns the isolated `/globe-lab` router, comparison index, shared page frame, and candidate metadata. The five routes select a typed visual preset. CSS variables and narrowly scoped skin selectors provide most visual variation; a small globe-render preset controls the map-specific values that CSS cannot reach, such as land fill, borders, labels, and markers.

This keeps behavior orthogonal to presentation and makes a selected candidate cheap to promote later.

## Routes

- `/globe-lab` — comparison index
- `/globe-lab/editorial-atlas` — `design-taste-frontend`
- `/globe-lab/signal-observatory` — `frontend-design`
- `/globe-lab/nocturne` — `high-end-visual-design`
- `/globe-lab/colly-evolved` — `redesign-existing-projects`
- `/globe-lab/accessible-atlas` — `ui-ux-pro-max`

The lab is selected before the production application mounts, following the existing isolated redesign-preview pattern.

## Candidate directions

### Editorial Atlas

An asymmetric, print-led composition with warm paper, indigo, and vermilion. The globe may crop beyond the viewport, while coordinates, country names, and discovery counts read as editorial annotations. Motion is deliberate and restrained rather than decorative.

### Signal Observatory

A dark cartographic instrument with acid green and cyan signals. Monospaced telemetry, calibrated rules, and plotted museum marks create the feel of a contemporary observation room without turning the interface into a dense dashboard.

### Nocturne

A museum-night experience using black, oxblood, and champagne tones. Fine metallic borders, constellation-like venue marks, high-contrast serif display type, and quiet transitions create a premium, cinematic atmosphere.

### COLLY Evolved

The realistic product candidate. It preserves the current dark globe's recognizable composition and interaction model while clarifying hierarchy, region filtering, selection states, panels, and mobile reachability.

### Accessible Atlas

A legibility-first atlas using mineral gray, deep blue, and orange. It prioritizes high contrast, explicit active states, readable labels, large touch targets, clear instructions, and a mobile-friendly information sheet.

## Shared interaction model

All candidates retain the current interaction sequence:

1. Rotate and zoom the world.
2. Hover or focus geographic regions to see counts.
3. Drill from continent to country, then select a city or museum mark.
4. Inspect venues in the existing panel.
5. Open the existing exhibition experience and return to the same candidate.

Lab navigation and a return-to-index action sit outside map state so changing candidates does not duplicate or alter map logic.

## Responsive behavior

Desktop candidates can use asymmetric framing, side rails, and intentionally offset globes. At tablet and phone sizes, content collapses into a single map stage with a compact header and bottom-reachable controls. Decorative copy yields before map interaction area. Safe-area insets are respected.

## Accessibility and motion

- A skip link targets the map stage.
- Icon-only controls receive accessible names.
- Focus indicators remain visible in every palette.
- Text and essential map labels meet readable contrast targets.
- `prefers-reduced-motion` disables ornamental transitions while preserving state changes.
- Interaction does not depend solely on hover or color.

## Verification

Add route and render contract tests before implementation. Verify production-route isolation, all candidate routes, shared-map reuse, candidate labels, and default presentation behavior. Then run type checking, targeted tests, the production build, and browser checks at desktop and mobile widths.

