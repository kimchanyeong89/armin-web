# Source Research: Kiran Nadar Museum of Art (KNMA)

**Slug**: `kiran-nadar`
**Website**: https://www.knma.in/collections
**Phase A date**: 2026-05-27
**Conclusion**: ⛔ **ESCALATE** — no scrape-able source via standard tooling

---

## Probed endpoints

| URL | Status | Notes |
|---|---|---|
| `https://www.knma.in/collections` | 403 (Cloudflare) | curl + WebFetch + full Chrome headers all blocked |
| `https://www.knma.in/robots.txt` | 403 | Entire domain locked at edge |
| `https://www.knma.in/sitemap.xml` | 403 | Same |
| `https://ams.knma.in/` | 200 | **Internal staff login portal** ("Art Management System"). Dropdown categories: KNMA / HCL Corp. / SNF. Not a public catalog. |
| `https://archive.knma.in/` | 401 | HTTP Basic Auth required |
| `https://archive.knma.in/collection` | 401 | Same |

### Cloudflare response headers (www.knma.in)
```
HTTP/2 403
server: cloudflare
cf-cache-status: DYNAMIC
cf-ray: a0214597ca975141-ICN
```
→ Active bot-management policy, not a static rule. UA / Sec-CH-UA / Sec-Fetch-* spoofing did not bypass.

---

## What KNMA does publish

From WebSearch (Google indexed pages, not fetchable):
- "Online Exhibitions" — curated web pages (HTML-only, no structured catalog)
- Press releases / catalog PDFs (downloads page)
- Virtual tours

There is **no public API, no IIIF, no bulk export, no sitemap, no machine-readable catalog**. The stated collection is ~10,000 works but none is exposed in a programmatic form.

---

## Pipeline assessment vs COLLECTION_SCRAPING_GUIDE.md §3 Phase A

Tried in priority order:
1. Open API (no key) → ❌ none documented
2. Keyed API → ❌ none documented
3. Bulk download (CSV/JSON) → ❌ none
4. IIIF manifest → ❌ no IIIF endpoint
5. Site-internal JSON (DevTools Network) → ❌ can't reach page to probe
6. HTML scrape → ❌ Cloudflare edge block

---

## Escalation options (for human decision)

### Option A — Headless browser with stealth (heavy infra)
- Playwright + `playwright-extra` + `stealth` plugin + residential proxy
- Risk: brittle, slow, may get IP-banned mid-scrape
- Cost: setup ~hours, proxy ~$50+/mo
- Coverage: probably reaches the "Online Exhibitions" pages, but those are curated subsets — not the full ~10K collection

### Option B — Chrome MCP (manual-assisted)
- Use `mcp__Claude_in_Chrome__*` from a real user-driven browser session
- Works because the user is actually present on the page
- Slow (each page = manual+browser cycle), but no proxy/anti-bot battles
- Best for ~50-200 highlight artworks, not full collection

### Option C — Contact museum directly
- KNMA has email `info@knma.in`. Many institutions release datasets to researchers on request.
- Slowest path (days/weeks) but if successful gives clean CSV/JSON.

### Option D — Drop KNMA, replace with another Indian contemporary museum
- Already in `MUSEUM_SCRAPING_LIST.md`: NGMA New Delhi (#52, ✅), Salar Jung (#54, 🟡)
- Could add: Devi Art Foundation (Gurgaon) — has some online; or NGMA Mumbai branch

---

## Decision log

- **2026-05-27**: Phase A blocked. Awaiting human decision on Options A/B/C/D.
- Recommend: skip KNMA in the current pass; revisit once a Chrome MCP–assisted workflow is established. Move `Status` in `MUSEUM_SCRAPING_LIST.md` to `escalated`.
