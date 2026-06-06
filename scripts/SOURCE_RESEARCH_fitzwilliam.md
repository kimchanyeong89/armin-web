# Source Research — The Fitzwilliam Museum (Cambridge, UK)

slug: `fitzwilliam`

## TL;DR
- The START URL `collection.fitzmuseum.cam.ac.uk` is **dead (NXDOMAIN)**.
- `data.fitzmuseum.cam.ac.uk` is the current **Collections data site** (Laravel app). Its JSON API
  (`/api/v1/...`) is **authenticated** (session cookie / bearer token, 60 req/min) → not usable anonymously.
- BUT the museum publishes its **entire structured dataset as CC0 JSON on GitHub**:
  `github.com/FitzwilliamMuseum/fitz-collection-raw-data` (the museum's own official data dump,
  cited as `Pett, D (2022). The Fitzwilliam Museum Collection MetaData Dump`).
  This is a museum-owned bulk download (guide Phase A priority #3) — NOT a third-party aggregator.
- Images: full-resolution masters via the museum's own **IIIF Image API** at
  `api.fitz.ms/data-distributor/iiif/...` (referenced from each object's `manifestURI`),
  with `data.fitzmuseum.cam.ac.uk/imagestore/...` as a lower-res fallback.

## Endpoints used
| What | URL | Notes |
|---|---|---|
| Master object table | `raw.githubusercontent.com/FitzwilliamMuseum/fitz-collection-raw-data/main/csv/objects.csv.gz` | 21.9 MB gz, 267k rows. Columns incl. id, accessionNumber, title, department, primaryCategory, maker, largeImage, thumbnail, numberOfImages. Used to FILTER candidates. |
| Per-object record | `raw.githubusercontent.com/.../json/objects-json/object-{id}.json` | Full CIIM JSON-API record. Source of truth for title/maker/year/medium/dimensions/category. |
| IIIF manifest | `api.fitz.ms/data-distributor/iiif/object-{id}/manifest` | Present on ~55% of objects (also in object JSON `manifestURI`). Points to IIIF Image service. |
| IIIF image | `api.fitz.ms/data-distributor/iiif/image/{media-id}/full/full/0/default.jpg` | Full-res master (e.g. 3666×2694, 4267×6284). |
| imagestore (fallback) | `data.fitzmuseum.cam.ac.uk/imagestore/.../{name}.jpg` (`multimedia[].original.location`) | ~558–1024px. Used when no IIIF manifest. |
| Object detail page (human) | `data.fitzmuseum.cam.ac.uk/id/object/{id}` | Public HTML; confirmed it matches the GitHub data. |

## Object JSON field map (key paths; every value is array-wrapped)
- title           → `data.title[].value[0]`
- maker (artist)  → `data.lifecycle.creation.maker.maker.summary_title[0]` (`"Surname, Forename"`)
- year            → `data.lifecycle.creation.date[].from.earliest[0]` / `.earliest[0]` / `.value[0]`
- category(type)  → `data.summary[].summary_title[0]` / `data.name[]` / `data.categories[]`  (`print`/`drawing`/`painting`/`miniature (painting)`/`photograph`…)
- medium          → `data.techniques[].summary_title[]` + `data.component[].materials[].summary_title[]`
- dimensions      → `data.measurements.dimensions[]` (`{dimension, value, units}`)
- accession       → `data.identifier[]` where `type==accession number`
- image (IIIF)    → `data.manifestURI[0]` → manifest → `sequences[0].canvases[0].images[0].resource.service.@id`
- image (fallback)→ `data.multimedia[0].original.location[0]`
- description     → `data.note[]` (history note etc.)
- department      → `data.department.value[0]` (filter on `Paintings, Drawings and Prints`)

## Scope filtering
Department = **"Paintings, Drawings and Prints"** (79k records). primaryCategory mapped to enum:
`painting / miniature (painting)→miniature / drawing / print / photograph / collage→mixed_media_2d`.
Coins, Antiquities, Applied Arts, Manuscripts depts excluded.

Flat-art objects **with an image**: print 13,556 · drawing 5,430 · painting 1,410 · miniature 597 · photograph 336 (= 21,329).

## 4-MUST yield
- maker ~99%, medium ~100%, dimensions ~85%, but **creation year only ~44%** on paintings
  (many old-master works are genuinely undated; only an *acquisition* year exists, which is NOT a
  creation date and must not be used). Records without a real creation year are **dropped** (4-MUST).

## Selection (cap ~1500, prefer paintings/most-complete)
Process in priority order **painting → miniature → photograph → drawing → print**, keep only records
passing 4-MUST (title+maker(or genuine Anonymous)+year+category) + live image, stop at 1500.
This yields all qualifying paintings/miniatures/photos first, then tops up with the most-complete
drawings/prints.

## Licensing
Data CC0; images CC-BY-NC-SA 4.0 (per the API "Using our API" page). 20th-century / in-copyright works
are excluded from the published system by the museum.

## Conclusion
Proceed via GitHub CC0 dump (objects.csv.gz → per-object JSON) + IIIF image API. No auth needed for
GitHub raw or api.fitz.ms. Source type: `github-cc0-dump+iiif`.
