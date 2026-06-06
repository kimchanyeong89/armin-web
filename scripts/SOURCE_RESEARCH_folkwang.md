# Source Research — Museum Folkwang (Essen, Germany)

slug: `folkwang`

## Public collection portal
- Museum site: https://www.museum-folkwang.de/en/collection (curated highlights, no per-object catalogue)
- **Online collection** (the real catalogue): **eMuseumPlus** (Zetcom MuseumPlus, Tapestry web front-end), version **5.5.1.47**
  - Base: `https://sammlung-online.museum-folkwang.de/eMP/eMuseumPlus`
  - Linked from `/de/sammlung-online` and `/en/collection-online` as `?service=ExternalInterface&lang=en`
  - NOTE: `sammlung.museum-folkwang.de` (recon hint) does NOT resolve (HTTP 000). The working host is `sammlung-online.museum-folkwang.de`.
- Total works in catalogue: **33,435** (reported by result-list navigator).

## No clean API / IIIF
- No JSON API, no IIIF manifest, no LIDO/RDF/XML export found.
- Result-list pages use Tapestry `service=direct/...` **positional, session-bound** links (`$TspTitleImageLink$N.link`, `sp=T&sp=N`). They contain **no objectIds**.
- Images are served via `service=DynamicAsset&sp=S<opaque-encrypted-token>` — the token is not derivable, but is **stable across reloads** (not per-session).

## KEY: stateless objectId-addressed detail pages
Each artwork has a permalink (bookmark field) of the form:
```
https://sammlung-online.museum-folkwang.de/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId={N}&viewType=detailView&lang=en
```
This is **stateless** (fresh cookie each fetch works) and renders the full metadata record + the artwork image. This is the scraping entry point.

### objectId space
- Sparse + clustered. Valid IDs in pockets across **1 .. ~135,000**.
  - Coarse stride-2000 map: populated 200–46000, 54000–130000 with gaps (6000s, 16000–18000, 48000–60000 patchy, etc.).
  - Density inside populated bands is high: 84% (1000–1049), 100% (100000–100039).
- Invalid objectId → page title `Works | Result` (no `Obj_Title1_S`). Used as the "exists?" test.
- → Strategy: **brute-force scan objectId 1 .. 135000**, keep only valid + in-scope + real-image, cap at ~1500.

## Detail-page field structure
Fields render as:
```html
<li class="control">Obj_<Field>_S (label): <span><span class="tspValue">VALUE</span><span class="tspEnd">
```
Mapped fields (with `lang=en`, classifications are English):
| field key | meaning |
|---|---|
| `Obj_Title1_S` | title |
| `Obj_Dating_S` | date string (e.g. `1971`, `02.1951`, `Juni 2010`) |
| `Jahr von` / `Jahr bis` | year from / to (sometimes noisy — prefer parsing Obj_Dating_S) |
| `Obj_Classification_S (Objtyp)` | object type → category (`Photography`, `Painting`, `Print`, `Drawing`, `Poster`, ...) |
| `Obj_Crate_S` | dimensions (e.g. `280,5 x 280,5 cm`) |
| `Obj_Material_S` / `Obj_Technique_S` | medium (e.g. `Acrylfarben auf Leinwand`) |
| `Obj_IdentNr_S` | inventory / accession number |
| `Obj_Creditline_S` | credit line / sub-collection |
| `Obj_Rights_S` | copyright |

### Artist
- The artwork title appears as a self-link `tspTitleLink` (first occurrence) AND the **artist** appears in a separate `result.inline.list...artist_list.$TspTitleLink.link` block. **Take artist from the artist_list block only** — the first `tspTitleLink` is the title, not the artist.
- Life dates appear as `<span class="tspValue">* 1920 Deutschland - † 1989 Deutschland</span>`.

## Images (two tiers)
1. **Detail-page image**: `<img src="...DynamicAsset...image%2Fjpeg">` — capped at **340px** longest side.
2. **Larger popup** (`$TspImage.link`, opened via `window.open(...)` from the detail image): **up to ~768px** longest side. Reachable statelessly right after the detail fetch in the same cookie session. → Use this for the real image.

### Placeholders (CONFIRMED, two signatures)
- **Detail small placeholder**: always `340x340`, exactly **5721 bytes**, sha256 prefix `980202fd7f6e...`. Served for any object lacking an image. Cheap pre-check on the detail image → if it matches, the object has NO real image → skip (don't even fetch popup).
- **Popup placeholder**: the popup re-renders the "No image" gray card at `768x768`, **14413 bytes** (flat gray, mean RGB ~211, low stddev). Backstop check on the downloaded popup image.

## Scope mapping (flat visual art only)
| Obj_Classification_S | category | keep? |
|---|---|---|
| Photography, Fotodokument, Fotografie | photograph | yes |
| Fotonegativ | photograph | yes |
| Painting | painting | yes |
| Print, Druckgrafik | print | yes |
| Poster, Plakat | print | yes |
| Drawing, Zeichnung | drawing | yes |
| Collage | drawing | yes |
| vessel/bin, Tea ceremony, Liturgical item, sculpture, Book, ... | — | **no (3D / object / bound)** |

## Decision
- Source usable via stateless `objectId` detail pages. Brute-force scan, parse detail HTML (non-greedy field capture), download the popup image (≥~450–768px, well above 224px), reject the two placeholder signatures.
- Collection is huge (33,435) → **cap at ~1500**, prefer painting + drawing + print first (rarer), then photographs to fill. Note cap in `reason`.
- Rate: ~5 concurrent, polite. Resumable via R2 HeadObject (skip already-uploaded keys).
