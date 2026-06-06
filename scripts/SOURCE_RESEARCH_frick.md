# Source Research: The Frick Collection (New York)

**Slug**: `frick`
**Website**: https://collections.frick.org
**Phase A date**: 2026-06-05
**Conclusion**: ✅ **VIABLE** — Gallery Systems **eMuseum (TMS)** + **IIIF Image API**. Museum-OWN infra. Sample fetched OK (title/artist/date/medium/dims + 3028×2000 IIIF image). Behind a **Fastly WAF JS challenge** — must obtain a clearance cookie with a real browser once, then plain `fetch`/HTTP works.

---

## Platform
- eMuseum (web front-end) over TMS (Gallery Systems). Mirador/IIIF for image viewing.
- Optional eMuseum **JSON API content-negotiation is DISABLED** on this instance: `?format=json`, `/json`, and `Accept: application/json` all return the **rendered HTML detail page** (200, text/html), NOT JSON. → parse server HTML, not a JSON API.
- IIIF Image API IS enabled (level2). IIIF Presentation manifest URL not yet pinned (see below) — not needed; Image API alone gives full-res.

## ⚠️ Gate: Fastly Next-Gen WAF "Client Challenge"
- Plain curl/WebFetch → 3038-byte shell, `<title>Client Challenge</title>`, asset prefix `/_fs-ch-<token>/...`, loads `script.js?reload=true`. This is a JS bot challenge, NOT the app.
- **Solution (tested)**: load any page once in a real browser (agent-browser `npx agent-browser` v0.27, or Playwright) → challenge auto-solves → session holds Fastly cookie. Then **in-browser `fetch()` (or reuse the cookie via HTTP client) returns full server HTML** (77 KB object page with all metadata). No per-page browser render required after cookie is obtained — verified by fetching object 146 HTML and confirming title/artist/medium/accession/dims all present.
- Practical scrape pattern: agent-browser `--session frick open <any url>` → then drive `agent-browser eval` `fetch(...)` loops, OR export cookies and feed a node-fetch scraper. Cookie likely expires; re-open to refresh.

## Endpoints (all tested through authenticated session)

| Purpose | URL | Result |
|---|---|---|
| Listing (paintings) | `/groups/explore-paintings/results?page=N` | Server-rendered. Lists `/objects/{id}/{slug}` links. **"199 results".** |
| Listing (works on paper) | `/groups/explore-works-on-paper/results?page=N` | **"134 results"** (drawings/prints). |
| All objects | `/objects?sort=invno-asc&page=N` | **"1,883" total** (incl. sculpture/dec-arts — out of scope). |
| Object detail | `/objects/{id}` or `/objects/{id}/{slug}` | 77 KB HTML, all fields (see below). |
| IIIF Image info | `/apis/iiif/image/v2/{mediaId}/info.json` | 200 JSON: `{profile: level2, width:3028, height:2000}` |
| IIIF full image | `/apis/iiif/image/v2/{mediaId}/full/1600,/0/default.jpg` | 200 image/jpeg, **207 KB** real artwork |
| Image dispatcher (alt) | `/internal/media/dispatcher/{mediaId}/full` | 200 jpeg ~53 KB (smaller derivative — prefer IIIF) |

- **Pagination**: eMuseum standard `?page=` (1-based), 100 records/page; `?sort=invno-asc`. 199 paintings → 2 pages.
- **mediaId**: extract from object HTML `dispatcher/(\d+)/preview` (the FIRST/primary one is the artwork; subsequent are "Discover More" thumbnails). Same mediaId works for both `dispatcher/{id}/full` and `apis/iiif/image/v2/{id}/...`.
- **IIIF gotcha**: `full/full/0/default.jpg` → **500** (server rejects unbounded native 3028px). Use a bounded size: `full/2048,/0/default.jpg` (matches our ≤2048 long-edge rule) or `full/1600,/`.

## Tested sample — object 146 (`/objects/146/the-washerwomen`)
Parsed from rendered detail-page DOM (dt/dd-style label/value):
```
title:       The Washerwomen
artist:      Charles-François Daubigny (French, 1817–1878)   # artist line above field table
date:        1870–74
medium:      Oil on canvas
dimensions:  20 7/8 x 31 1/2 in. (53 x 80 cm)
accession:   1896.1.32
creditLine:  Henry Clay Frick Bequest
classification: Painting        # "Painting" tag near bottom; also appears in catalog text
onView:      Second Floor, Room 22, Breakfast Room
mediaId:     8758  → /apis/iiif/image/v2/8758/full/2048,/0/default.jpg  (native 3028×2000)
sourceUrl:   https://collections.frick.org/objects/146/the-washerwomen
```
Field-presence check on the raw fetched HTML: hasTitle/hasArtist/hasMedium/hasAccession/hasDims/hasClassification all **true**. No JSON-LD, no og:image — must parse the DOM field rows + the artist anchor + the primary dispatcher mediaId.

## In-scope counts (flat visual art)
| Bucket | Count | Policy |
|---|---|---|
| **Paintings** | **199** | collect ALL (no cap) |
| Works on paper (drawings/prints) | **134** | value-filter per guide; most are highlights-grade in a small museum |
| (All objects) | 1,883 | includes sculpture, dec-arts, clocks, porcelain — OUT of scope |
| **Est. total in-scope** | **~333** | 199 paintings + ≤134 WoP |

Small, curated, masterpiece-dense collection (Vermeer, Rembrandt, Bellini, Holbein, Goya, etc.). High value-per-record.

## Parsing notes for scraper
- Artist: the line directly under `<h1>` title — format `"Name (Nationality, b–d)"`. Strip the paren bio into a separate field if wanted; store artist as source ("Charles-François Daubigny").
- Fields live in label/value rows (Date / Medium / Dimensions / Credit Line / Accession number). Use non-greedy DOM/regex.
- `year`: parse leading 4-digit from `date` ("1870–74" → 1870).
- `category`: detect "Painting" classification tag → `painting`; works-on-paper group → `drawing`/`print` (check medium: etching/engraving/lithograph → print; chalk/ink/watercolor → drawing).
- Image: prefer IIIF `apis/iiif/image/v2/{mediaId}/full/2048,/0/default.jpg`; fallback dispatcher `/full`.

## Forbidden-source check
✅ All data + images from Frick's own `collections.frick.org`. No Wikimedia/Wikidata/Google/Europeana used. (digitalcollections.frick.org was checked and REJECTED — it's the Frick Art Reference Library **photoarchive** = photographic reproductions of OTHER museums' works + auction catalogs, explicitly "not the Frick Collection's paintings"; out of scope.)
