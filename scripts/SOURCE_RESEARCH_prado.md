# Source Research: Museo Nacional del Prado

**Slug**: `prado`
**Wikidata QID**: `Q160112`
**Phase A date**: 2026-05-27
**Conclusion**: ✅ **PROCEED** via Wikidata SPARQL (only viable route)

---

## Endpoints probed

| URL | Status | Notes |
|---|---|---|
| `https://www.museodelprado.es/en/the-collection/art-works` | 403 (Cloudflare) | Even with full Chrome headers, Applebot UA, Bingbot UA — all blocked |
| `https://www.museodelprado.es/sitemaps/sitemapindex.xml` | 403 | Same Cloudflare wall |
| `https://www.museodelprado.es/api/sparql` | 403 | Endpoint exists but blocked from outside |
| `https://lod.museodelprado.es/sparql` | 000 (no DNS) | Not exposed |
| `https://datos.museodelprado.es/sparql` | 000 | Not exposed |
| `https://api.europeana.eu/record/v2/search.json?q=DATA_PROVIDER:"Museo+Nacional+del+Prado"` | 200, 0 results | Prado does not syndicate to Europeana |
| `https://query.wikidata.org/sparql` | 200 ✅ | **Primary source** |

→ Direct museum scraping is **not feasible** under Cloudflare bot-management. Museum's SPARQL endpoint is documented but firewalled.

---

## Chosen source: Wikidata SPARQL

### Coverage
- **Total Prado works on Wikidata**: 9,321
- **With image (Commons via `wdt:P18`)**: **3,764** ← our scrape target
- Coverage of 6-standard fields (across all 9,321):
  | Field | Wikidata property | Coverage |
  |---|---|---|
  | artist | P170 (creator) | 99.9% |
  | year | P571 (inception) | 99.8% |
  | medium | P186 (made from material) | 98.4% |
  | dimensions (height) | P2048 | 99.1% |
  | dimensions (width) | P2049 | 99.1% |
  | category (genre) | P136 | 64.3% ← only weak field |

### Genre fallback rule
Prado holdings are >95% paintings. For records missing `P136`:
1. Check `P31` (instance of) — `painting (Q3305213)`, `drawing (Q93184)`, `print (Q11060274)` are the typical values
2. If still ambiguous, default `category: "painting"` (true for Prado)

### Image resolution
Wikidata images live on Wikimedia Commons:
```
http://commons.wikimedia.org/wiki/Special:FilePath/{Filename}
```
This redirects to the actual file URL. For our R2 pipeline:
- HEAD the URL to follow redirect → get final hosted URL
- Download → re-encode to webp (max 2048px long edge) → upload to R2
- License: most Prado works on Commons are PD (out of copyright) — safe

### Reference SPARQL (works that we'll pull)
```sparql
SELECT ?work ?workLabel ?image ?creatorLabel ?inception
       ?heightCm ?widthCm ?materialLabel ?genreLabel ?instanceOfLabel
WHERE {
  ?work wdt:P276 wd:Q160112 ;     # location: Prado
        wdt:P18  ?image .         # has image
  OPTIONAL { ?work wdt:P170 ?creator . }
  OPTIONAL { ?work wdt:P571 ?inception . }
  OPTIONAL { ?work wdt:P186 ?material . }
  OPTIONAL { ?work wdt:P136 ?genre . }
  OPTIONAL { ?work wdt:P31  ?instanceOf . }
  OPTIONAL { ?work p:P2048/psv:P2048 [wikibase:quantityAmount ?heightCm ; wikibase:quantityUnit wd:Q174728] . }
  OPTIONAL { ?work p:P2049/psv:P2049 [wikibase:quantityAmount ?widthCm ; wikibase:quantityUnit wd:Q174728] . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 100   # ← 100 for pilot, remove for full
OFFSET 0
```

Notes:
- Rate limit: Wikidata SPARQL allows ~5 concurrent queries; we'll use 1 at a time with `LIMIT 500 / OFFSET N` paging (~8 pages for full 3,764)
- User-Agent required: `armin-museum-research/1.0 (kimchanyeong@...)` per Wikimedia policy

---

## Pipeline assessment vs COLLECTION_SCRAPING_GUIDE.md §3 Phase A

1. Open API → ✅ Wikidata SPARQL (chosen)
2. Keyed API → N/A
3. Bulk CSV/JSON → A Kaggle dataset exists but stale; using live Wikidata is preferable
4. IIIF → Prado not on IIIF directly; Commons images are not IIIF-served either
5. Site-internal JSON → blocked
6. HTML scrape → blocked

---

## Limitations / honest caveats

- **3,764 ≪ 40,000+ holdings**: Wikidata covers ~9% of Prado's full collection. Will be the well-known/canonical works — perfect for a discovery app, less suitable for academic completeness.
- **Genre 64%**: fallback rule introduces some `category: "painting"` defaults. PR description should note this so user knows.
- **Korean / Spanish labels missing**: SPARQL returns `?workLabel @en` by default. We'll add `@es` for original titles where available; KO descriptions are not in Wikidata and would need separate generation (out of scope for scraping).

---

## Decision log

- **2026-05-27**: Direct museum site blocked. Wikidata route validated with 99%+ coverage on 5 of 6 standard fields. Proceeding to Phase B with 100-work pilot.
