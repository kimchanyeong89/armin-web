# Source Research — Museo di Capodimonte (Naples)

- **Slug:** capodimonte
- **Date probed:** 2026-06-02
- **Status:** ESCALATED — site unreachable (TCP-level block)

## Domains tried
| Host | DNS | Result |
|---|---|---|
| capodimonte.cultura.gov.it | 2.42.229.118 | HTTP 000 (TCP connect timeout, 6+ retries, http+https, multiple UAs/paths) |
| museocapodimonte.it | 180.182.54.1 | HTTP 000 |
| www.museocapodimonte.it | 1.214.68.2 | HTTP 000 / ECONNREFUSED |
| cultura.gov.it (parent) | — | HTTP 000 |

Paths tried: `/`, `/it/`, `/collezioni/`, `?lang=en`.

## Connectivity diagnosis
- Raw TCP probe to 2.42.229.118: **ports 80 AND 443 both BLOCKED** (connect timeout before any TLS handshake).
- Tried with sandbox disabled (`dangerouslyDisableSandbox`) — same result, so not an egress sandbox restriction.
- WebFetch (Anthropic egress, different IP) — also timed out (capodimonte) / ECONNREFUSED (museocapodimonte).
- **Control proved network is healthy:** google.com → 200 (0.4s), wikipedia → 301, sibling Italian museum pinacotecabrera.org → 200 (0.4s).
- Conclusion: the block is specific to the `capodimonte.cultura.gov.it` / `cultura.gov.it` host (likely geo-fenced or firewall packet-drop for this network range). Not a transient outage — consistent across all retries.

## Catalogue availability (via search metadata only, not scraped)
- Capodimonte's collection (~47,000 works) is surfaced publicly mainly through **Google Arts & Culture** and **Wikimedia Commons** — both are third-party aggregators forbidden by HARD RULE 1 (self-site only).
- No reachable self-hosted per-artwork catalogue / API / IIIF endpoint could be confirmed because the host itself is unreachable.

## Recommendation for next attempt
Re-probe from an EU/Italian egress (or a proxy that can reach Italian gov infrastructure). Once `capodimonte.cultura.gov.it` is reachable, inspect for a Drupal-based collezioni/opere catalogue + DevTools Network JSON/IIIF before falling back to HTML scraping. Do NOT substitute Google Arts & Culture / Wikimedia.
