# Source Research: Astrup Fearnley Museet (Oslo)

**Slug**: `astrup-fearnley`
**Website**: https://www.afmuseet.no/en/collection/  (artwork archive: https://www.afmuseet.no/en/artwork/)
**Phase A date**: 2026-06-04
**Conclusion**: ✅ **VIABLE** — museum-OWN WordPress REST API (custom post type `artwork`). Sample fetched with full metadata + full-size image. Proceed to Phase B (100-record pilot).

---

## Working source — WordPress REST API (own infra, no key)

WordPress multisite. `wp-json` root exposes namespaces incl. custom `afm/v1` + SearchWP `swp_api`. The collection is a **custom post type `artwork`** exposed via standard `wp/v2`:

```
GET https://www.afmuseet.no/wp-json/wp/v2/artwork?per_page=100&page={N}&_embed
```

- **Auth**: none. Plain UA header is enough (no Cloudflare/bot block). HTTPS forced.
- **Total**: `X-WP-Total: 476` artworks, `X-WP-TotalPages` per per_page. Use `per_page=100` → ~5 pages.
- **Pagination**: `page` query param; `Link: <...page=2>; rel="next"` header; totals in `X-WP-Total` / `X-WP-TotalPages` response headers.
- **`_embed`** is essential — it inlines featured media (full image) + taxonomy terms (artist, year) so each record is self-contained in ONE request.

### Per-record field shapes (with `_embed`)

| ARMIN field | Source location | Example (id 10168) |
|---|---|---|
| `id` | `id` (also `slug`) | `10168` / `jackie-me` |
| `sourceUrl` | `link` | `https://www.afmuseet.no/kunstverk/jackie-me/` |
| `title` | `title.rendered` (HTML-entity encoded; **title string usually includes the year**, e.g. `"Jackie &amp; Me, 1989"`) | `Jackie & Me, 1989` |
| `artist` | `_embedded["wp:term"]` → group whose `taxonomy == "artist"` → `name` | `Lutz Bacher` |
| `year` | `_embedded["wp:term"]` → `taxonomy == "artwork-year"` → `name` (also `artwork-year` ID array on the record) | `1989` |
| `medium` | `meta.afm_artwork_technique` — **NORWEGIAN** | `Xerox-trykk på papir` |
| `dimensions` | `meta.afm_artwork_dimensions` — **NORWEGIAN** | `Variable mål` |
| image (full) | `_embedded["wp:featuredmedia"][0].source_url` and `.media_details.sizes.full.source_url` | `.../content/uploads/sites/2/2024/12/AF-01660-scaled.jpg` (2560×1920) |
| (orig HTML) | `content.rendered` also embeds the same `<img src>` + `srcset` (fallback if `_embedded` missing) | — |

- `meta` also has: `afm_artwork_location`, `afm_artwork_copyright` (often empty), `afm_hide_title`.
- Taxonomy routes: `wp/v2/artist_tax/{id}`, `wp/v2/artwork-year/{id}`, `wp/v2/artwork-category/{id}`. (Note: on the *record* the artist key is `artist_tax`, but the *embedded term*'s `taxonomy` field reads `artist`.)

### Image — confirmed real full-size
`HEAD .../AF-01660-scaled.jpg` → `HTTP/2 200`, `content-type: image/jpeg`, `content-length: 236079`. Sizes available: `full` (= `-scaled.jpg`, up to 2560px long edge), `2048x2048`, `1536x1536`, `large`, `medium_large`, `medium`, `thumbnail`. Use `sizes.full.source_url` (or top-level `source_url`). Images live on the museum's own host under `/content/uploads/sites/2/...`.

---

## Scope (flat works) estimate

- **476 total** artwork records.
- `artwork-category` taxonomy is effectively **unused** (1 term "Olje på lerret", count=0) → **category does NOT classify medium**. Scope filtering must **parse `afm_artwork_technique` text** (Norwegian).
- Heuristic tally over a 100-record sample: ~**70 clearly flat** (painting/photo/print/video/drawing), ~22 sculpture/3D (`rustfritt stål`, `polyuretanharpiks…`, free-standing objects), ~8 ambiguous. Several "ambiguous"/excluded entries are actually 2D wall works (Bjarne Melgaard fabric/sequin tapestries, textile-on-paper), so flat share is likely **~75–80%**.
- **Est. in-scope flat works ≈ 333–380** (paintings + photographs + video + works-on-paper + 2D textile). Paintings specifically: large share of the flat set (oil/acrylic på lerret/lin recur most).

### Norwegian medium vocab seen (for scope mapping)
- Paintings: `olje på lerret/lin`, `akryl på lerret/tekstil`, `olje og akryl på lerret`, `blandet teknikk` (mixed media), `tempera`, `akvarell`.
- Photographs: `c-print (på kodak endura papir)`, `lambdatrykk`, `arkivbestandig fibertrykk`, `montert lambatrykk`.
- Works on paper: `kull på papir` (charcoal), `collage/blyant/pigment på papir`, `sumi-e blekk … på papir`, `xerox-trykk på papir`.
- Video: `en-kanals videoprojeksjon med lyd` (single-channel video projection w/ sound).
- 2D textile: `broderi` (embroidery), `billedvev` (tapestry), `tekstil og pigment på japanpapir`.
- **Exclude (3D)**: `rustfritt stål` (stainless steel), `polyuretanharpiks, tre og oljemaling`, free-standing `…harpiks`/`bronse`/`marmor`.

---

## Notes / caveats for the scraping agent

1. **Language**: all `medium` + `dimensions` text is **Norwegian only**. The `/en/wp-json/...` blog does NOT carry these artwork records (returns null for id 10168). Store technique/dimensions as-is (guide §2 = original text), or translate at display time. Titles are bilingual-ish (many English, some Norwegian) and contain the year suffix — may want to strip `, {year}` from title since `year` is separate.
2. **Artist** is NOT a meta field — read it from the embedded `wp:term` group (`taxonomy=="artist"`). With `_embed` you avoid a second request per artwork.
3. **Scope filter**: classify each record by keyword-matching `afm_artwork_technique`; exclude clear 3D (`stål`, `harpiks`, free-standing resin/bronze/marble). Per guide, **keep all paintings (no cap)**; photo/print/works-on-paper/video are all in-scope here (collection is contemporary, ~476 total — small, take everything flat).
4. **Pilot**: pull `per_page=100&page=1&_embed`, build 100 records, run `validate-metadata.mjs astrup-fearnley` + `audit-images.mjs`. 4-required (title/artist/year/category) all derivable; `medium` + `dimensions` fill ~100% from meta.
5. Rate-limit: small corpus (5 pages at per_page=100). 1 req/sec is ample.

### Verified sample record (copy-paste truth)
```
id: 10168  slug: jackie-me
title: "Jackie & Me, 1989"
artist: Lutz Bacher        (embedded wp:term, taxonomy=artist, slug lutz-bacher)
year: 1989                 (embedded wp:term, taxonomy=artwork-year)
medium: Xerox-trykk på papir
dimensions: Variable mål
sourceUrl: https://www.afmuseet.no/kunstverk/jackie-me/
image (full): https://www.afmuseet.no/content/uploads/sites/2/2024/12/AF-01660-scaled.jpg  (2560×1920, 236 KB, image/jpeg, 200)
```
