# Source Research — GNAM Rome (gnam-rome)

**Museum:** Galleria Nazionale d'Arte Moderna e Contemporanea, Rome (GNAMC)
**Date:** 2026-06-02
**Result:** ❌ ESCALATED — official site unreachable from all available egress.

## START URL is dead
`https://lagallerianazionale.com/en/opere` → returns a 114-byte parked-domain lander
(`window.location.href="/lander"`, sets `traffic_target=gd` / `country=KR` cookies via
openresty). The `lagallerianazionale.com` apex is an **expired/parked domain** now, not the
museum. The catalogue subdomain `opac.lagallerianazionale.com/gnam-web/` is **NXDOMAIN**
(dead). `lagallerianazionale.org` is also NXDOMAIN.

## Real current site exists but is firewall-blocked
The museum migrated to the Ministry of Culture platform:
- Home: `https://gnamc.cultura.gov.it/en/`
- Collection: `https://gnamc.cultura.gov.it/en/collection/`
- Masterpieces list: `https://gnamc.cultura.gov.it/en/capolavori/`
- **Per-artwork detail pages exist** (WordPress "masterpiece" CPT), e.g.
  `https://gnamc.cultura.gov.it/en/masterpiece/ritratto-di-hanka-zborowska/`

DNS resolves: `gnamc.cultura.gov.it → 2.42.228.215`. But **TCP connections never
establish** (SYN dropped — `connect=0.000000` after a 90s connect-timeout) from EVERY path:
- curl, sandbox on AND off
- direct hostname, and resolved-IP via `--resolve` + Host header
- Anthropic WebFetch egress (separate network) → 60s timeout too

Whole `cultura.gov.it` infra (apex `cultura.gov.it → 2.42.229.1`, same /16) is unreachable.
Sanity check: `electa.it`, `it.wikipedia.org`, and `galleriaartemodernaroma.it` (a DIFFERENT
museum — Comune di Roma's GAM) all return HTTP 200 in <0.5s from the same egress. So the
internet works; `*.cultura.gov.it` specifically drops our packets (geo/bot firewall — the
Italian MiC is known to fence non-IT/EU traffic).

## Why not substitute another source
HARD RULE 1 forbids third-party aggregators (Google Arts & Culture, Wikidata, Europeana).
`galleriaartemodernaroma.it` is the wrong institution (Comune di Roma GAM ≠ national GNAMC).
No reachable self-site endpoint remains.

## Recovery path (for a future run)
The catalogue is intact and parseable — only the network is the blocker. Re-run from an
Italian/EU egress or proxy. The site is WordPress; check for `/en/masterpiece/{slug}/` detail
pages (og:image + body fields) and a `/wp-json/wp/v2/` REST endpoint or the collection
listing's pagination/XHR. Switch the slug's START URL to
`https://gnamc.cultura.gov.it/en/collection/`.
