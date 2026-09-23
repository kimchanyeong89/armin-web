# COLLY Redesign Preview Design

## Status

Approved on 2026-07-10. The user asked for all three visual directions to be implemented without further approval prompts.

## Goal

Create a read-only redesign laboratory for COLLY that uses the project's current museum, exhibition, artwork, artist, and community data. The production routes and existing visual system remain unchanged.

## Design read

This is a redesign of an art discovery product for visually literate museum visitors. The interface should feel refined, minimal, readable, and image-led without becoming a generic luxury template.

The three concepts use different composition systems rather than color-only themes:

| Concept | Variance | Motion | Density | Character |
| --- | ---: | ---: | ---: | --- |
| Hybrid editorial | 6 | 4 | 4 | Immersive dark discovery paired with crisp editorial reading surfaces |
| Dark gallery | 7 | 5 | 4 | Cinematic, image-led, spatial, and restrained |
| Light museum | 5 | 3 | 4 | Archival, typographic, quiet, and highly readable |

## Current-state audit

### Preserve

- COLLY wordmark
- Globe-led discovery model
- Existing route labels and core page categories
- Current exhibition, museum, artwork, artist, and community datasets
- Korean and English content where available
- Existing production routes and behavior

### Retire inside the preview

- Low-contrast gray text on near-black surfaces
- Repeated pills and rounded containers with no hierarchy
- Bottom navigation overlapping scrollable content
- Equal visual weight across headings, metadata, filters, and actions
- Dense rows that do not foreground artwork imagery
- Generic loading spinners where a shaped skeleton communicates structure better

## Isolation architecture

The preview is selected at the application entry point only when the pathname begins with `/redesign`. All existing paths continue to render the current `App` component.

Preview routes:

```text
/redesign
/redesign/hybrid/:view/:id?
/redesign/dark/:view/:id?
/redesign/light/:view/:id?
```

Supported views:

```text
home
search
ai
community
exhibitions
profile
work
artist
exhibition
```

The preview contains 27 concept-view combinations. A compact concept switcher keeps the same view and record id when moving between concepts.

## Data flow

One adapter derives preview-ready records from existing sources:

- `src/data/exhibitions.ts` for museums and exhibition records
- inline exhibition artworks for artwork and artist records
- `src/data/sampleCommunityPosts.ts` for stable community preview content

No duplicate fixture dataset is introduced. Selectors provide deterministic fallbacks when a requested id is missing. The preview never writes to Firebase, authentication state, payments, likes, playlists, or community posts.

## Shared information architecture

Each concept uses the same content contract so the visual comparison is meaningful:

- Home: current exhibitions, museums, and one featured artwork
- Search: query control, type filters, artwork results, and museum results
- AI: selectable artwork taste set and recommendation result state
- Community: topic filters and current post summaries
- Exhibitions: ongoing and upcoming exhibition records
- Profile: read-only collection composition using current artwork records
- Work: one artwork, metadata, related works, and its exhibition context
- Artist: artist summary and works grouped from current artwork data
- Exhibition: cover, dates, museum, description, and included works

## Visual systems

### Hybrid editorial

- Surfaces: carbon `#111210`, chalk `#F3F0E9`, ink `#171816`
- Accent: muted chartreuse `#A5B85D`
- Type: system-local modern grotesk with a restrained editorial serif only for artwork and exhibition titles
- Shape rule: 14px structural containers, full-pill controls only
- Signature: the content surface changes from dark image immersion to a light reading sheet once per view
- Layout: asymmetric editorial split with one dominant artwork and a narrow contextual rail

### Dark gallery

- Surfaces: coal `#0A0B0B`, graphite `#151817`, smoke `#242825`
- Accent: mineral gold `#C5A55A`
- Type: wide grotesk display, neutral sans body, tabular utility labels
- Shape rule: 2px to 8px radii, never large soft cards
- Signature: a horizontal collection rail that behaves like a gallery wall
- Layout: image field plus precise control deck and edge-aligned metadata

### Light museum

- Surfaces: porcelain `#F4F5F1`, paper `#E8EBE4`, white `#FCFCFA`
- Accent: cobalt `#3156A3`
- Type: publication serif for titles, highly readable sans for navigation and body
- Shape rule: square sheets, 6px controls, no pill containers except filters
- Signature: catalogue folios with running titles and page-like image placement
- Layout: disciplined columns, strong baseline rhythm, and restrained rules

## Interaction and motion

- Motion communicates view changes, selection, or hierarchy only.
- All animations use transforms and opacity.
- Micro-interactions stay between 160ms and 300ms.
- Concept transitions use one short fade and translate sequence.
- `prefers-reduced-motion` removes transforms and animated scrolling.
- Hover never carries required information; click and keyboard states are complete.

## Accessibility

- Skip link to the main preview content
- Semantic `header`, `nav`, `main`, `section`, `article`, and `button` elements
- Visible `:focus-visible` treatment in each concept accent color
- Minimum 44px touch targets
- Minimum 16px mobile body text and 1.5 line height
- Descriptive image alt text from artwork, artist, museum, and exhibition data
- Active concept and view exposed with `aria-current`
- Selected artwork filters exposed with `aria-pressed`
- Body text targets WCAG AA contrast

## Loading, empty, and error states

- The preview route has a concept-colored skeleton while its code chunk loads.
- Missing ids resolve to a designed not-found panel with links to valid records.
- Broken external images fall back to a neutral title panel without hiding metadata.
- Empty result filters explain how to restore results.

## Testing

- Unit tests cover route parsing, route generation, data normalization, and deterministic fallbacks.
- TypeScript and Vite build verify integration with the existing application.
- Browser checks cover all 27 paths at desktop and representative paths at 375px mobile.
- Keyboard, focus, reduced motion, overflow, image failure, and console error checks are included.

