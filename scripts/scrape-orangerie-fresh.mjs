// Orangerie full scraper — 3 filter categories, deduplicated
// Categories: tableau, peinture, dessin (crayon de couleur)
import { writeFileSync } from 'fs';

const BASE = 'https://www.musee-orangerie.fr';
const PLACEHOLDER = '/themes/custom/orangerie/images/placeholder-recherche.jpg';
const OUT = '/Users/kietzsche/armin-web-main/public/data/orangerie-collection.json';

// Delay helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Headers factory
function headers(referer) {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    Connection: 'keep-alive',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    ...(referer ? { Referer: referer } : {}),
  };
}

async function fetchHtml(url, referer, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: headers(referer) });
      if (res.status === 200) return await res.text();
      if (res.status === 503 || res.status === 429) {
        console.log(`  [${res.status}] Backing off...`);
        await sleep(5000 + i * 3000);
        continue;
      }
      console.log(`  [${res.status}] ${url}`);
      return null;
    } catch (e) {
      console.log(`  [ERROR] ${e.message}`);
      await sleep(3000);
    }
  }
  return null;
}

// Extract label→value pairs from detail page HTML
function extractField(html, label) {
  // Match <div class="label">LABEL</div>\n<div class="value">...VALUE...</div>
  const esc = label.replace(/[()]/g, '\\$&');
  const re = new RegExp(
    `<div[^>]*class="label[^"]*"[^>]*>\\s*(?:<[^>]+>\\s*)*${esc}\\s*(?:</[^>]+>\\s*)*</div>\\s*<div[^>]*class="value[^"]*"[^>]*>([\\s\\S]*?)</div>`,
    'i'
  );
  const m = html.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Parse a detail page and extract metadata
function parseDetail(html, url) {
  // h1 = artwork title  
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1m ? h1m[1].replace(/<[^>]+>/g, '').trim() : '';

  // Artist: from paragraph--type--artists div
  const artistM = html.match(/paragraph--type--artists[\s\S]{0,500}?<a[^>]+>([\s\S]*?)<\/a>/i);
  let artist = '';
  if (artistM) {
    artist = artistM[1].replace(/<[^>]+>/g, '').trim();
    // Reformat "Monet Claude" → "Claude Monet"
    if (/^[A-Z][a-zéèêàâîïôù]+\s+[A-Z]/.test(artist)) {
      const parts = artist.split(/\s+/);
      if (parts.length === 2) artist = `${parts[1]} ${parts[0]}`;
    }
  }

  // Date
  const date = extractField(html, 'Date');

  // Medium (labeled "Description")
  const medium = extractField(html, 'Description');

  // Dimensions
  const dimensions = extractField(html, 'Dimensions');

  // Accession number — second occurrence (first might be alt numbers)
  const accMatches = [...html.matchAll(/<div[^>]*class="label[^"]*"[^>]*>Accession number<\/div>\s*<div[^>]*class="value[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
  let accession = '';
  if (accMatches.length > 0) {
    // Prefer the one with actual text (has a <span>)
    for (const m of accMatches) {
      const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) { accession = text; break; }
    }
  }

  // Image — from <figure class="main-image"> → <source srcset="...">
  const figM = html.match(/class="main-image[^"]*"[\s\S]{0,1000}?srcset="([^"]+)"/);
  let image = figM ? figM[1].split(',')[0].trim() : '';
  // Fallback: any CDN image
  if (!image) {
    const anyImg = html.match(/src="(https:\/\/cdn\.mediatheque\.epmoo\.fr\/[^"]+)"/);
    image = anyImg ? anyImg[1] : '';
  }
  // Skip placeholder
  if (html.includes('placeholder-recherche') && !image.includes('cdn.mediatheque')) {
    image = '';
  }

  // ID from URL slug
  const idM = url.match(/artworks\/[\w-]+-(\d+)$/) || url.match(/oeuvres\/[\w-]+-(\d+)$/);
  const id = idM ? idM[1] : url.split('/').pop();

  return { id, title, artist, year: date, medium, dimensions, accession, image };
}

// Scrape all pages of a filter URL and collect item links+thumbnails
async function scrapeListPages(filterUrl, label) {
  console.log(`\n=== ${label} ===`);
  const items = new Map(); // id → { url, thumbnailImage }

  for (let page = 0; page < 30; page++) {
    const url = page === 0 ? filterUrl : `${filterUrl}&page=${page}`;
    const html = await fetchHtml(url, page === 0 ? BASE + '/' : filterUrl);
    if (!html) break;

    // Extract article links
    const links = [...html.matchAll(/href="(\/(?:en\/artworks|fr\/oeuvres)\/[^"]+)"/g)].map(m => m[1]);
    if (links.length === 0) {
      console.log(`  Page ${page}: no items → stop`);
      break;
    }

    // For each article, also check if it has a placeholder thumbnail
    // Find articles with their image
    const articles = [...html.matchAll(/<article[\s\S]*?<\/article>/g)];
    
    let added = 0;
    for (const link of [...new Set(links)]) {
      // Check for placeholder in vicinity via img src attribute near the link
      const idM = link.match(/[\w-]+-(\d+)$/);
      const itemId = idM ? idM[1] : link;
      if (!items.has(itemId)) {
        items.set(itemId, { url: BASE + link });
        added++;
      }
    }
    
    console.log(`  Page ${page}: ${links.length} links, ${added} new (total ${items.size})`);
    await sleep(700);
  }

  return items;
}

async function main() {
  const filters = [
    {
      url: 'https://www.musee-orangerie.fr/en/collections/search?f%5B0%5D=artwork_kind%3Atableau&search_type=advanced_search',
      label: 'Tableau',
      category: 'Tableau',
    },
    {
      url: 'https://www.musee-orangerie.fr/en/collections/search?f%5B0%5D=artwork_domain%3Apeintures&search_type=advanced_search',
      label: 'Peinture',
      category: 'Peinture',
    },
    {
      url: 'https://www.musee-orangerie.fr/fr/collections/recherche?artwork_materials=crayon%20de%20couleur&search_type=advanced_search',
      label: 'Crayon de couleur',
      category: 'Dessin',
    },
  ];

  // Step 1: Collect all item URLs
  const allItems = new Map(); // id → { url, category }
  
  for (const filter of filters) {
    const items = await scrapeListPages(filter.url, filter.label);
    for (const [id, data] of items) {
      if (!allItems.has(id)) {
        allItems.set(id, { url: data.url, category: filter.category });
      } else {
        // Already found in a different category — keep first (could append)
        const existing = allItems.get(id);
        if (existing.category !== filter.category) {
          existing.categories = [...(existing.categories || [existing.category]), filter.category];
        }
      }
    }
    await sleep(1500);
  }

  console.log(`\nTotal unique items: ${allItems.size}`);

  // Step 2: Fetch each detail page
  const objects = [];
  let i = 0;
  for (const [id, data] of allItems) {
    i++;
    process.stdout.write(`  [${i}/${allItems.size}] ${id}...`);
    
    const html = await fetchHtml(data.url, 'https://www.musee-orangerie.fr/en/collections');
    if (!html) {
      console.log(' FAILED');
      await sleep(2000);
      continue;
    }

    const parsed = parseDetail(html, data.url);
    
    // Skip items with no image
    if (!parsed.image) {
      console.log(` no image (skipping)`);
      await sleep(700);
      continue;
    }

    const obj = {
      id: parsed.id,
      title: parsed.title,
      artist: parsed.artist || 'Anonyme',
      year: parsed.year || '',
      medium: parsed.medium || '',
      dimensions: parsed.dimensions || '',
      accession: parsed.accession || '',
      image: parsed.image,
      category: data.category,
      sourceUrl: data.url,
      source: 'Musée de l\'Orangerie',
    };

    console.log(` ✓ "${parsed.title}" (${parsed.artist})`);
    objects.push(obj);
    
    await sleep(750);
  }

  console.log(`\n=== DONE: ${objects.length} items with images ===`);

  // Stats
  const cats = {};
  for (const o of objects) {
    cats[o.category] = (cats[o.category] || 0) + 1;
  }
  console.log('Categories:', cats);

  const output = {
    museum: "Musée de l'Orangerie",
    museumId: 'orangerie',
    city: 'Paris',
    country: 'France',
    totalCount: objects.length,
    lastScraped: new Date().toISOString().slice(0, 10),
    objects,
  };

  writeFileSync(OUT, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${OUT}`);
}

main().catch(console.error);
