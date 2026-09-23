# SOURCE RESEARCH — FOMU (FotoMuseum Antwerpen)

**Slug:** `fomu-antwerp` · **Genre:** 사진 (Photography) · **City:** Antwerp, Belgium

## Decision: VIABLE — own Axiell/Adlib catalogue (`collection.fotomuseum.be`)

FOMU runs **two** of its own web properties. The institutional site `fomu.be` (Craft CMS)
exposes only ~400 curated "collection story" pages with 1024px images. The dedicated
**collection catalogue** `collection.fotomuseum.be` is the real object database — **48,815
records**, full-size images via FOMU's own ResourceSpace DAM. We scrape the catalogue.

Both are FOMU's OWN sites (`fotomuseum.be` = FOMU's institutional domain; the DAM host
`museumstichting.resourcespace.com` = Museumstichting, the foundation that operates FOMU).
**Not an aggregator** — the catalogue brands itself `<title>FOMU Collectie</title>`,
`alt="FOMU Home"`. Vlaamse Kunstcollectie / Europeana are explicitly out of scope and not used.

## Endpoint (Axiell Adlib Internet Server 3.1.2, IIS/ASP.NET — web flow, no machine API)

`wwwopac.ashx` (the Adlib REST API) is disabled/404, so we drive the AIS web UI with a session
cookie + ASP.NET `__VIEWSTATE`:

1. `GET /default.aspx` → plants `ASP.NET_SessionId` (+ `CulturePref=en-GB` for English UI labels).
2. `GET /search.aspx?formtype=expert` → grab `__VIEWSTATE` / `__EVENTVALIDATION`.
   `POST /search.aspx?formtype=expert` with `TextBoxVal=*` (expert CCL bare wildcard = every record)
   → registers the full result set in the session; page reports `Found results: 48,815`.
3. `GET /brief.aspx?gotopage=N` → 20 rows/page (2,441 pages). Each imaged row links
   `dispatcher.aspx?action=detail&database=ChoiceCollect&priref=P` with `<span class="resourcespace">RS</span>`
   (priref P = Adlib record id; RS = ResourceSpace DAM asset id).
4. `GET /dispatcher.aspx?action=detail&database=ChoiceCollect&priref=P` → detail labels (EN UI):
   **Object number, Title, Creator, Date, Object name, Technique** (values mostly NL).

## Image (full-size, publicly downloadable, no login)

`GET /php/api_call_scr_external.php?Id=RS` → returns an `<img src="…resourcespace.com/pages/download.php?ref=RS&size=scr&…&access_key=SIGNED">`.
- The `scr` (screen) rendition is the signed, public size — typically ~800–1200px+ long edge. ✓ ≥600px.
- `access_key` is **size-specific**; do NOT rewrite the size token (other sizes 302 to login).
- Records with no published image return `images/copyrighted.gif` (FOMU publishes only PD / rights-cleared
  images) → **skipped** as out of scope (no downloadable image).

## Sample findings

- **Total records:** 48,815 (confirmed live via `registerAll()` in the scraper).
- **With-image rate:** ~52% on a 180-row spread sample → **est. in-scope ≈ 25,000 photographs**.
- **Required fields:** Title/Creator/Date present on imaged records (min-4 guard drops the rest;
  `category` is always `photograph`). Technique/Object name fill `medium`. Dimensions not on detail page.
- Scope is photographs only (cameras/equipment not yet online per the catalogue intro). B&W prints kept
  (photographs are never colour-gated, COLLECTION_SCRAPING_GUIDE §1).

## Scraper

`scripts/scrape-fomu-antwerp.mjs` — mirrors `scrape-ars-electronica.mjs` (HTML/web flow):
`--count` (with-image estimate), `--probe` (~20 end-to-end + R2), `--full` (resumable, COMPACT JSON,
prioritize named+dated, `CAP_BYTES` 23MB). Output `public/data/fomu-antwerp-collection.json`.

## Note on the alternative (`fomu.be` Craft site)

Rejected as primary: only ~400 objects (same set in NL/EN/FR via 3 sitemap language pages), 1024px
max renditions, `/en/collection` index returns HTTP 504. The Adlib catalogue is 60× larger with
full-size images, so it is the correct source.
