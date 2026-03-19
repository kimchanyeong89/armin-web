/**
 * La Caixa Collection Scraper (FAST VERSION)
 *
 * Uses listing pages only — no individual detail page scraping.
 * Listing pages contain: title, artist, year, thumbnail image, sourceUrl.
 * Reference is extracted from the /obra/ URL.
 *
 * 5 technique categories + 3 special gallery pages.
 * Output: public/data/caixaforum-collection.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/caixaforum-collection.json');

const TECHNIQUE_CATEGORIES = {
  151938: 'Painting',
  151969: 'Drawing',
  151975: 'Mixed Media',
  151978: 'Video Installation',
  151972: 'Video',
};

const SPECIAL_PAGES = [
  {
    url: 'https://coleccion.caixaforum.org/coleccion-obra-grafica',
    category: 'Print',
    label: 'Obra Gráfica',
  },
  {
    url: 'https://coleccion.caixaforum.org/coleccion-anglada-camarasa',
    category: 'Painting',
    label: 'Anglada-Camarasa',
  },
  {
    url: 'https://coleccion.caixaforum.org/coleccion-testimonio',
    category: 'Photography',
    label: 'Testimonio',
  },
];

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] [CaixaForum] ${msg}`);

const PLACEHOLDER_IMG = 'Imagen+no+disponble+castellano.png';
const BASE = 'https://coleccion.caixaforum.org';

// ─── Cookie consent ───────────────────────────────────────────
async function acceptCookies(page) {
  try {
    const btn = await page.$('#onetrust-accept-btn-handler');
    if (btn) { await btn.click(); await delay(500); }
  } catch (e) {}
}

// ─── Safe navigation ──────────────────────────────────────────
async function safeGoto(page, url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      return true;
    } catch (e) {
      log(`  ⚠️  [${i}] ${url.slice(0, 80)}: ${e.message.split('\n')[0]}`);
      if (i < retries) await delay(3000);
    }
  }
  return false;
}

// ─── Extract artworks from listing page ───────────────────────
async function extractListingItems(page, category) {
  return page.evaluate(({ category, BASE, PLACEHOLDER_IMG }) => {
    const results = [];

    // Each obra card has a link + image + text block
    const artLinks = Array.from(document.querySelectorAll('a[href*="/obra/-/obra/"]'));

    artLinks.forEach(link => {
      const href = link.href;

      // Extract reference from URL: /obra/-/obra/ACF0553/slug → ACF0553
      const refMatch = href.match(/\/obra\/-\/obra\/([A-Z]+\d+)\//);
      const reference = refMatch ? refMatch[1] : '';

      // Walk up to find parent container with image + text
      let container = link.parentElement;
      let img = null;
      let texts = [];
      for (let d = 0; d < 6; d++) {
        if (!container || container.tagName === 'BODY') break;
        img = img || container.querySelector('img[src*="/documents/"]');
        const t = container.innerText?.split('\n').map(s => s.trim()).filter(s => s.length > 0 && s.length < 200);
        if (t && t.length >= 2) { texts = t; }
        if (img && texts.length >= 2) break;
        container = container.parentElement;
      }

      // Texts typically: [ARTIST_UPPER, Title, year, ...]
      const artist = texts[0] || '';
      const title = texts[1] || '';
      const yearMatch = (texts[2] || '').match(/^(\d{4}(?:[–\-\/]\d{4})?)/);
      const year = yearMatch ? yearMatch[1] : (texts[2] || '');

      // Image URL — remove thumbnail params, keep base
      let imageUrl = '';
      if (img && img.src && !img.src.includes(PLACEHOLDER_IMG)) {
        // Remove thumbnail query params
        imageUrl = img.src.split('?')[0].split('&imageThumbnail=')[0];
      }

      if (title) {
        results.push({
          id: reference || title.slice(0, 20).replace(/\s+/g, '-'),
          title,
          artist,
          year,
          medium: '',
          dimensions: '',
          reference,
          category,
          imageUrl,
          sourceUrl: href,
        });
      }
    });

    return results;
  }, { category, BASE, PLACEHOLDER_IMG });
}

// ─── Scrape all pages for a technique ───────────────────────
async function scrapeTechnique(page, techniqueId, category) {
  const baseUrl = `${BASE}/explora?technique=${techniqueId}`;
  log(`\n📂 ${category} (technique=${techniqueId})`);

  // Page 1: get total + first 20 items
  const ok1 = await safeGoto(page, baseUrl);
  if (!ok1) return [];
  await acceptCookies(page);
  await delay(600);

  const totalInfo = await page.evaluate(() => {
    const pgText = document.querySelector('.pagination-results, [id*="ariaPaginationResults"]')?.textContent?.trim() || '';
    const m = pgText.match(/de (\d+) resultados/);
    return { total: m ? parseInt(m[1]) : 0 };
  });

  const totalPages = Math.ceil(totalInfo.total / 20);
  log(`   Total: ${totalInfo.total} items across ${totalPages} pages`);

  const allItems = await extractListingItems(page, category);

  // Remaining pages
  for (let p = 2; p <= totalPages; p++) {
    if (p % 5 === 0) log(`   📄 Page ${p}/${totalPages}...`);
    const ok = await safeGoto(page, `${baseUrl}&page=${p}`);
    if (!ok) continue;
    await delay(400);
    const items = await extractListingItems(page, category);
    allItems.push(...items);
  }

  log(`   ✅ ${allItems.length} items collected`);
  return allItems;
}

// ─── Scrape special gallery page ──────────────────────────────
async function scrapeSpecialPage(page, pageConfig) {
  const { url, category, label } = pageConfig;
  log(`\n🖼️  Special: ${label}`);

  const ok = await safeGoto(page, url);
  if (!ok) return [];
  await acceptCookies(page);
  await delay(800);

  // Check if there are /obra/ links first (some galleries link to artwork pages)
  const hasObraLinks = await page.$('a[href*="/obra/-/obra/"]');
  if (hasObraLinks) {
    const obraItems = await extractListingItems(page, category);
    if (obraItems.length > 0) {
      log(`   ✅ ${obraItems.length} items via obra links`);
      return obraItems;
    }
  }

  // Pure gallery: extract images + reference from filenames
  const galleryItems = await page.evaluate(({ category, url, label, PLACEHOLDER_IMG }) => {
    const imgs = Array.from(document.querySelectorAll('img[src*="/documents/"]'))
      .map(img => img.src)
      .filter(src => !src.includes(PLACEHOLDER_IMG));

    return imgs.map((src, idx) => {
      // Strip query params and pick best URL
      const cleanSrc = src.split('?')[0].split('&imageThumbnail=')[0];
      // Extract reference from filename (ACFxxxx, OGFxxxx, etc.)
      const fnMatch = cleanSrc.match(/\/([A-Z]{2,4}\d+)(?:_v\d+)?\.(?:jpg|png)/i);
      const ref = fnMatch ? fnMatch[1] : '';
      const id = ref || `${label.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}`;
      return {
        id,
        title: ref || `${label} ${idx + 1}`,
        artist: '',
        year: '',
        medium: '',
        dimensions: '',
        reference: ref,
        category,
        imageUrl: cleanSrc,
        sourceUrl: url,
      };
    });
  }, { category, url, label, PLACEHOLDER_IMG });

  log(`   ✅ ${galleryItems.length} gallery images`);
  return galleryItems;
}

// ─── Save ─────────────────────────────────────────────────────
function save(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2), 'utf8');
  log(`💾 Saved ${artworks.length} items`);
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  log('🚀 CaixaForum Fast Scraper starting...');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('console', () => {});

  let allArtworks = [];

  try {
    // Phase 1: technique categories
    for (const [techId, category] of Object.entries(TECHNIQUE_CATEGORIES)) {
      const items = await scrapeTechnique(page, techId, category);
      allArtworks = [...allArtworks, ...items];
      save(allArtworks);
    }

    // Phase 2: special gallery pages
    for (const pageConfig of SPECIAL_PAGES) {
      const items = await scrapeSpecialPage(page, pageConfig);
      // Deduplicate by ID
      const existingIds = new Set(allArtworks.map(a => a.id));
      const newItems = items.filter(a => !existingIds.has(a.id));
      allArtworks = [...allArtworks, ...newItems];
      save(allArtworks);
    }
  } finally {
    await browser.close();
  }

  // Final dedup
  const seen = new Set();
  const deduped = allArtworks.filter(a => {
    const k = a.id || a.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  log(`\n🏁 DONE. ${deduped.length} unique artworks`);
  save(deduped);
}

main().catch(e => {
  log(`💥 Fatal: ${e.message}`);
  process.exit(1);
});
