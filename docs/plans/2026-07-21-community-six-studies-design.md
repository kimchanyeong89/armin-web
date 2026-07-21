# COLLY Community Six Studies — Design

## Objective

Extend the existing COLLY redesign site with six complete community studies while preserving the production community's real behavior: remote posts with sample fallback, latest/popular sorting, six categories, review subject filters, nearby exhibitions, post navigation, writing, likes, comments, localization, theme behavior, and responsive layouts.

Also refine the Atlas city-detail transition so the minimap reveals after the statement-to-panel morph and the museum rows enter in a restrained stagger.

## Architecture

- Keep community data rules authoritative in a small shared feature module used by the production page and the redesign studies.
- Add a dedicated `/redesign/community/:study` route family inside the existing `RedesignApp`.
- Use one functional study shell for state, filtering, Firestore fallback, navigation, theme, and language.
- Give each study a separate semantic renderer and root class. CSS changes layout, density, typography, image treatment, and motion without duplicating data rules.
- Continue to use the existing production write and detail routes so publishing, liking, commenting, rich editing, subject selection, and `@` attachments remain real rather than mocked.

## Six studies

1. **Living Archive** (`redesign-existing-projects`) — Atlas-style editorial ledger with topic index, reading stream, and activity rail.
2. **Salon Stream** (`frontend-design`) — asymmetric conversational feed led by one active discussion and a flowing salon rail.
3. **Critics' Index** (`design-taste-frontend`) — numbered criticism index with typographic columns and margin annotations.
4. **Afterimage Gallery** (`high-end-visual-design`) — cinematic image field with masked media reveals and quiet text overlays.
5. **Civic Forum** (`ui-ux-pro-max`) — accessible, information-dense forum with explicit state, keyboard focus, and mobile filter trays.
6. **Collection Grid** (`design-system-builder`) — token-led modular collection with list/mosaic rhythm and consistent component states.

## Interaction contract

- Study switcher exposes all six versions without covering primary controls.
- Latest/popular, category, review subject, nearby, write, and post actions remain interactive in every study.
- Loading and empty states use the same semantic status region in all variants.
- Images remain meaningful and include alt text.
- `prefers-reduced-motion` removes stagger and reveal transforms.
- At desktop width, Atlas city detail replaces the statement slot; the minimap reveals first, followed by museum rows at roughly 30ms intervals. Mobile retains the existing full-width panel behavior.

## Verification

- Contract tests cover route enumeration, shared functionality, all six study renderers, navigation targets, and reduced-motion CSS.
- Atlas tests cover minimap reveal and capped list staggering.
- Browser checks cover all six desktop studies, at least one mobile viewport, category/sort switching, nearby view, post navigation, and the Atlas Paris panel.
- Full Vitest suite, TypeScript build, Vite production build, and `git diff --check` must pass.
