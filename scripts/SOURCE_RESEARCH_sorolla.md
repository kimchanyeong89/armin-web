# Source Research: Museo Sorolla

**Slug**: `sorolla`
**Wikidata QID**: `Q1592523` · **Artist QID**: `Q351746` (Joaquín Sorolla)
**Phase A/B date**: 2026-05-27
**Conclusion**: ✅ **PROCEED with Wikidata (62 works)** — CER.es probed and rejected (thumbnail-only)

---

## Endpoints probed

| URL | Status | Use |
|---|---|---|
| `https://www.cultura.gob.es/msorolla/...` | 200 | Museum's own pages — links out to CER.es for catalog |
| `https://www.cultura.gob.es/dam/jcr:{UUID}/*.jpg` | 200, ~582×376 | DAM (Digital Asset Mgmt) — only ~6 highlights per category page |
| `https://ceres.mcu.es/pages/SpecialMuseumSearch?Access=MSM` | 200 | "Show all" entry for Museo Sorolla |
| `https://ceres.mcu.es/pages/ResultSearch?Museo=MSMCOLECCION&page=N` | 200 | Paginated listing, 24/page |
| `https://ceres.mcu.es/pages/Viewer?img=/MSM/fondos_sello/MSMFNNNNN_S.JPG` | 200, **94×150** | Public catalog photo — only resolution available |
| `https://ceres.mcu.es/pages/Viewer?img=/MSM/fondos_sello/MSMFNNNNN_{G,M,L,P}.JPG` | 200 **but 0B** | Larger variants return empty |
| `https://ceres.mcu.es/pages/Viewer?img=/MSM/{fondos_grande,fondos_max,...}/...` | 200, 0B | All alternative dirs empty |
| CER.es detail page (POST with full hidden form fields) | 200, full metadata | Detail has dims/medium/year but **same 94×150 image** |
| `https://api.europeana.eu/record/v2/search.json?...Museo+Sorolla` | 200, 0 results | Sorolla not on Europeana |
| `https://query.wikidata.org/sparql` | 200 | **Primary source** — 68 unique works (P276 ∪ P195) |

---

## Why CER.es was rejected as primary source

CER.es is the Spanish national heritage catalog. It has **20,596 documents** for Museo Sorolla (vs Wikidata's 68). But:

1. **All public images are 94×150 px catalog thumbnails** — confirmed across:
   - Listing page (`_S` suffix)
   - Detail page POST (which would show "large" version if any existed)
   - All variant suffixes (`_G`, `_M`, `_L`, `_P`)
   - All alternative directories (`fondos_grande`, `fondos_max`, etc.)
2. **94×150 is below SigLIP's 224×224 input** — upscaling would just blur. Embeddings would be near-noise.
3. **The 20,596 also includes non-art** (furniture, documents, photos of holdings as records) — real flat art subset is probably 5K-10K.

So CER.es is useless for our SigLIP-driven app even though it has rich metadata (year, dimensions, medium, technique on detail pages).

## Wikidata coverage (chosen source)

- Total Sorolla works on Wikidata (P276 ∪ P195, with image): **68**
- After Phase B retries: **62 kept (91%)**
- 6 lost: Wikidata items without en/es labels (newer entries only labeled in other languages)

### Field coverage on 62 kept
| Field | Coverage |
|---|---|
| title / artist / year / category | 100% |
| medium | 82% |
| dimensions | 48% ← weak (Wikidata doesn't have many Sorolla dims) |

## Done

- `public/data/sorolla-pilot-collection.json` (62 artworks)
- R2 paths: `artworks/sorolla-collection-pilot/{QID}-{hash}-imageUrl.webp`
- Audit: 62/62 OK, 0 placeholder

## Future improvement options (if user wants larger Sorolla set later)

| Option | Effort | Value |
|---|---|---|
| Scrape cultura.gob.es DAM highlights (~30 images, 582×376) | 1 hr | +20-30 works (high dedup with Wikidata) |
| Contact Museo Sorolla for image dataset (info@msorolla.mcu.es) | days/weeks wait | Could get full holdings if cooperative |
| Reverse-engineer CER.es internal full-res URL (auth?) | unknown — may not exist | Risky |

Conclusion: 62 Wikidata works is the practical ceiling without museum cooperation. Most-famous works (Walk on the mountain, Clotilde seated, self-portrait, etc.) are all included.
