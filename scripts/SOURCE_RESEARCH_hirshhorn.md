# SOURCE RESEARCH — Hirshhorn Museum and Sculpture Garden (slug: `hirshhorn`)

**Phase A — TESTED & VIABLE.** Smithsonian Open Access (museum-OWN, CC0). Two redundant museum-own paths confirmed live.

- Museum: Hirshhorn Museum and Sculpture Garden, Washington DC, United States
- Collection home: https://hirshhorn.si.edu/collection/  (HTML returns 403 to bots — DO NOT scrape HTML; use the API/dump below)
- Open Access page: https://hirshhorn.si.edu/explore/open-access/
- Smithsonian unit code: **HMSG**
- License: **CC0** (every released record has `online_media[].usage.access = "CC0"`)

---

## PATH 1 (PREFERRED for targeted scrape) — Smithsonian Open Access REST API (`api.si.edu`)

**Base:** `https://api.si.edu/openaccess/api/v1.0`
**Auth:** `api_key` query param. Free key at https://api.data.gov/signup (instant, email only).
- `DEMO_KEY` works for probing but is hard rate-limited (~30/hr — I hit `OVER_RATE_LIMIT` after ~8 calls). **Next agent MUST register a free key** (default ~1,000 req/hr, raisable).

**Search endpoint (tested 200, application/json):**
```
GET /search?q=unit_code:HMSG&rows=0&api_key=KEY        # rows=0 → rowCount only (count queries)
GET /search?q=unit_code:HMSG&start=0&rows=100&api_key=KEY   # paginate via start/rows (rows max 1000)
```
Query is Lucene-ish; AND-combine with `+AND+`. Useful filters (URL-encoded values are case-sensitive labels):
- `online_media_type:Images`  (only records that have an image)
- `object_type:Paintings` | `object_type:Drawings` | `object_type:Photographs` | `object_type:Prints`

**Pagination:** `start` (offset) + `rows`. `response.rowCount` = total. Loop start += rows until start ≥ rowCount.

### Record shape (real sample, `record_ID: hmsg_66.1522`, "Portrait of Mrs. Thomas Eakins")
```
row.title
row.unitCode = "HMSG"
row.url = "edanmdm:hmsg_66.1522"
row.content.freetext.name[0].content        → "Thomas Eakins, ..." (ARTIST, label "Artist"; raw "Lastname incl. nationality/dates")
row.content.freetext.date[0].content         → "(1497-1498)"  (DATE string, parenthesised)
row.content.freetext.objectType[0].content   → "Print" / "Painting" / ... (CATEGORY label, singular)
row.content.freetext.physicalDescription[]   → [{label:"Medium", content:"Oil on canvas"}, {label:"Dimensions", content:"20 1/8 x 16 1/8 in. (51 x 40.8 cm)"}]
row.content.freetext.identifier[]            → {label:"Accession Number", content:"66.1522"}  → objectNumber
row.content.indexedStructured.name[]         → ["Eakins, Thomas"]  (normalized Last, First — cleaner for artist field)
row.content.indexedStructured.date[]         → ["1860s"] (decade buckets → year fallback)
row.content.descriptiveNonRepeating.record_ID → "hmsg_66.1522"  (STABLE ID — prefix with slug: hirshhorn-hmsg_66.1522)
row.content.descriptiveNonRepeating.guid      → ark URL (sourceUrl candidate)
```
**IMAGE (full-size) — `descriptiveNonRepeating.online_media.media[]`:**
```
media[0].content   = "https://ids.si.edu/ids/deliveryService?id=HMSG-..._001"   (IDS deliver, scalable)
media[0].thumbnail = same id (thumb)
media[0].usage.access = "CC0"
media[0].resources[] :
   {label:"High-resolution JPEG", url:"https://ids.si.edu/ids/download?id=HMSG-..._001.jpg", width:2411, height:3000}  ← USE THIS (full res, ~2.4k×3k)
   {label:"Screen Image",   url:".../download?id=..._screen"}
   {label:"Thumbnail Image",url:".../download?id=..._thumb"}
```
→ `original_imageUrl` = the "High-resolution JPEG" `resources[].url` (fallback: `.../deliveryService?id={idsId}`). Real hi-res, NOT a thumbnail. `media[].extDescrAccessibility` even repeats "Oil on canvas 20 1/8 x 16 1/8 in." as a bonus.

There is also a Smithsonian IIIF service (https://iiif.si.edu/) keyed off the same IDS id if a manifest is preferred, but the `download?id=...jpg` direct URL is simplest and was confirmed present.

### Single-object fetch (if needed)
```
GET /content/{url}?api_key=KEY      e.g. /content/edanmdm:hmsg_66.1522   (returns same record shape)
```

---

## PATH 2 (key-free fallback / bulk) — AWS S3 open-data dump (line-delimited JSON)

Fully open, no key, no rate limit. Same EDAN records as the API.
- Unit index (tested): `https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/hmsg/index.txt`
- Sharded **256 files** `00.txt … ff.txt` by content-hash prefix, e.g. `https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/hmsg/00.txt`
- Each line = one EDAN JSON record (same schema as API `row` above). Filter locally on `content.freetext.objectType` + presence of `online_media`.
- (GitHub mirror https://github.com/Smithsonian/OpenAccess points to this same AWS bucket; bz2 full-corpus is 26GB — but the per-unit `hmsg/` txt shards are tiny, use those.)

---

## IN-SCOPE COUNTS (tested via API, `online_media_type:Images`, i.e. CC0-with-image)

| filter | count |
|---|---|
| `unit_code:HMSG` (all CC0 released) | **449** |
| with image (any type) | 449 (every record has an image) |
| **Paintings** (w/ image) | **159** |
| Drawings (w/ image) | 108 |
| Photographs (w/ image) | 75 |
| Prints (w/ image) | 20 |

Flat in-scope ≈ **362** (159 + 108 + 75 + 20). Remainder (~87) = sculpture/other (out of scope).
NOTE: Hirshhorn only released "several hundred" works to CC0 — this 449 is the **entire openly-available set**, not a sample. Hirshhorn's full collection is ~12k objects but the rest is NOT open. 449 is the ceiling for this source.

---

## RECOMMENDATION
Scrape via **PATH 1 (API)** with a registered free key: loop `object_type:(Paintings|Drawings|Photographs|Prints)` + `unit_code:HMSG`, paginate start/rows=100. Pull `original_imageUrl` from `resources[] "High-resolution JPEG"`. ~362 flat works, all CC0, clean metadata (artist/title/date/medium/dimensions all present). PATH 2 is the no-key backup if the key is delayed. No HTML scraping (site 403s bots).
