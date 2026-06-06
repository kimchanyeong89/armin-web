# SOURCE RESEARCH — MAXXI (Museo nazionale delle arti del XXI secolo), Rome

- **Slug:** `maxxi`
- **Start URL:** https://www.maxxi.art
- **Date:** 2026-06-02
- **Conclusion:** **ESCALATE** — no per-artwork online catalogue exists on the museum's own website. Per-artwork browsing is delegated to Google Arts & Culture (third-party aggregator, forbidden by HARD RULE 1).

## Platform
WordPress (All in One SEO). Italian/English bilingual under `/` (it) and `/en/`.

## What was probed

### 1. wp-json content types — NO artwork CPT
`GET /wp-json/wp/v2/types` → only: `post`, `page`, `attachment`, `event`.
`GET /wp-json/` REST routes (content-bearing): `posts`, `pages`, `event` only (plus taxonomies
`categories`, `tags`, `event-tags`, `event-categories`, `cat-laboratori`).
There is **no** `artwork` / `opera` / `object` / `collezione` custom post type.

### 2. Sitemaps — NO collection sitemap
`GET /sitemap.xml` index lists only:
`page-sitemap`, `event-sitemap1..5`, `editoria-sitemap` (publishing), `bandi-di-gara-sitemap`
(public tenders), `programmi-educativi-sitemap` (education programmes), `post-archive-sitemap`,
`event-categories-sitemap`.
Directly probed `opera-sitemap.xml`, `opere-sitemap.xml`, `artwork-sitemap.xml`,
`collection-sitemap.xml`, `collezione-sitemap.xml`, `object-sitemap.xml` → all **404**.

### 3. URL probes — no per-work path
- `/en/collection`, `/opere`, `/collezione-arte`, `/en/the-collection`, `/en/maxxi-collection`,
  `/opera/`, `/en/opera/` → 404 or redirect to an editorial/event page.
- `/collezione/` and `/en/collezione/` both **301 → `/collezione-design/`** (a single editorial
  landing page, design-focused).
- `/en/arte/` exists but its only host-internal link is back to itself (stub/redirect page).

### 4. Collection landing pages are editorial, not catalogues
Homepage `/en/` exposes only two collection links: `/en/collezione-fotografia/` (Photography
Collections) and `/en/collezioni-architettura/` (Architecture Collections), plus archive-centre
pages. Fetched `/en/collezione-fotografia/` (121 KB): outbound links are **only** site
navigation / info / membership / events — **zero** links to individual artwork records. No
`<iframe>`, no `/opere/` item markup, no embedded catalogue widget. Body is curatorial prose +
upcoming-exhibition announcements.

### 5. Subdomains — none
`collezione.`, `catalogo.`, `collection.`, `opere.`, `archivio.`, `data.`, `api.`.maxxi.art all
fail to resolve / connect (HTTP 000).

### 6. Per-artwork browsing is on Google Arts & Culture (forbidden)
`/en/google-art-project/` links out to
`google.com/culturalinstitute/collection/maxxi-museo-nazionale-delle-arti-del-xxi-secolo`.
MAXXI's individual-artwork imagery and metadata are published **only** via Google Arts & Culture,
a third-party aggregator that HARD RULE 1 prohibits using.

## Why escalate (not collect)
- No JSON API, IIIF manifest, bulk export, internal JSON endpoint, or HTML detail page for
  individual artworks exists on `maxxi.art`.
- The 4-MUST (title / artist / year / category parsed from a per-artwork **detail record**)
  cannot be satisfied because no such records are served by the self-site — only editorial pages
  and event listings.
- The only per-work source is Google Arts & Culture, which is off-limits.

**Escalation reason:** no per-artwork online catalogue on the museum's own website; per-artwork
data delegated to Google Arts & Culture (forbidden aggregator).
