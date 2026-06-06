# Source Research — National Gallery of Iceland (Listasafn Íslands)

- **slug**: `national-gallery-iceland`
- **Homepage**: https://www.listasafn.is/en/art/collection/
- **City/Country**: Reykjavík, Iceland
- **Probed**: 2026-06-04
- **Verdict**: ✅ VIABLE — museum-own Prismic CMS, unauthenticated, full metadata + high-res images. Tested end-to-end on 5 real records.

## Tech stack
- Next.js (SSG, buildId `GI9prvJ8vGFJBLEzQdE9H`) + **Prismic** headless CMS (repo `listasafn-islands`).
- Per-artwork detail pages live at the **Icelandic** route `https://www.listasafn.is/list/safneign/{uid}/` where `uid = li-{accession}` (e.g. `li-4863`). NO leading zeros (`li-261` ok, `li-00261` 404). The `/en/` locale prefix 404s for artwork pages — detail pages are Icelandic-only.
- On-site search = Algolia (index **`artwork_v2`**, plus `site_search`). appId/apiKey are runtime-injected (NOT in JS chunks); would need a browser network capture. **Not needed** — Prismic API enumerates everything.
- Each artwork record carries a `sarpur` sub-object = the museum's catalog data from **Sarpur.is** (the Icelandic national cultural-heritage DB the gallery is a member of), merged server-side by `getStaticProps`. This is the museum's own catalog, not a third-party aggregator.

## ⭐ Recommended scrape recipe (2 endpoints)

### 1. Enumerate all artwork UIDs — Prismic content API (museum-own, no auth)
```
GET https://listasafn-islands.cdn.prismic.io/api/v2            → grab refs[0].ref  (master ref, e.g. "ahwGDREAACkA194H")
GET https://listasafn-islands.cdn.prismic.io/api/v2/documents/search
      ?ref={REF}
      &q=[[at(document.type,"artwork")]]
      &lang=is
      &pageSize=100&page=N
```
- Returns `total_results_size`, `total_pages`, and `results[]` with `uid` (`li-####`), `id`, `data.title`, `data.image.url`, `alternate_languages` (en-gb uid).
- **⚠️ The Prismic API `data` block does NOT include the `sarpur` metadata** (only title/image/meta_*). You MUST hit endpoint #2 per UID for artist/year/material/size.
- Pagination: `page=1..total_pages`, `pageSize` up to 100.

### 2. Full per-artwork metadata — Next.js page-data JSON (has the `sarpur` block)
```
GET https://www.listasafn.is/_next/data/{buildId}/is/list/safneign/{uid}.json
    e.g. .../GI9prvJ8vGFJBLEzQdE9H/is/list/safneign/li-4863.json   → HTTP 200, ~55 KB
```
- `buildId` comes from `__NEXT_DATA__` on any page (or `/_next/static/{buildId}/...`). **It changes on every redeploy** — read it fresh at scrape time.
- Response `pageProps.content` is the full record (HTML fallback at `/list/safneign/{uid}/` carries the same `__NEXT_DATA__` if the buildId path breaks).

Headers: plain `User-Agent: Mozilla/5.0` is enough. No cookies, no Referer, no rate-limit seen. Be polite (~1 req/s).

## Field mapping (from `pageProps.content`)
| ARMIN field | source path | sample (li-4863) |
|---|---|---|
| `id` | `sarpur.slug` or `meta.uid` | `li-4863` |
| `objectNumber` | `sarpur.listasafnidId` | `LÍ-4863` |
| `title` | `content.title` / `sarpur.name` | `Íslandslag` |
| `artist` | `sarpur.artists[].name` (join `; `) | `Jóhannes Kjarval` (birthYear 1885, deathYear 1972) |
| `date` | `sarpur.year` | `1949 - 1959` |
| `year` | parse first int of `sarpur.year` | `1949` |
| `medium` | `sarpur.material[]` (+ `sarpur.method[]`) | `Óflokkað (í vinnslu) / Málning/Litur / Olíulitur` |
| `dimensions` | `sarpur.size` | `115 x 156 x 0 cm\nStærð með ramma: 120 x 160 x 0 cm` |
| `category` | derive from `sarpur.method`/`category` (see below) | painting |
| `description` | `sarpur.exhibitionText` / `sarpur.summary` / `sarpur.description` | (Icelandic blurb) |
| `original_imageUrl` | `content.image.url` | Prismic URL, **2127×1598** |
| `sourceUrl` | `https://www.listasafn.is/list/safneign/{uid}/` | |
| `metadata` | keep `sarpur.objectID` (Sarpur DB id), `imageId`, `mainType`, `secondaryType`, `category`, `copyright`, `source`, `donorComments` | |

### Category derivation (fields are Icelandic)
- `sarpur.method`: `Tækni/Málun` = **painting**, `Tækni/Teiknun` = **drawing**, (also Prentun=print, Ljósmyndun=photo).
- `sarpur.material`: `Olíulitur` = oil; `Pappír` = paper (drawing/print); `Textíll` = textile (rare → likely exclude).
- `sarpur.category`: e.g. `Teiknun` (drawing), `Landslagsmyndir` (landscapes).
- `mainType` is almost always `Myndlist/Hönnun` ("Fine Art/Design") — not discriminating by itself; use `method`+`material`.

## Images
- Host: `https://images.prismic.io/listasafn-islands/...` (museum's own Prismic asset CDN).
- The `?auto=compress,format` URL = ~1.1 MB JPEG at 2127×1598 (li-4863). **Strip the query string** for the original master (9 MB full-res). Recommend fetching the original then downscaling to 2048px long-edge per guide §Phase D.
- `content.image` is the large display image; `content.metaImage` is a smaller OG variant — use `content.image`.
- Not a thumbnail. Real full-size verified via HEAD (content-length 1.1 MB / 9 MB original).

## Scope / counts
- Prismic `artwork` docs: **488 (lang=is)** / 480 (en-gb) / 968 (lang=*, double-counts both langs).
- ⚠️ The museum's *full* collection is ~15,000 works (per Kolibri/press), but **only ~488 are published as browsable artwork pages on the website.** The rest live in Sarpur but are not exposed as Prismic `artwork` docs. So in-scope-from-this-source = **~488**, essentially all flat visual art (Icelandic painting + drawing dominate; sample of 5 = 4 paintings + 1 drawing).
- Estimated paintings: majority of the 488 (Kjarval, Scheving, Sölvi Helgason, etc.). No exact per-medium count without scraping all 488 `sarpur.method` values, but the curated set skews heavily to painting.

## Verified samples (2 of 5 tested)
1. **li-4863** "Íslandslag" — Jóhannes Kjarval (1885–1972), 1949–1959, oil (`Olíulitur` / `Tækni/Málun`), 115×156 cm, image 2127×1598. Sarpur objectID 1563281.
2. **li-9418** "Blómamynd í gulu" — Sölvi Sólon Íslandus Helgason, 1858–1895, paper drawing (`Pappír` / `Tækni/Teiknun` + `Tækni/Málun`, category `Teiknun`), 36.7×46.2 cm, image 1255×1000. Sarpur objectID 1988260.

## Notes for scraper
- Metadata/type labels are **Icelandic**. Structured fields (year, size, image, artist name, accession, Sarpur objectID) are language-neutral and usable directly. If English descriptions are wanted later, the Prismic API has `en-gb` alternates (`lang=en-gb`) but they 404 on the Next route — fetch via Prismic API `getByUID`/search with `lang=en-gb`, NOT via `/_next/data/.../en-gb/...` (that returned `{}`).
- Read `buildId` fresh each run (redeploys rotate it).
- 4-required fields (title/artist/year/category) all present & derivable in samples; dimensions+medium present too. Expect high fill%.
