# Source Research — Kimbell Art Museum (Fort Worth, USA)

**Slug:** `kimbell`
**Collection page:** https://www.kimbellart.org/collection
**Date probed:** 2026-06-05 (Phase A only — find + test, no scrape)
**Verdict:** ⚠️ **NOT viable for a plain HTTP scraper.** Whole domain behind a Cloudflare *managed JS challenge* (HTML **and** images). Metadata is rich + structured (JSON-LD), collection is tiny (~339–350 works), so it is *conditionally* recoverable only via a **headless real browser** (Playwright-stealth / Chrome MCP) that solves the challenge and holds `cf_clearance`. No open API / dump / OAI-PMH. The dedicated IIIF image host from 2021 (`images.kimbellart.org`) now NXDOMAINs.

---

## 1. Platform

- **Stack:** Drupal 8 CMS + TMS (collection mgmt) + IIIF deep-zoom. Built by **Cogapp** (case study: cogapp.com/work/kimbell-art-museum). TNEW ticketing + Shopify store on same domain.
- **Object-page URL (current scheme):** `https://kimbellart.org/collection/{accession-slug}`
  - examples (verified live-archived): `apg-198003` (Cézanne), `ap-197106` (Bellini Madonna), `ap-199504` (Degas), `ap-197121` (Pissarro).
  - slug = lowercased accession prefix + year + seq (e.g. `APg 1980.03` → `apg-198003`).
- **Legacy scheme (pre-2016, dead):** `…/collection-object/{title-slug}` — superseded.
- **Collection size:** ~350 works (small, single-collector founding gift + targeted acquisitions). Wayback CDX shows **339 distinct `/collection/{slug}` object pages** archived → matches "essentially the whole collection."

## 2. THE BLOCKER — Cloudflare managed challenge (domain-wide)

Every path on `kimbellart.org` / `www.kimbellart.org` returns **HTTP 403** with a Cloudflare interstitial:
```
cf-mitigated: challenge
server: cloudflare
<title>Just a moment...</title>   window._cf_chl_opt = { ... cType: 'managed' ... }
```
- Gated paths confirmed: `/collection`, `/collection/search`, `/robots.txt`, `/sitemap.xml`, **and static image derivatives** `/sites/default/files/styles/large/public/collection_images/AP1980_03_MAIN.jpg`.
- This is the **JS-fingerprint** flavour (not a simple UA block). Full browser headers + Sec-CH-UA hints do **not** pass it. A Node/curl pipeline cannot scrape here.
- **Only a headless browser** (Playwright with stealth, or the Chrome MCP) that executes the challenge JS and reuses the `cf_clearance` cookie can fetch pages — and Cloudflare managed mode commonly re-challenges + rate-limits, so even that is fragile. ~350 pages is low volume, which helps.

## 3. No open machine source (checked, all negative)

- **Public API:** none. Search across museum-API directories (DAHD, museum-api, Cogapp) — Kimbell is NOT listed among open-data museums (unlike AIC, Getty, Harvard, artsmia, Cleveland, Brooklyn).
- **GitHub CC0 dump:** none.
- **OAI-PMH / CSV / data export:** none found.
- **IIIF collection/manifest endpoint:** none documented; the per-object IIIF host is dead (see §5).

## 4. Metadata IS clean + complete (proven via Wayback)

`http://web.archive.org/web/20210918220334id_/https://kimbellart.org/collection/apg-198003` (54 KB, fully rendered) contains everything. Two extraction surfaces:

**(a) JSON-LD `VisualArtwork`** (`<script type="application/ld+json">`):
```json
{ "@type":"VisualArtwork",
  "identifier":"APg 1980.03",
  "name":"Man in a Blue Smock",
  "url":"https://kimbellart.org/collection/apg-198003",
  "description":"Starting around 1887, using his wife and son as models, Cézanne began to paint single figures…" }
```

**(b) Drupal `field--name-*` divs** (label + `field__item`):
| field | value (real sample) |
|---|---|
| title | Man in a Blue Smock |
| artist | Paul Cézanne (1839 – 1906) |
| date | c. 1896–97 |
| medium | Oil on canvas |
| dimensions | 32 1/16 x 25 1/2 in. (81.5 x 64.8 cm); Framed: 40 15/16 x 35 1/2 x 3 1/2 in. |
| accession | APg 1980.03 |
| description | full curator text (also in og:description + JSON-LD) |

→ Meets the 6-standard / 4-required rule comfortably. Detail-page parsing (JSON-LD + field divs) would be straightforward **if** the page could be fetched.

## 5. Image URL structure (host now DEAD)

2021 snapshot referenced a dedicated IIIF Image-API server:
- IIIF: `https://images.kimbellart.org/iiif/apg-1980.03.ptif/full/!512,512/0/default.jpg`
  - → full res would be `…/full/full/0/default.jpg` or `…/full/2048,/0/default.jpg`.
- Deep-zoom: `https://images.kimbellart.org/dzi/apg-1980.03.ptif.dzi`
- Public Drupal derivative (og:image): `https://kimbellart.org/sites/default/files/styles/large/public/collection_images/AP1980_03_MAIN.jpg`

**Live status (2026-06-05):**
- `images.kimbellart.org` → **NXDOMAIN** (host retired/renamed; current image host not externally discoverable).
- The Drupal derivative on the main domain → **403 Cloudflare challenge** (images gated too).
- Guessed IIIF hosts (`kimbell.iiif.cloud`, `iiif-kimbell.s3…`) resolve but serve nothing on tested paths.
- **Net: no full-resolution image was obtainable in Phase A.** This is the second hard blocker.

## 6. One unblocked museum-own host (partial)

`https://50.kimbellart.org/` — the **50th-anniversary WordPress microsite** — returns **HTTP 200, NO Cloudflare challenge**. It has a paginated `/collection/` highlights gallery (pages `collection-2` … `collection-12`) listing works (`standing-buddha`, `chibinda-ilunga`, `portrait-may-sartoris`, `cardsharps`, …). BUT direct `/collection/{slug}/` detail URLs **404** → detail is rendered client-side (SPA/modal) and it only covers a **curated highlights subset**, not the full ~350 with per-object JSON-LD. Weaker than the (blocked) main site; not a substitute for the full collection.

## 7. Recommendation

- **Do NOT** attempt a plain `node-fetch`/curl pipeline — it will 100% hit the Cloudflare wall.
- **If pursued:** Phase B must use a **headless real browser** (Chrome MCP / Playwright-stealth):
  1. Load `https://kimbellart.org/collection`, solve challenge, capture `cf_clearance`.
  2. Enumerate object slugs (≈339 from Wayback CDX `kimbellart.org/collection/*`, or the on-page browse/search) — *small, finite list*.
  3. Per object: parse JSON-LD + `field--name-*` divs (metadata is clean).
  4. **Images:** discover the *current* IIIF/image host from a live page's `og:image` / deep-zoom viewer (the 2021 `images.kimbellart.org` is dead). Fetch full-res through the same browser session.
- **Cost/benefit:** ~350 flat works (mostly Old Master + Impressionist + Asian paintings — high quality) vs. a Cloudflare-managed-challenge browser scrape with a still-unknown live image host. Viable but **not cheap**; lower priority than open-API museums (artsmia, DMA, Nelson-Atkins eMuseum) which are clean wins.

## 8. Cross-task note (other museums in the brief's hints — NOT Kimbell, verify separately)

The brief's hints reference alternative museums with *open* sources (these are the easy wins, unlike Kimbell):
- **artsmia (Minneapolis):** ✅ confirmed — `github.com/artsmia/collection` (CC0 JSON dump, ~1×/day updates) + images `https://api.artsmia.org/images/{id}/{small|medium|large}.jpg`. Museum-own, OK. Clean win.
- **DMA / Nelson-Atkins (eMuseum) / Walker:** not probed here (out of Kimbell scope) — flagged for their own Phase-A tasks.
