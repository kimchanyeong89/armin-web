# SOURCE RESEARCH — mumok (Museum moderner Kunst Stiftung Ludwig Wien), Vienna

**slug:** `mumok`
**Homepage:** https://www.mumok.at/en/collection
**Online collection:** https://www.mumok.at/en/online-collection
**Probed:** 2026-06-04 — Phase A only (find + test feasibility; no full scrape)

## Verdict

**viable = true (HTML scrape), with two caveats the scraper must accept.**
A museum-OWN source was found and a real sample fetched OK (genuine metadata + a usable image).
- **CAVEAT 1 — image size:** only a **600px-tall web derivative** is served (~20–85 KB). No full-size original is reachable (no zoom/lightbox, FAL originals 404). Passes pilot minimum (longest edge >400px, >10KB) but modest for SigLIP.
- **CAVEAT 2 — image coverage is low:** only ~21% of records (5/24 sampled) have ANY online image. Most in-scope works are **text-only records**. Scraper MUST skip records with no `previewimage`.

No API / IIIF / OAI-PMH / JSON-CSV dump / open-data portal exists. This is **HTML scraping** of a TYPO3 site (guide Phase A, source type 6).

## What was ruled out (own-infra only; aggregators forbidden & not used)

| Probe | Result |
|---|---|
| `/api`, `api.mumok.at` | `/api` = TYPO3 content page titled "API" (homepage shell, not data). `api.mumok.at` = no host. |
| `data.mumok.at` | 403 (no public data portal). |
| `sammlung.mumok.at` | 200 → **redirects to `library.mumok.at/AIS6/search`** = the **Bibliothek (library) catalog**, NOT the artwork collection. Dead end for artworks. |
| `/iiif`, `/oai` | 404. No IIIF manifest, no OAI-PMH feed. |
| `…/detail/{slug}.json` | 404. No JSON variant of detail pages. |
| GitHub / open-data dump | none found. |
| Internal XHR/JSON | the only JSON endpoints in page source are the **TYPO3 shop/basket** (`tx_shop_jsonapi`: addBasketItem/bookmark/getPriceByDate) — ticketing, not collection. |

robots.txt: `Allow: /` (online-collection not disallowed). Sitemap declared at `/sitemap.xml`.

## Working endpoints (for the scraper)

**Authoritative list of all records — the sitemap:**
```
https://www.mumok.at/en/online-collection/sitemap        → 6,457 unique /detail/{slug} links
```
(Use this, NOT the default browse view: the unfiltered landing `/online-collection` caps at 16 pages × 12 = ~192 items, a curated subset. The sitemap is the full set.)

**Detail page (parse metadata here — Detail-Page Completeness):**
```
https://www.mumok.at/en/online-collection/detail/{slug}
```
Example slugs: `aufstieg-935`, `abstrakte-bildidee-30`, `atmosphere-chromoplastique-no-174-2419`.

**Browse / facets (optional, for category-filtered scraping):**
```
/en/online-collection/page/{n}
/en/online-collection/page/{n}/filter/category/content/{category}
/en/online-collection/filter/accession/content/{year}     # 2016..2025
```
Categories seen: `classical-modernism`, `founding-collection`, `nouveau-realisme`,
`vienna-avantgarde-and-vienna-actionism`, `collection-austrian-ludwig-foundation-at-mumok`,
`collection-dieter-and-gertraud-bogner-at-mumok`, `oesterreichische-ludwigstiftung`.
Pagination = numbered `…/page/{n}` links; read max page from the link set.

**Headers/auth:** none required. Plain GET with a normal browser User-Agent works (no Referer, no cookie, no rate-limit observed). Be polite: ~1 req/sec.

## Record shape (TESTED — verbatim parse)

HTML is clean and comment-delimited. No JSON-LD for the artwork (only a BreadcrumbList) and **no og:image** — parse the DOM directly.

**Header block:**
```html
<div class="collectiontitle">Schlemmer, Oskar</div>      <!-- ARTIST: "Lastname, Firstname" -->
<h1 class="collectiondesc ...">Abstrakte Figur</h1>       <!-- TITLE (original lang) -->
<div>Abstract Figure</div>                                <!-- EN title (may be ABSENT) -->
<div>1921</div>                                           <!-- DATE: 4-digit year, ALWAYS the last sub-div -->
```
⚠️ The two `<div>`s after the `<h1>` are: [optional EN title][date]. When no EN title exists there is only ONE div = the date (e.g. `aufstieg-935` → `['1929']`). Parser rule: **date = last sub-div matching `\b\d{3,4}\b`**.

**Fact table** (`<th class="collectiontableth">` / `<td class="collectiontabletd">`, each row preceded by an HTML comment like `<!-- Material -->`):

| th (label) | example value | maps to |
|---|---|---|
| Object description | `Gouache on paper` | medium (human-readable) |
| **Object category** | `graphics` / `painting` / `plastic` / `photography` | **category filter — see below** |
| Material | `Painting layer: gouache Support: paper` | medium (structured) |
| Technique | `Object: gouache` | medium |
| Dimensions | `object size: height: 31,4 cm, width: 20,1 cm` | dimensions (verbatim) |
| Year of acquisition | `1961` | metadata only (NOT the creation year) |
| Inventory number | `G 2/0` | objectNumber |
| Creditline | `mumok - Museum moderner Kunst …` | metadata |
| Rights reference | `Gemeinfrei | public domain` / `Bildrecht, Wien` | metadata (PD vs ©) |
| Further information about the person | `Hausmann, Raoul [GND]` | artist authority (GND/ULAN) — fallback artist source |
| Literature | exhibition/cat refs | metadata (optional) |

> `year` for our schema = the **header date** (e.g. 1919), NOT "Year of acquisition".

### Tested sample records
1. **`abstrakte-bildidee-30`** — artist `Hausmann, Raoul`; title `Abstrakte Bildidee` (EN `Abstract Pictorial Idea`); date `1919`; category `graphics`; `Gouache on paper`; dims `31,4 × 20,1 cm`; inv `G 2/0`. **(NO online image — text-only record.)**
2. **`abstrakte-figur-263`** — `Schlemmer, Oskar` / `Abstrakte Figur` / `1921` / category `plastic` (bronze, OUT of scope) / image 450×600 20KB.
3. **`aufstieg-935`** — `Freundlich, Otto` / `Aufstieg` / `1929` / `plastic` (bronze, OUT of scope) / image 474×600 84KB.

## Image (the constraint)

Main image markup:
```html
<img class="previewimage" style="width:auto; height:600px;"
     src="/fileadmin/_processed_/2/4/csm_P_50_0_Freundlich02_he_Web_459c929650.jpg"
     width="474" height="600" />
```
- **Max size = 600px on the long edge** (height-constrained), ~20–85 KB JPEG. This is the ONLY image served.
- **No full-size original:** no `<a href>` zoom target, no `data-src`/`data-zoom`/`srcset`, no fancybox. Guessed FAL original paths (`/fileadmin/...`, `/fileadmin/Sammlung/...`, etc.) all 404. The `_processed_/{a}/{b}/csm_{name}_{hash}.jpg` derivative is final.
- Multiple `previewimage` tags per record = multiple views (front/detail/verso). Take the first as primary.
- Records WITHOUT a `previewimage` have no image at all → **skip** (do not fabricate).

## Counts (in-scope estimate)

- **Total online records (sitemap):** **6,457** (mixed media — includes sculpture/`plastic`, installation, etc.).
- **Image coverage:** ~21% sampled (5/24). → roughly **~1,300–1,400 records with a usable image** across all media.
- **In-scope flat works WITH image** (painting / graphics / photography / video; exclude `plastic` & installation): estimated **~800–1,000**.
- Full museum holdings are ~12,500 works / ~1,600 artists, but only the ~6,457 sitemap records are online and only ~21% are imaged.
- Paintings specifically: not separately countable without scraping `Object category` per record (no facet count exposed). The `category` facet pages exist but the default-view page cap makes their totals unreliable — derive true counts during the pilot from `Object category`.

## Recommended scrape plan (for next agent)

1. Pull all ~6,457 slugs from `…/online-collection/sitemap` (or `/sitemap.xml`).
2. For each detail page: parse header block + fact table (above).
3. **Filter to in-scope flat media** via `Object category`: keep `painting`, `graphics` (drawing/print), `photography`, `film`/`video`, `mixed media`. **Drop `plastic` (sculpture), `object`, installation, furniture, model.**
4. **Skip any record with no `previewimage`** (text-only).
5. Image = first `previewimage` src (600px derivative). Accept it (no larger exists). Run autocrop before R2.
6. Phase B pilot 100 → expect strong metadata fill (artist/title/year/dimensions/medium all present in HTML), images all ~600px. Verify category distribution & that no `plastic` leaked in.

**Politeness:** ~1 req/sec, resumable by slug, normal browser UA. No key, no Referer, no cookie.
