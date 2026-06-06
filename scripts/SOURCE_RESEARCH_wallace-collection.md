# Source Research — The Wallace Collection (wallace-collection)

- **Museum**: The Wallace Collection, London, United Kingdom
- **Slug**: `wallace-collection`
- **Online catalogue**: https://wallacelive.wallacecollection.org (Axiell **eMuseumPlus**)
- **System**: eMuseumPlus (the `tsp` display-template flavour). Per-object detail pages
  exist with structured field rows. No public REST/JSON or IIIF endpoint, but two
  stable HTTP endpoints (no session cookie required) cover everything we need.

## Endpoints (self-site only — no third-party aggregators used)

### 1. Per-object detail page (metadata) — stable deep-link
```
GET /eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId={ID}&viewType=detailView
```
- Returns `text/html`, HTTP 200, **no session cookie needed**.
- `{ID}` is the eMuseumPlus internal `objectId` (e.g. 65299). Stable.
- Metadata lives in `<li class="List{Field}">` rows, each value wrapped in
  `<span class="tspValue">` / `<span class="tspReferenceLink">`:

  | row class          | meaning                | example                              |
  |--------------------|------------------------|--------------------------------------|
  | `ListTitlepic`     | title (pictures)       | `Brizo, A Shepherd's Dog`            |
  | `ListTitle`        | title (objects)        | `Sir Richard Wallace`                |
  | `ListArtist`       | artist + life dates    | `Rosa Bonheur ( 1822 - 1899 )`       |
  | `ListPlaceartist`  | place of origin        | `France`                             |
  | `ListDatesall`     | date                   | `Date: 1864` / `about 1837` / `ca. 1826` / `early 18th century` |
  | `ListMaterial`     | medium                 | `Medium: Oil on canvas`              |
  | `ListDimensions`   | size                   | `Image size: 46.1 x 38.4 cm` (3D objects use `Height:`/`Weight:`) |
  | `ListMuseumno`     | accession              | `Inv: P365`                          |
  | `ListLocation`     | gallery/room           | `Location: West Room`                |

- Artist field can carry trailing role/qualifier after the life-dates parenthetical:
  `, Attributed to`, `, Perhaps`, `, Armourer` — stripped in parser.
- There is **no explicit "Object Type" field**. Category is derived from the
  accession-number prefix (authoritative at Wallace) + medium (see below).

### 2. Image asset (no session, full resolution)
```
GET /eMP/eMuseumPlus?service=ImageAsset&module=collection&objectId={ID}&resolution=superImageResolution
```
- Returns `image/jpeg`, HTTP 200. `superImageResolution` ≈ 1500–2500 px long edge
  (verified 1587×1960, 2.5 MB for objectId 65299).
- Lower tiers exist: `highImageResolution` (~210 KB), `mediumImageResolution`,
  `lowImageResolution`. We download `super`, then sharp → webp q85, longest edge 2048.

## Object discovery (which objectIds)

The Wallace permanent display (the publicly catalogued on-view holdings) is the set
of objectIds we iterate. A prior April-2025 scrape of the eMuseumPlus room-display
captured **2215 distinct objectIds** (file `public/data/wallace-collection.json`,
legacy room-grouped schema). We reuse that list **only as the objectId discovery
index** — every field of every kept record is **re-parsed fresh** from the live
detail page (endpoint #1), so this is not a cache shortcut; it is a list of which
self-site objects to fetch.

## Scope filter — flat visual art only

Category is keyed off the Wallace accession-number prefix (cross-tabulated against
medium across all 2215 records; the prefix→type mapping is exact at Wallace):

| prefix | n   | type                         | keep?           |
|--------|-----|------------------------------|-----------------|
| **P**  | 509 | paintings (oil/gouache)      | ✅ `painting`   |
| **M**  | 160 | portrait miniatures          | ✅ `miniature`  |
| **L**  | 1   | loan (watercolour portrait)  | ✅ `painting`   |
| S      | 297 | sculpture                    | ❌ excluded     |
| C      | 278 | ceramics                     | ❌ excluded     |
| A / OA | 341 | arms & armour                | ❌ excluded     |
| F      | 249 | furniture                    | ❌ excluded     |
| W      | 112 | goldsmiths' work / objets    | ❌ excluded     |
| G      | 21  | gold boxes                   | ❌ excluded     |
| (none) | 247 | mostly ceramics, no acc no.  | ❌ excluded     |

Expected flat-art yield ≈ **670** (well under the 1500 cap → no capping needed).
Category is decided from the **fresh** accession prefix parsed off the detail page,
not the cached value. Medium refines (e.g. ivory/vellum miniatures).

## Pagination / rate-limit / auth
- No pagination needed (we iterate a known objectId list).
- No auth, no API key, no Referer requirement. Plain `GET` with a browser UA works.
- Rate-limit: polite ~4 concurrent + small jitter; site tolerated this in prior runs.
- TLS: connects cleanly; `NODE_TLS_REJECT_UNAUTHORIZED=0` available as fallback.

## Conclusion
Proceed with HTML scraping of the two stable eMuseumPlus endpoints. Enter Phase B
(100-record pilot over P/M objects) → validate → Phase C full (~670) → R2 → audit
→ register. Source type: `emuseumplus-html`.
