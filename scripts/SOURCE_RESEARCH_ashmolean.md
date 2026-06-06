# Source Research — Ashmolean Museum (Oxford, UK)

slug: `ashmolean`
START URL: https://collections.ashmolean.org (301 → https://www.ashmolean.org/collections-online)

## Platform

Oxford **GLAM Digital "Online Collections"** SPA (vendor: glamdigital.io), backed by
KE EMu + an Elasticsearch proxy on AWS API Gateway, with a IIIF (ResourceSpace/DAMS)
image server. The same codebase powers Ashmolean (`ash`), History of Science Museum
(`hsm`), Pitt Rivers (`prm`), OUMNH (`oum`).

The SPA loader is `https://prod-webapp-oc.s3.eu-west-1.amazonaws.com/import-chunks.js`
→ `static/js/index.js` (3.9 MB bundle). API base + image hosts were extracted from it.

## Endpoints (production, all self-site / Oxford-official)

- **API base**: `https://prd-online.glamdigital.io/v2`
- **Museum token**: `ash`
- **Search (Lucene)**: `GET {base}/search/ash/catalogue?q={luceneQuery}&from={N}&size={N}&sortBy={f}&sortDirection={asc|desc}`
  - List items only: `{ score, item:{ id:"ash-object-{irn}", irn, multimedia:[...], recordTitle, recordSubtitle } }`
  - `webCategory.keyword:` is the flat-art facet. `q=(webCategory.keyword:paintings)` etc.
  - Response: `{ total, maxScore, results:[...] }`
- **Full record**: `GET {base}/item/ash-object-{irn}/full` → complete EMu record (all metadata fields).
- **Image (IIIF Image API, level0)**: `https://dams.ashmus.ox.ac.uk/iiif/image/{resourceSpaceId}/info.json`
  - `resourceSpaceId` comes from `item.multimedia[i].resourceSpaceId` (NOT the object irn).
  - Full image: `https://dams.ashmus.ox.ac.uk/iiif/image/{rsId}/full/max/0/default.jpg`
  - ⚠ **level0 server** — custom sizes (`full/2048,/...`) return HTTP 400. Only `full/max`
    works; it yields the largest pre-generated size (~1000 px long edge, maxWidth 1024).
    This is >224 px so it clears the guide's min-size bar, but it is the ceiling.
- IIIF manifest also exists: `https://dams.ashmus.ox.ac.uk/iiif/{rsId}/manifest` (not needed; image API is enough).

No auth token / API key required for read. CORS is open (Origin header optional). 403
`{"message":"Missing Authentication Token"}` from the gateway = wrong route, not auth.

## Sample full-record field map (object 367928 "Fruit and flowers")

| our field   | source path |
|---|---|
| title       | `header` (or `objectTitle[0].title`) |
| artist      | `persons[]` where `roleCategory:"Artist/maker"` → `displayName` (join `; `); else first person; else Anonymous if site truly omits |
| year        | `datePeriod[0].from` (int) — fallback `.preview`/`.to`, else 4-digit from `recordSubtitle` |
| date        | `datePeriod[0].preview` (e.g. "1810", "17th century (1601 - 1700)") |
| medium      | `materialAndProcess[].display` joined `; ` (e.g. "ink on paper") — sometimes `[]` (genuine gap) |
| dimensions  | `dimensionsVirtualField` (e.g. "132cm (height)\n41cm (width)"; may include frame line) |
| category    | mapped from `webCategory` (paintings→painting, drawings→drawing, prints→print) |
| objectNumber| `objectNumbers[0].displayAccNo` (e.g. "EA1966.140") |
| onDisplay   | `currentLocationDisplay !== "not on display"` |
| displayLocation | `currentLocationDisplay` |
| sourceUrl   | `referenceURL` (= https://collections.ashmolean.org/object/{irn}) |
| image       | `multimedia[0].resourceSpaceId` → IIIF Image API |

## Scope & volume (image-bearing flat art)

`webCategory.keyword` totals: **paintings 3,742 · drawings 29,736 · prints 131,203 · photographs 0**
(photographs live under objectName, not webCategory; out of cap budget anyway).

~77 % of paintings carry multimedia; of those ~83 % have `isPublished:"Yes"`. So imaged,
published paintings alone are ≈ 2,400 — more than the 1,500 cap.

**Decision (HARD RULE 10 cap)**: collect **paintings only**, image-bearing + published,
most-complete first, capped at ~1,500. Paintings are the highest curatorial value and the
single most complete category; drawings/prints (160k) are deferred. Cap noted in JSON `reason`.

## Image quality gate

Quality tag distribution on imaged paintings: Professional shot 70%, Record shot 29%,
Conservation/Decant rare. All acceptable. Require `multimedia[0].isPublished === "Yes"` and
download `full/max`. Reject by sha256 if a repeating placeholder appears (none seen so far —
the DAMS returns per-object record shots, not a fixed "no image" canvas; the SPA's own
`no-media.png` is client-side only and never returned by the image API).

## Conclusion

Clean JSON API + IIIF, no key. Enter Phase B pilot (100 paintings) → C/D/E full (cap 1500).
Scraper: `scripts/scrape-ashmolean.mjs`. Output: `public/data/ashmolean-collection.json`.
