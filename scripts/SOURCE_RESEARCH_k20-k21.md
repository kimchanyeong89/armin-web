# Source Research — Kunstsammlung NRW (K20/K21), Düsseldorf

**Slug:** `k20-k21`
**Date:** 2026-05-27

## Conclusion
✅ **USABLE — self-site HTML scrape.** The museum runs a dedicated **Collection Online**
portal at `https://sammlung.kunstsammlung.de` ("Collection Online: Masterpieces of the
Kunstsammlung NRW") with one listing page that holds **all 388 works** (no server-side
pagination — every work is a card in the DOM) plus a clean per-work detail page.
Backend is MuseumPlus; the front-end is a static Tailwind site (jQuery, lazysizes,
cblightbox). No public JSON/REST/GraphQL API was found, so we scrape HTML.

## Endpoints
| Purpose | URL |
|---|---|
| Main site collection landing | `https://www.kunstsammlung.de/en/collection` (redirects → K20 On Display; not the catalogue) |
| **Collection Online portal** | `https://sammlung.kunstsammlung.de/en/home` |
| **Works listing (ALL works)** | `https://sammlung.kunstsammlung.de/en/works` |
| Work detail | `https://sammlung.kunstsammlung.de/en/works/{id}` |
| Image (MuseumPlus) | `/museumplus/{imgid}_{hash}.jpg?w={width}` (relative to portal host) |

## Listing structure (`/en/works`)
Every work is an `<article data-id="teaser_work">` with data attributes used for
client-side filtering (filters.js):
- `data-y1` / `data-y2` — created year range
- `data-ya` — acquired year
- `data-mt` — Type & Material term ID (single value, maps to the filter checkboxes)
- `data-k` — keyword/tag term IDs (comma-list)
- `data-a` — artist term ID
- `data-ov` — on-view location (`k20` / `k21`)

The card's first `<img srcset>` is the work thumbnail; the work-id is in
`<a href="/en/works/{id}">`. 388 cards total.

### Type & Material map (`data-mt` → filter label, count)
| mt-ID | label | count | our category | include |
|---|---|---|---|---|
| 169862 | painting | 187 | `painting` | ✅ |
| 169860 | photography | 44 | `photograph` | ✅ |
| 188682 | works on paper | 43 | `drawing`/`print` (refine by material) | ✅ |
| 169852 | collage | 26 | `mixed_media_2d` | ✅ |
| 169869 | new media | 15 | `video` (reject pure installation) | ✅ |
| 169876 | sculpture | 36 | — | ❌ |
| 169866 | installation | 17 | — | ❌ |
| 169875 | relief | 11 | — | ❌ (3D) |
| 169879 | textile art | 9 | — | ❌ |

Flat visual art = 187+44+43+26+15 = **315 candidates**. ("new media" is mostly
single/multi-channel video; a few are video-installations — kept as `video` — but at
least one (w5548) is a pure sculptural room installation and is rejected by material text.)

## Detail page structure (`/en/works/{id}`)
- **Title + date**: `<h1 class="text-h1"><span class="block">TITLE,</span><span class="block">DATE</span></h1>`
- **Artist**: `<p class="text-h2">ARTIST</p>` immediately after `</h1>`
- **Artist birth/death**: in the "Artist" accordion — `<p>NAME</p>` then two `<p>YEAR<br>PLACE</p>` blocks (birth, death)
- **Metadata blocks**: `<h4 class="text-h4">LABEL</h4> <p>VALUE</p>` for:
  `Material/Technique`, `Dimensions`, `Signature`, `Accession Number`,
  `Catalogue Raisonné`, `Acquisition year`
- **On view tag**: `<a href="/en/works/?tag=k20" class="tag"><span>On view at K20</span></a>`
- **Main image (full-res)**: cblightbox `href="/museumplus/{imgid}_{hash}.jpg?w={maxwidth}"`
  (pick the largest `w=`). No `og:image`; detail thumbnails use lazysizes `data-src`,
  so the cblightbox `href` is the reliable full-res source.

No JSON-LD on detail pages.

## Pagination / rate-limit
- No pagination: the single `/en/works` page (1.4 MB) lists all 388 works.
- No robots/rate-limit headers observed; we self-throttle (concurrency 4, small sleeps).

## Image policy
- Download cblightbox max-width JPG → sharp resize 2048 inside, webp q85 → R2.
- No fixed "image not found" placeholder observed (every work card has a real
  MuseumPlus image). audit-images.mjs run post-scrape as the safety net.
