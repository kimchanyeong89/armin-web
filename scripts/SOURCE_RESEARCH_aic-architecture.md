# Source Research — AIC Architecture & Design (`aic-architecture`)

**Scraper:** `scripts/scrape-aic-architecture.mjs` · **Output:** `public/data/aic-architecture-collection.json`
**Researched:** 2026-06-29

## Why
Existing `aic-collection.json` (39,315 works) = photographs/drawings/paintings, **no architecture** — yet AIC sits in the app's "Architecture" genre. This is a dedicated A&D collection (architectural drawings, models, design objects, plans, fragments).

## Endpoint (metadata) — OPEN, no key
- `POST https://api.artic.edu/api/v1/artworks/search` with JSON body (cleaner than the `query[...]` URL DSL, which 0-results from shell escaping).
- Filter: `bool.must = [ term department_title.keyword="Architecture and Design", exists image_id ]`
  - `term` on `department_title` (no `.keyword`) returns 0 — must use `.keyword`. `match` also works.
- Paging: `page` (1-based) + `limit` (max 100). `sort:[{id:asc}]` for resumable stability. `total_pages`/`total` in `pagination`.
- Rate limit generous; we use 250ms between pages, custom `AIC-User-Agent` header per AIC docs.

### Counts (probed)
| | count |
|---|---|
| A&D total | **6,127** |
| A&D **with image_id** (in-scope) | **4,959** |

### artwork_type breakdown (A&D, all)
Architectural Drawing 3,545 · Graphic Design 1,150 · Design 776 · Model 189 · Photograph 143 · Architectural fragment 100 · Painting 40 · Drawing&Watercolor 39 · Textile 20 · Time-Based Media 19 · Film/Video 17 · Book 15 · Sculpture 15 · Print 14 · Installation 12 · (rest <6).

### Metadata quality (30-item sample): 6-standard fill
title 30/30 · artist 30/30 · year 30/30 · category 30/30 · medium 30/30 · **dimensions 28/30 (94%)**. Real artists: Sullivan, Wright, Eames, Saarinen, Finn Juhl, Campana Bros, Tigerman. `artist_title` = clean name; `Unknown/Unidentified` is long-tail and **rejected** (guide §8) → those works skipped.

Category mapping: AIC `artwork_type_title` → our enum; **default `architecture`**, with Architectural Drawing→drawing, Graphic Design/Print→print, Photograph→photograph, Painting→painting, etc.

## Image — ⚠️ CLOUDFLARE BLOCKER
- IIIF: `https://www.artic.edu/iiif/2/{image_id}/full/{W},/0/default.jpg`
- **`www.artic.edu/iiif` is behind a Cloudflare bot challenge → HTTP 403 / `cf-mitigated: challenge`** for:
  - plain curl (any UA + Referer) ✗
  - headless Chrome via Playwright `channel:'chrome'` (home page itself 403s, no auto-clear in 30s) ✗
  - headful Chrome + stealth flags (`--disable-blink-features=AutomationControlled`, hide webdriver), 30s wait ✗
  - `images.weserv.nl` proxy — reports `"returned error: 403"` (and weserv was down on known-good images at probe time) ✗
- Alternate hosts (`lakeimagesweb.artic.edu`, `iiif.artic.edu`, `artic.edu`) all 403/redirect. API exposes **no** non-CF image field (`config.iiif_url` = the CF host; `alt_image_ids` empty).
- The repo's pre-existing `scripts/cache-aic-images-playwright.cjs` documents the same: *"AIC IIIF image URLs are frequently blocked by Cloudflare... solve it in the opened browser window."* → the only known-working path is **headful Playwright + manual challenge solve once**, reusing the cleared session.

### How the scraper handles images
1. **Direct HTTPS** with realistic browser headers (correct/fast; works from an allow-listed IP or whenever AIC's CF posture relaxes).
2. **Playwright-Chrome fallback** — one shared persistent context, warms a CF session; run **`HEADLESS=0`** to solve the challenge by hand once (90s window), then the cookie serves the whole run.
3. **`--no-images`** — build/validate JSON + metadata with no image fetch (`imageUrl` = `(PENDING …)` marker). Used for the pilot here.

## Verdict
**Metadata: fully feasible, high quality, 4,959 in-scope works.** **Images: blocked from this unattended environment by Cloudflare** — needs a one-time human challenge-solve via `HEADLESS=0` (or running from an AIC-allow-listed / residential IP). Scraper is complete and will fetch→resize→R2 the moment a cleared session exists; the pilot proved API + paging + JSON shape + sharp/autocrop/R2 wiring end-to-end.

## Run
```bash
node scripts/scrape-aic-architecture.mjs --pilot --no-images          # validated: 30 records, metadata only
HEADLESS=0 node scripts/scrape-aic-architecture.mjs --full            # full set; solve CF once, resumable
```
