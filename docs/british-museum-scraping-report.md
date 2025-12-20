# British Museum Collection Website - Scraping Research Report

**Date:** December 18, 2025  
**Purpose:** Comprehensive analysis of britishmuseum.org collection website structure for scraping

---

## Executive Summary

The British Museum website (www.britishmuseum.org) is a **challenging scraping target** due to:
- Cloudflare protection requiring JavaScript execution
- Cookie consent modals blocking content
- Dynamic content loading via client-side JavaScript
- No publicly documented REST/GraphQL API

**Recommended Approach:** Use Puppeteer-extra with Stealth plugin (already implemented in your codebase) or Playwright with cookie consent handling.

---

## 1. Website Structure Overview

### Main Collection URLs
| Purpose | URL Pattern |
|---------|-------------|
| Collection Home | `https://www.britishmuseum.org/collection` |
| Galleries Index | `https://www.britishmuseum.org/collection/galleries` |
| Collection Search | `https://www.britishmuseum.org/collection/search` |
| Object Detail | `https://www.britishmuseum.org/collection/object/{OBJECT_ID}` |
| Gallery Room | `https://www.britishmuseum.org/collection/galleries/{GALLERY_SLUG}` |

### URL Patterns Discovered
- **Object IDs:** Format like `Y_EA24`, `G_1969-0402-1`, `E_Oc1978-Q-839`
  - Prefix indicates department: `Y_` (Egypt), `G_` (Greece/Rome), `E_` (Ethnography), etc.
- **Gallery Slugs:** Format like `room-4-egyptian-sculpture`, `room-33-greek-and-roman-sculpture`

---

## 2. Gallery Rooms - Complete Reference

Based on Wikipedia and existing scrapers, here is the complete room inventory:

### Department of Egypt and Sudan
| Room | Name | Key Objects |
|------|------|-------------|
| **Room 4** | Egyptian Sculpture (Main Gallery) | Rosetta Stone, Younger Memnon (Ramesses II bust), Amenhotep III statues, Senusret III statues |
| Room 61 | Egyptian Paintings | Tomb of Nebamun frescoes |
| Room 62 | Egyptian Death & Afterlife | Fayum mummy portraits |
| Room 63 | Egyptian Mummies | Henutmehyt coffins |
| Room 64 | Egyptian Prehistoric | Gebelein predynastic mummies |
| Room 65 | Egyptian Daily Life | Book of the Dead papyri |

### Department of Greece and Rome
| Room | Name | Key Objects |
|------|------|-------------|
| **Room 1** | Enlightenment Gallery | Farnese Hermes |
| Room 12 | Aegina Treasure | Minoan Gold Jewellery |
| **Room 17** | Nereid Monument | Xanthos sculptures |
| **Room 18** | Parthenon Sculptures | Elgin Marbles, Metopes |
| **Room 19** | Erechtheion | Caryatid, Ionic columns |
| Room 20 | Lycia/Payava Tomb | Tomb of Payava |
| **Room 21** | Mausoleum at Halicarnassus | Maussollos statues, chariot horse |
| **Room 22** | Temple of Artemis | Column from Ephesus, Asclepius head |
| **Room 23** | Later Greek Sculpture | Crouching Venus, Apollo of Cyrene |
| Room 69 | Roman Life | Gladiator helmet from Pompeii |
| Room 70 | Roman Britain | Mildenhall Treasure, etc. |
| Room 84 | Townley Collection | Roman sculptures |
| Room 85 | Roman Portrait Sculpture | Imperial busts |

### Department of the Middle East (Assyria/Mesopotamia)
| Room | Name | Key Objects |
|------|------|-------------|
| **Room 6** | Assyrian Sculpture | Lamassu (winged bulls), Black Obelisk |
| Room 7 | Nimrud NW Palace | Ashurnasirpal II reliefs |
| Room 8 | Tiglath-Pileser III | Palace reliefs |
| Room 9 | Nineveh Palace | Sennacherib reliefs |
| **Room 10** | Royal Lion Hunt | Ashurbanipal lion hunt reliefs |
| Room 52 | Ancient Iran | Oxus Treasure |
| Room 53 | South Arabia | Yemen stelae |
| Room 54 | Anatolia | |
| Room 55 | Cuneiform & Mesopotamia | Epic of Gilgamesh tablets, Ishtar relief |
| **Room 56** | Mesopotamia | Standard of Ur, Ram in a Thicket, Royal Game of Ur |
| Room 57 | Nimrud Ivories | Phoenician ivory carvings |
| Room 89 | Assyrian Gallery | Additional reliefs |

### Department of Britain, Europe & Prehistory
| Room | Name | Key Objects |
|------|------|-------------|
| Room 2 | Prehistory | Olduvai handaxe, Ain Sakhri lovers |
| Room 2a | Waddesdon Bequest | Renaissance metalwork |
| Room 3 | Ice Age Art | Swimming Reindeer |
| Room 38 | Clocks & Watches | Mechanical Galleon |
| Room 39 | Horology | Tompion clocks |
| Room 40 | Medieval Europe | Royal Gold Cup, Lewis chessmen |
| Room 41 | Sutton Hoo | Sutton Hoo helmet & treasure |
| Room 49 | Roman Britain | Mildenhall Treasure, Hinton St Mary Mosaic |
| Room 50 | Iron Age Britain | Wandsworth Shield, torcs |
| Room 51 | Bronze Age Europe | Mold gold cape |

### Department of Asia
| Room | Name | Key Objects |
|------|------|-------------|
| **Room 33** | Asia Gallery | Amaravati sculptures, Chinese bronzes, Gandhara Buddha |
| Room 33a | Amaravati | Buddhist limestone reliefs |
| Room 91 | Chinese Painting | Admonitions Scroll |
| Room 92-94 | Japan | Samurai armour, ukiyo-e prints |
| Room 95 | Sir Percival David Collection | Chinese ceramics |

### Department of Africa, Oceania & Americas
| Room | Name | Key Objects |
|------|------|-------------|
| Room 24 | Living & Dying (Wellcome) | Hoa Hakananai'a (Easter Island moai), Hawaiian feathers |
| **Room 25** | Africa | Benin Bronzes, Queen Idia mask |
| Room 26 | North America | Hopewell culture pipes |
| Room 27 | Mexico | Aztec turquoise serpent, Maya lintels |

### Great Court (Central)
| Location | Key Objects |
|----------|-------------|
| Great Court | Colossal Amenhotep III statue, Nectanebo II obelisks, Totem poles |

---

## 3. Object Data Structure

### Object Page Metadata Fields

Based on analysis, object pages contain these metadata fields:

```json
{
  "objectNumber": "Y_EA24",
  "title": "Object title/name",
  "description": "Full description text",
  "objectType": "sculpture/painting/artifact type",
  "materials": "Stone/Bronze/Gold/etc",
  "technique": "Manufacturing technique",
  "dimensions": {
    "height": "value cm",
    "width": "value cm",
    "depth": "value cm"
  },
  "date": {
    "text": "c. 1250 BC",
    "from": -1250,
    "to": -1200
  },
  "culture": "Egyptian/Greek/Roman/etc",
  "findSpot": "Location where found",
  "acquisition": {
    "date": "1802",
    "method": "Purchased/Donated/etc",
    "source": "From whom acquired"
  },
  "currentLocation": {
    "gallery": "Room 4",
    "onDisplay": true
  },
  "departments": ["Egypt and Sudan"],
  "bibliography": ["references"],
  "relatedObjects": ["object_ids"],
  "images": [
    {
      "primary": true,
      "url": "https://...",
      "copyright": "© The Trustees of the British Museum"
    }
  ]
}
```

---

## 4. Image URL Patterns

### Standard Collection Images
```
https://media.britishmuseum.org/media/Repository/{SIZE}/{PATH}/{FILENAME}
```

### Image Size Variants
| Size Code | Dimensions | Usage |
|-----------|------------|-------|
| `thumb` | ~100px | Thumbnails |
| `small` | ~320px | List views |
| `mid` | ~640px | Preview |
| `large` | ~1024px | Detail view |
| `preview` | ~1400px | High-res preview |

### Example Image URLs
```
# Thumbnail
https://media.britishmuseum.org/media/Repository/thumb/XXX/YYY/image.jpg

# High resolution
https://media.britishmuseum.org/media/Repository/original/XXX/YYY/image.jpg
```

**Note:** High-resolution downloads may require IIIF API access or scraping the viewer.

---

## 5. API Investigation

### Discovered Endpoints

An internal API exists at:
```
https://www.britishmuseum.org/api/collection/search
```

**Status:** Returns `{"hits":{"hits":[],"total":0}}` when accessed directly - likely Elasticsearch-based but requires:
1. Valid session/cookies
2. JavaScript execution first
3. Proper referrer headers

### Potential API Parameters (inferred)
```
/api/collection/search?
  keyword={search_term}
  &page={page_number}
  &size={results_per_page}
  &view={grid|list}
  &sort={field}
  &object={object_type}
  &place={location}
  &material={material_type}
```

### No Public API
The British Museum does **not** provide a public documented API. All data must be scraped from rendered HTML.

---

## 6. Website Technical Details

### Stack
- **CMS:** Drupal (identified from sitemap XML)
- **Protection:** Cloudflare with JavaScript challenge
- **Cookies:** OneTrust consent management
- **Search:** Elasticsearch (internal)
- **Images:** Custom media repository

### Key DOM Selectors

```javascript
// Gallery links on galleries page
'a[href*="/collection/galleries/"]'

// Object links on any page
'a[href*="/collection/object/"]'

// Object images
'img[src*="media.britishmuseum.org"]'

// Cookie consent button
'#onetrust-accept-btn-handler'
'button:has-text("Allow all cookies")'

// Object title
'h1, .object-title, .page-title'

// Object metadata (dt/dd pairs)
'dl dt, dl dd'
```

---

## 7. Recommended Scraping Approach

### Option 1: Puppeteer-Extra with Stealth (Current)
Your existing scraper at `scripts/scrape-british-museum-galleries-puppeteer.cjs` is the right approach.

**Improvements needed:**
1. Better cookie consent handling
2. Longer wait times for content loading
3. Multiple scroll passes to trigger lazy loading
4. Retry logic for Cloudflare challenges

### Option 2: Hybrid Approach
1. Use Wikipedia for room/gallery metadata (reliable, structured tables)
2. Use BM website for object details and images
3. Cross-reference object IDs

### Option 3: Alternative Data Sources
- **Wikipedia:** Has structured tables with object listings per room
- **ResearchSpace:** BM's research platform at collection.britishmuseum.org (SPARQL endpoint)
- **Wikidata:** BM objects are often linked with Wikidata QIDs

---

## 8. Sample Room Data Structure

```json
{
  "id": "4",
  "title": "Room 4: Egyptian Sculpture",
  "url": "https://www.britishmuseum.org/collection/galleries/room-4-egyptian-sculpture",
  "department": "Egypt and Sudan",
  "description": "The largest gallery in the museum, featuring monumental Egyptian sculpture",
  "items": [
    {
      "id": "y-ea24",
      "name": "Rosetta Stone",
      "objectNumber": "Y_EA24",
      "artist": null,
      "year": -196,
      "materials": "Granodiorite",
      "image": "https://media.britishmuseum.org/...",
      "url": "https://www.britishmuseum.org/collection/object/Y_EA24"
    }
  ]
}
```

---

## 9. Known Hardcoded Gallery URLs

For fallback when scraping fails, use these verified gallery paths:

```javascript
const knownGalleries = [
  // Egypt
  '/collection/galleries/room-4-egyptian-sculpture',
  
  // Greece & Rome
  '/collection/galleries/room-18-greece-parthenon',
  '/collection/galleries/room-17-nereid-monument',
  '/collection/galleries/room-21-mausoleum-halicarnassus',
  
  // Assyria
  '/collection/galleries/room-6-assyrian-sculpture',
  '/collection/galleries/room-10-royal-lion-hunt',
  
  // Medieval
  '/collection/galleries/room-40-medieval-europe',
  '/collection/galleries/room-41-sutton-hoo',
  
  // Asia
  '/collection/galleries/room-33-asia',
  
  // Africa/Americas
  '/collection/galleries/room-25-africa',
  '/collection/galleries/room-27-mexico',
];
```

---

## 10. Legal Considerations

- **Robots.txt:** Check `https://www.britishmuseum.org/robots.txt` for crawl rules
- **Terms of Service:** Review for scraping restrictions
- **Rate Limiting:** Implement polite delays (2-5 seconds between requests)
- **Images:** Many images are © Trustees of the British Museum - check licensing
- **Commercial Use:** May require permission for commercial applications

---

## 11. Existing Scrapers in Your Codebase

| File | Purpose |
|------|---------|
| `scripts/scrape-british-museum-galleries.cjs` | Playwright-based, main scraper |
| `scripts/scrape-british-museum-galleries-puppeteer.cjs` | Puppeteer-stealth version |
| `scripts/scrape-british-museum-galleries-api.cjs` | Attempted API-based (non-functional) |
| `scripts/scrape-wikipedia-rooms.cjs` | Wikipedia fallback for room data |
| `scripts/scrape-british-museum-playwright.cjs` | Playwright exhibitions scraper |

---

## 12. Next Steps

1. **Enhance existing Puppeteer scraper** with better Cloudflare handling
2. **Use Wikipedia as primary source** for gallery/room metadata
3. **Implement object detail scraping** for specific famous objects
4. **Consider ResearchSpace SPARQL** for structured data queries
5. **Add image download functionality** with rate limiting

---

## Appendix: Famous Objects by ID

| Object | ID | Room |
|--------|-----|------|
| Rosetta Stone | Y_EA24 | Room 4 |
| Parthenon Marbles | G_1816... series | Room 18 |
| Lewis Chessmen | P&E 1831... | Room 40 |
| Sutton Hoo Helmet | P&E 1939,1010.93 | Room 41 |
| Standard of Ur | ME 121201 | Room 56 |
| Hoa Hakananai'a | Oc1869,1005.1 | Room 24 |
| Double-headed Serpent | Am... | Room 27 |
| Oxus Treasure | Various | Room 52 |
| Nereid Monument | G_1848... | Room 17 |

