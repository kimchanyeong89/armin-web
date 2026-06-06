# Source Research — Museum Ludwig (Cologne)

**Slug:** `museum-ludwig`
**Date:** 2026-05-27
**Self-site:** `https://museum-ludwig.kulturelles-erbe-koeln.de` — subdomain of the City of Cologne's
official municipal digital-heritage portal `kulturelles-erbe-koeln.de` (Kulturelles Erbe Köln / KEK).
This is an official government self-site for Museum Ludwig records → allowed by the rules.
(The museum's main site `museum-ludwig.de/en/collection/` has no per-artwork online catalogue;
it links out to the KEK portal for object records.)

## Endpoint structure (ETE / "Erfassung-Transfer-Editor" portal)

Session-based search portal. State is held server-side keyed by a cookie.

- **Reset search:** `GET /ete?action=neueSuche`
- **Apply sub-collection filter:** `GET /ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term={URLENC}`
  - `term=001\Malerei` (paintings), `002\Skulptur` (sculpture), `005\Fotografie` (photography), `006\Grafik` (graphics/prints)
  - The backslash must be URL-encoded (`%5C`).
- **Paginate:** `GET /ete?action=displayResult/{offset}` — offset starts at 1, increments by **60**.
  - **60 unique `obj/{id}` per page, zero overlap** between pages. Confirmed.
- **Artwork detail page:** `GET /documents/obj/{id}` — `id` is 8 digits (e.g. `05010200`).

### Sub-collection counts (Documente, confirmed live)
| Sub-collection | term | count | in scope? |
|---|---|---|---|
| Malerei (painting) | `001\Malerei` | **1214** | ✅ painting |
| Skulptur (sculpture) | `002\Skulptur` | 713 | ❌ excluded |
| Fotografie (photography) | `005\Fotografie` | **16788** | ✅ photograph |
| Grafik (graphics/print) | `006\Grafik` | **6794** | ✅ print/drawing |

Total in-scope ≈ 24,796 → **far over the 1500 cap.** Strategy: take all 1214 paintings (core,
prestigious, most complete metadata), then top up toward ~1500 with Grafik (prints) and Fotografie.

## ⚠️ Proof-of-Work gate (the reason prior `.cjs` attempts produced 0 records)

Every URL first returns a **5756-byte JS challenge shell** (`<title>Service Status - Proof-of-Work</title>`),
NOT the content. The page embeds:
```js
const challenge = {"nonce":"...","ts":1780402843,"difficulty":1,"challenge":"<base64>","sig":"<hex>"};
```
Client must find integer `solution` such that `sha256(nonce + ts + solution)` starts with
`difficulty` leading "0" chars (difficulty observed = 1 → trivial, a handful of iterations),
then `POST` the same URL with body `solution, challenge, sig`. Server replies `{"status":"ok"}`
and sets cookie `pow_token=...` (Max-Age 3600 = **1 hour**). Reload → real content.

This is fully solvable headlessly with `node:crypto` — **no browser needed.** Old scrapers used
Playwright and parsed the challenge shell as if it were the listing → 0 links.

## Detail-page metadata markup (`/documents/obj/{id}`)

Charset: **ISO-8859-1** (HTTP header `text/html;charset=ISO-8859-1`). Decode response bytes with
`TextDecoder('windows-1252')` then resolve HTML entities (`&uuml;` etc.). Reading the text twice or
as utf-8 corrupts umlauts (`0xe4`→`ä`).

Clean structured block (one record):
```html
<div class="Bausteine Autor"><a href="...toggleDetail/kue::...">Abelen, Peter</a></div>
<div class="Bausteine Titel">Bildnis Kathe Abelen, <p class="kursiv">[Portrait of Käthe Abelen]</p></div>
<div class="Bausteine Datierung">1914</div>
<div class="Bausteine Material_Technik">Öl auf Pappe,</div>
<div class="Bausteine Maße">41,5 x 32,3 cm</div>
<div class="Bausteine Verwalter"><span>Köln, </span>... Inv.-Nr. ML 76/2943, ...</div>
```
Parse rule: **non-greedy** `<div class="Bausteine {FIELD}">([\s\S]*?)</div>`, strip the
`<p class="kursiv">[English translation]</p>` (we keep the German main title), strip remaining tags,
collapse whitespace, drop trailing `,`/`;`.

- `artist` ← `Bausteine Autor` (inside `<a>`; the old `[^<]+` regex failed here)
- `title` ← `Bausteine Titel` (German main title; kursiv `[...]` is the EN translation — dropped)
- `date`/`year` ← `Bausteine Datierung`
- `medium` ← `Bausteine Material_Technik`
- `dimensions` ← `Bausteine Maße` (class literally contains `ß`; also try `Ma&szlig;e`)
- `objectNumber` ← `Inv.-Nr. {…}` inside `Bausteine Verwalter`
- some records also have `Bausteine Objektbezeichnung` / `Bausteine Gattung`

## Image URLs

Detail page has `<img class="thumb" src="{thumbnail}" altsrc="{standard}">` on host
`kekmedien.kulturelles-erbe-koeln.de`:
- **high-res** = `altsrc` → `.../standard/<path>.jpg?Expires=...&Signature=...&Key-Pair-Id=...` (CloudFront-signed, short TTL)
- thumbnail = `src` → `.../thumbnail/<path>.jpg?...`
Records with no image fall back to `bilder/dummyCR-de-large.jpg` / `bilder/dummy-Fehler_de.jpg`
(reject these as placeholders). Download the signed `standard/` URL immediately (TTL ~hours).

## Conclusion

Usable via HTML scraping with a PoW handshake. Enter Phase B (pilot 100) → Phase C (full, capped ~1500).
Source type: `kek-pow+html`.
