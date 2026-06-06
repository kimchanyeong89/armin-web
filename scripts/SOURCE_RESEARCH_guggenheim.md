# SOURCE RESEARCH — Solomon R. Guggenheim Museum (slug: `guggenheim`)

**Date:** 2026-06-05
**Homepage:** https://www.guggenheim.org/collection-online
**Verdict:** ✅ VIABLE (museum-own, no key) — but **metadata-thin**. Use the WordPress REST API.

---

## TL;DR for the next (scraping) agent

- Data source = the museum's own **WordPress REST API** at `https://www.guggenheim.org/wp-json/wp/v2/artwork`. **No API key, no auth, public.** CORS-open (`access-control-expose-headers` present).
- The collection-online site is **WordPress on Pantheon** (`x-pantheon-styx-hostname`, `link: .../wp-json/`). Individual artwork pages `/artwork/{slug}` are a **JS SPA shell** — do NOT scrape the HTML (no server-rendered tombstone; og: tags are template placeholders). All usable data is in the REST API.
- Total artworks: **X-WP-Total = 2016**. In-scope flat works ≈ **1,272** (Painting 581 + Photography 373 + Work on paper 220 + Film/Video 98). **Paintings = 581 (collect all, no cap).**
- Per-record you GET: `id`, `slug`, `title`, `featured_media` (image), and taxonomy terms `artist`, `decade`, `artwork_type`, `site`, `movement`, `special_collection`. **That's it.**
- ⚠️ **`medium` and `dimensions` are NOT available anywhere public.** `content`/`excerpt` are EMPTY/template. The only date signal is **`decade`** (e.g. "2010s") — there is **no exact year/date string**. The only category/medium signal is the 7-value `artwork_type` taxonomy. The rich tombstone (medium, dimensions, credit line, accession) lives only behind the key-walled `api.guggenheim.org` Collections API (see "Dead ends").
- 4-MUST fields are satisfiable: **title** ✓, **artist** ✓ (term), **year** ✓ (derive from `decade` → use decade-start integer, e.g. "2010s"→2010), **category** ✓ (map `artwork_type` → our enum). `medium`/`dimensions` stay `""` (SHOULD per guide — record kept).
- Images: WordPress uploads at `https://www.guggenheim.org/wp-content/uploads/...`. **Modest resolution** — `full` size long-edge caps ~1280px on most works (`_web` derivatives); ~58% are ≥1000px wide, some are 490px. Usable for grid/SigLIP but not high-res.

---

## Working endpoints (all GET, no auth)

### 1. List artworks (paginated)
```
GET https://www.guggenheim.org/wp-json/wp/v2/artwork?per_page=100&page={1..21}&_embed=1
Headers: (none required)  User-Agent: a normal browser UA is polite but not required
```
- `per_page=100` is the max (X-WP-TotalPages=21 for the full 2016).
- `_embed=1` is **essential** — it inlines `_embedded.wp:featuredmedia[0]` (image + `media_details.sizes`) and `_embedded.wp:term` (artist/decade/artwork_type names + slugs). Without it you only get term IDs and must resolve them separately.
- Pagination: read `X-WP-Total` / `X-WP-TotalPages` response headers. Standard WP `page=` offset paging.

### 2. Filter by category (recommended — scrape only in-scope types)
```
GET .../wp-json/wp/v2/artwork?artwork_type={termId}&per_page=100&page={n}&_embed=1
```
Term IDs (verified via `/wp-json/wp/v2/artwork_type?per_page=100`):

| artwork_type | term id | slug | count | our `category` |
|---|---|---|---|---|
| **Painting** | **1811** | painting | **581** | `painting` |
| Photography | (resolve) | photography | 373 | `photograph` |
| Work on paper | (resolve) | work-on-paper | 220 | `drawing` (or split print/drawing if title hints) |
| Film/Video | (resolve) | filmvideo | 98 | `video` |
| Sculpture | — | sculpture | 265 | ❌ skip (out of scope) |
| Installation | — | installation | 149 | ❌ skip |
| Internet Art | — | internet-art | 3 | ❌ skip |

(Only Painting id 1811 was pinned; resolve the rest from the `/artwork_type` list — each object has `id`+`slug`+`count`.)
Verified: `?artwork_type=1811&per_page=1` → `X-WP-Total: 581`. ✅

### 3. artwork_type vocabulary
```
GET https://www.guggenheim.org/wp-json/wp/v2/artwork_type?per_page=100
```
Returns the 7 terms above with counts. This is the authoritative category map.

### 4. Artist taxonomy (for bios/dates if wanted)
```
GET https://www.guggenheim.org/wp-json/wp/v2/artist/{id}
```
Artist terms carry `name` + (via the custom search endpoint) life dates `{begin,end,display:"b. 1866, Moscow; d. 1944, ..."}`. The `_embedded.wp:term` artist entry in the artwork response gives `name` + `slug` + `id`, which is enough for our `artist` field.

### 5. Custom search (mixed results — NOT for bulk; useful for spot lookups)
```
GET https://www.guggenheim.org/wp-json/guggenheim/v1/search?s={query}
```
Returns `{posts:[...]}` mixing `artist` / `exhibition` / `artwork` types. Less per-artwork metadata than #1. ⚠️ The standard `?search=` param on `/wp/v2/artwork` is unreliable — it matched blog posts/research records, not artworks. **Use ID/type-filtered listing (#1/#2), not search, for the bulk scrape.**

---

## Example record (id 126997, slug 35756) — the COMPLETE field shape

`GET /wp-json/wp/v2/artwork/126997` and the `_embed=1` listing yield:

```jsonc
{
  "id": 126997,
  "slug": "35756",                         // → sourceUrl https://www.guggenheim.org/artwork/35756
  "link": "https://www.guggenheim.org/artwork/35756",
  "title": { "rendered": "Untitled" },     // ← our title (decode HTML entities, e.g. &#8217; → ’)
  "content": { "rendered": "" },           // ⚠️ EMPTY (always)
  "excerpt": { "rendered": "Learn about this artwork by [name]..." },  // ⚠️ template placeholder, useless
  "featured_media": 126998,
  "artist": [7365], "decade": [4617], "artwork_type": [], "site": [4582],
  "movement": [], "special_collection": [], "categories": [5197],
  "_embedded": {
    "wp:featuredmedia": [{
      "source_url": "https://www.guggenheim.org/wp-content/uploads/2000/01/2017.9_ph_web.jpg",  // ← imageUrl (full)
      "media_details": { "width": 960, "height": 1280,
        "sizes": { "full": {...960x1280}, "large": {...768x1024}, "guggenheim-870": {...}, ... } }
    }],
    "wp:term": [
      [{ "taxonomy": "category", "name": "Permanent Collection" }],
      [{ "taxonomy": "artist",  "name": "Vivian Suter", "slug": "vivian-suter", "id": 7365 }],  // ← artist
      [{ "taxonomy": "decade",  "name": "2000s", "slug": "2000s", "id": 4617 }],                // ← year=2000
      [{ "taxonomy": "site",    "name": "Solomon R. Guggenheim Museum", "slug": "solomon-r-guggenheim-museum" }]
    ]
  }
}
```

Real painting examples (artwork_type=1811): `"SP257" — Sterling Ruby — 2010s — 1144×1280`; `"Ovitz’s Library" — Jonas Wood — 2010s — 1200×905`; `"F-16" — Norberto Roldan — 2010s — 1280×641`. Titles/artists/decades/images are reliably populated.

### Field mapping → our schema (§2 of COLLECTION_SCRAPING_GUIDE)
| our field | source | notes |
|---|---|---|
| `id` | `"guggenheim-" + slug` | slug is the museum accession-ish id (e.g. 35756). Prefix per Phase F-0. |
| `objectNumber` | slug | |
| `title` | `title.rendered` | **decode HTML entities** (`&#8217;`→’ etc). "Untitled" is legit. |
| `artist` | `_embedded.wp:term` taxonomy=`artist` → `name` | join multiple with `; ` |
| `year` | `decade` term name → strip "s", parse int | "2010s"→2010. ⚠️ only granularity available |
| `date` | `decade` name | e.g. "2010s" (no finer date exists) |
| `category` | map `artwork_type` slug → enum (table above) | if `artwork_type` empty (~10%), infer or skip |
| `medium` | `""` | ⚠️ NOT available publicly |
| `dimensions` | `""` | ⚠️ NOT available publicly |
| `imageUrl` | `_embedded.wp:featuredmedia[0].source_url` (`full` size) | then R2 (Phase D) |
| `original_imageUrl` | same | |
| `sourceUrl` | `link` (`https://www.guggenheim.org/artwork/{slug}`) | |

---

## In-scope estimate
- **Paintings: 581** (collect all — no cap per guide).
- Photography 373, Work on paper 220, Film/Video 98 → **flat total ≈ 1,272**. Apply value-filter to works-on-paper/photo if desired (low-res <400px exists; ~42% of sampled images were <1000px wide — filter the genuinely tiny ones). Paintings: no filter.
- ~10% of records have empty `artwork_type` (45/50 in sample) — either resolve via title heuristic or drop those (can't assign category).

## ⚠️ Pilot caveat (flag for Phase B)
- **6-standard fill will FAIL the ≥80% bar**: `medium` and `dimensions` are 0% (site does not expose them publicly). This is a genuine **site limitation**, not a parser bug — verified by (a) empty `content`/`excerpt` in API, (b) the `/artwork/{slug}` page being a JS SPA with no SSR tombstone, (c) og: tags being template text. Per guide §2 these are SHOULD → records are still kept with `medium=""`/`dimensions=""`. **The 4-MUST (title/artist/year/category) DO pass.** Decide with the user whether thin metadata (no medium/dims, decade-only dates) clears the bar for this collection before full scrape.
- **Images are modest** (long edge ~1280px max on most; some 490px). Fine for grid + SigLIP; not high-res. Run `audit-images.mjs`; drop any <400px long-edge.

---

## Dead ends (do NOT pursue)
- **`api.guggenheim.org/collections/`** (the official Collections API; GitHub `Guggenheim/Collections-API-Spec`, last touched 2016) — **key-walled, no public key path.** `curl http://api.guggenheim.org/collections/objects` → `401 {"error":{"code":401,"message":"Unauthorized"}}` (Apache/Phusion Passenger; HTTPS port closed, HTTP only). Header `X-GUGGENHEIM-API-KEY` or `?key=`, `Accept: application/vnd.guggenheim.collection+json`. No documented way to obtain a key — treat as defunct/internal. This is where medium/dimensions would live, but it's inaccessible.
- **No CC0 bulk dump.** GitHub org `github.com/Guggenheim` has only 4 repos (the 2016 API spec, a Vue datepicker, two old jQuery/calendar things) — **no collection CSV/JSON** like MoMA/Tate/NGA. `Guggenheim-Helsinki/Data-API` is an architecture-competition dataset, not artworks.
- **No IIIF, no OAI-PMH** found on the museum domain.
- **Forbidden** (per task): Wikimedia/Wikidata/Google Arts/Europeana — not used.

## Reproduce the key tests
```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
# total + pagination
curl -s -A "$UA" -D - -o /dev/null "https://www.guggenheim.org/wp-json/wp/v2/artwork?per_page=100" | grep -i x-wp-total
# category vocab + counts
curl -s -A "$UA" "https://www.guggenheim.org/wp-json/wp/v2/artwork_type?per_page=100"
# paintings only
curl -s -A "$UA" -D - -o /dev/null "https://www.guggenheim.org/wp-json/wp/v2/artwork?artwork_type=1811&per_page=1" | grep -i x-wp-total
# one full record with image+terms
curl -s -A "$UA" "https://www.guggenheim.org/wp-json/wp/v2/artwork?per_page=1&_embed=1"
```
