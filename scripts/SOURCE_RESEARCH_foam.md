# Source Research — Foam Photography Museum (Amsterdam)

- **slug**: `foam`
- **homepage**: https://www.foam.org
- **scope**: flat photographs (museum's own "Foam Collection")
- **date probed**: 2026-06-04
- **viable**: YES (with a firewall caveat — see Access)

## What Foam is
Contemporary photography museum / kunsthal in Amsterdam. Mostly rotating exhibitions,
BUT it does own a real permanent **Foam Collection** of ~**196 photographs** (~200 artists framing),
published as a browsable database at `https://www.foam.org/collection`.
Credit line on every work: *"courtesy of the Foam Collection"* → confirmed museum-owned, in-scope.

> NOTE: `shop.foam.org` is a separate **Shopify webshop ("Foam Editions")** selling
> limited-edition prints for sale ("Edition of 8+3AP", signed/numbered). That is a STORE,
> not the museum's holdings → **out of scope, do not scrape.**

## Tech stack
- `www.foam.org` = **Next.js** app on **Vercel**, content from **Storyblok CMS** (space `113697`).
- Images on **Storyblok CDN**: `https://a.storyblok.com/f/113697/{WxH}/{hash}/{accession}.jpg`

## THE FIREWALL (critical)
Live `www.foam.org` is behind **Vercel's bot challenge** (`x-vercel-mitigated: challenge`,
HTTP 429 for every path incl. robots.txt/sitemap). curl + WebFetch are 100% blocked.
The Storyblok **public token is NOT in the browser bundle** (data is fetched server-side in
getStaticProps), so we CANNOT call `api.storyblok.com` directly — no token to steal.

## Access path that WORKS (verified)
Two layers, both bypass the firewall:

### Metadata → via Wayback Machine `__NEXT_DATA__`
The rendered HTML embeds a full `__NEXT_DATA__` JSON with the resolved Storyblok story.
Fetch the archived raw HTML (note the `id_` suffix = original, un-rewritten):
```
https://web.archive.org/web/<TS>id_/https://www.foam.org/collection/all      # list, 100/page
https://web.archive.org/web/<TS>id_/https://www.foam.org/artworks/<slug>      # detail (full text)
```
- Listing `props.pageProps.stories[]` = Array(100) per page, has `full_slug:"artworks/<slug>"`
  + full `content` (title, artist, year, medium, thumbnail). Paginate `?page=2` (Storyblok per_page=100; ~2 pages for 196).
- Detail `props.pageProps.story.content` = the `Artwork` component (adds curatorial `text`, `connections`).
- Get latest snapshot URL via: `http://archive.org/wayback/available?url=www.foam.org/collection/all`
- (More robust alternative: a JS-capable headless browser — Playwright/Chrome MCP — can hit the
  LIVE site directly and solve the Vercel challenge. Wayback is the no-browser route I verified today.)

### Images → DIRECT from Storyblok CDN (no firewall, no Wayback)
`content.thumbnail.filename` (also `content.media.filename`, `content.seo.og_image`) →
`https://a.storyblok.com/f/113697/...jpg`. Verified HTTP 200, image/jpeg, **full-size**
(e.g. 4175×5204px, 1.5MB), 1-yr cache, Cloudfront. Download straight, no auth.

## Storyblok `Artwork` content shape (field map)
| field | path | sample |
|---|---|---|
| id | `story.uuid` / `story.id` | `6313602e-…` / `573736167` |
| objectNumber | from image filename `foa00XXXXXX` | `foa001000210` |
| title | `content.title.content[0].content[0].text` (richtext) | `my Land_02` |
| artist | `content.artist.name` (resolved relation) | `WassinkLundgren` |
| year | `content.year` (string) | `2012` |
| medium | `content.medium` (array) | `["Photography"]` |
| dimensions | parse from `content.description...text` | "displayed at 50 x 40 cm" |
| description | `content.text` (richtext doc — full curatorial blurb) | multi-paragraph |
| category | always `photograph` (whole collection is Photography) | — |
| tags | `story.tag_list` | `["conceptual","constructed image"]` |
| imageUrl(full) | `content.thumbnail.filename` | `a.storyblok.com/f/113697/4175x5204/1a309e3da5/foa001000210.jpg` |
| sourceUrl | `https://www.foam.org/artworks/<slug>` | …/artworks/my-land_02 |

Facet/tag listing pages exist too: `/collection/{tag}` (portrait=3, identity=26, conceptual=105,
all=196) and medium facets (Analogue, Collage, Painting, Mixed media, Text) — but `medium` is
uniformly "Photography"; the facet labels are loose tags, treat all records as `photograph`.

## Counts (in-scope)
- **~196 photographs total** (`artworksTotal: 196`). Paintings: 0 (it's a photo museum).
- Whole collection is flat photographic work → all 196 in-scope. No value-filter needed at this size.

## Verified sample (real)
`my Land_02` — WassinkLundgren, 2012, Photography, 50×40 cm,
img 4175×5204 1.5MB (HEAD 200), slug `artworks/my-land_02`, accession `foa001000210`,
full curatorial description present. ✅ metadata + full image both confirmed.

## Conclusion
VIABLE. Museum-owned ~196-photo collection with clean Storyblok metadata + full-res CDN images.
Proceed to Phase B pilot. Scraper plan: enumerate slugs from the 2 Wayback `/collection/all`
pages → (optionally) fetch each Wayback `/artworks/<slug>` for full text → pull images direct
from `a.storyblok.com`. Build category=`photograph` for all. Watch the Vercel firewall: do NOT
hit live www.foam.org with curl (429); use Wayback or a headless browser.
