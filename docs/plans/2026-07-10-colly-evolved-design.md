# Evolved COLLY design

## Goal

Redesign COLLY without asking existing users to relearn it. Preserve the current application's spatial grammar and interaction landmarks, then improve hierarchy, readability, artwork presence, and consistency in a separate read-only experience.

## Current framework to preserve

- A full-screen dark canvas rather than a scrolling editorial homepage.
- COLLY wordmark at top left, collection counts and filters at the top, language/account utilities at the right.
- A centered globe as the default view.
- A persistent floating bottom navigator with Globe, Community, AI, Profile, Search, and a compact more control.
- One functional panel replaces another within the same shell.
- Exhibitions open into an artwork-rich overlay instead of navigating through a conventional card site.

## Approaches considered

1. **Import the production components unchanged.** Highest fidelity, but brings authentication, likes, production routing, data loaders, and existing layout debt into a preview.
2. **Build a parallel shell from the same interaction grammar.** Chosen. It preserves recognition while keeping the study read-only and easy to change.
3. **Restyle the earlier Hybrid/Dark/Light studies.** Lowest effort, but their page-first navigation remains unfamiliar and does not solve the user's concern.

## Visual system

- **Ink** `#0b0c0b`: full-screen ground.
- **Carbon** `#141613`: panels and raised controls.
- **Bone** `#e8e6df`: primary text.
- **Museum gold** `#c8a35d`: one functional accent carried from current COLLY.
- **Fog** `#8c9189`: metadata and secondary labels.
- **Hairline** `rgba(232,230,223,.14)`: structure without card outlines.

Typography keeps the current utilitarian sans and monospaced data labels, then uses a restrained museum serif only for artwork and exhibition titles. The memorable element is not a decorative hero: it is the globe-to-archive transition, where a geographic point opens a museum ledger of real works.

## Layout

```text
┌ COLLY ───── 1,067,150 artworks · 290 museums ─── KR / EN ┐
│                                                            │
│       region/filter rail or panel-specific controls         │
│                                                            │
│                 active full-screen panel                   │
│          globe / community / AI / profile / search         │
│                                                            │
│       [ Globe  Community  AI  Profile  Search  ··· ]       │
└────────────────────────────────────────────────────────────┘

Exhibition selection → fixed archive overlay → work detail
```

## Panels

- **Globe:** actual museum coordinates, current region filters, museum selector for dense cities, selected museum ledger.
- **Community:** current topics and post data in the existing compact list structure, with clearer columns and preview hierarchy.
- **AI:** current select-artworks mental model, real work imagery, visible selected count, related route.
- **Profile:** read-only collection overview using current artwork, artist, museum, and exhibition counts.
- **Search:** the existing search-first surface with scoped filters, ranked museums, and real artwork results.
- **Work:** a focused full-screen work record inside the same shell.

## Safety and data

The experience lives at `/redesign/evolved`. It reads the existing normalized preview data and performs no authentication, Firebase, like, payment, profile, or collection writes. Existing production routes and the three earlier research directions remain available.

## Verification

- Route and shell contracts for all panels.
- Actual counts and real records visible in each panel.
- Exhibition modal and work-detail deep links.
- Desktop and mobile browser checks for the persistent shell, overflow, keyboard focus, touch targets, and modal behavior.

