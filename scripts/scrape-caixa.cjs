/**
 * La Caixa Collection Scraper
 *
 * Scrapes artworks from coleccion.caixaforum.org across:
 * - 5 technique categories (Painting, Drawing, Mixed Media, Video Installation, Video Projection)
 * - 3 special gallery pages (Obra Gráfica, Anglada-Camarasa, Testimonio)
 *
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

// ─────────────────────────────────────────────────────────────
// Accept OneTrust cookie consent
// ─────────────────────────────────────────────────────────────
async function acceptCookies(page) {
  try {
    const btn = await page.$('#onetrust-accept-btn-handler');
    if (btn) { await btn.click(); await delay(600); }
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// Safe navigation with retry
// ─────────────────────────────────────────────────────────────
async function safeGoto(page, url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      return true;
    } catch (e) {
      log(`  ⚠️  [attempt ${i}] ${url.slice(0, 80)}: ${e.message.split('\n')[0]}`);
      if (i < retries) await delay(3000);
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Parse detail page body text → extract metadata
// ─────────────────────────────────────────────────────────────
function parseDetailBodyText(bodyText) {
  const raw = (bodyText || '').replace(/\r/g, '\n');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const volverIdx = lines.findIndex(l => l === 'VOLVER');
  if (volverIdx === -1) return null;

  const artLines = lines.slice(volverIdx + 1);

  // title = first line
  const title = artLines[0] || '';

  // Skip optional "Título original: ..." lines
  let idx = 1;
  while (idx < artLines.length && artLines[idx].startsWith('Título original:')) idx++;

  // artist = first non-original-title line
  const artist = artLines[idx] || '';
  idx++;

  // year = next line if numeric range
  const rawYear = artLines[idx] || '';
  const year = /^\d{4}/.test(rawYear) ? rawYear : '';
  if (year) idx++;

  // technique = next line (skip "Imprimir ficha" etc)
  const techniqueRaw = artLines[idx] || '';
  const technique = (techniqueRaw.startsWith('Imprimir') || techniqueRaw.startsWith('Añadir')) ? '' : techniqueRaw;

  // dimensions and reference — search all artLines
  const dimsLine = artLines.find(l => l.startsWith('Medidas:'));
  const dimensions = dimsLine ? dimsLine.replace('Medidas:', '').trim() : '';
  const refLine = artLines.find(l => l.startsWith('Referencia:'));
  const reference = refLine ? refLine.replace('Referencia:', '').trim() : '';

  return { title, artist, year, technique, dimensions, reference };
}

// ─────────────────────────────────────────────────────────────
// Scrape artwork detail page
// ─────────────────────────────────────────────────────────────
async function scrapeDetailPage(page, url, category) {
  const ok = await safeGoto(page, url);
  if (!ok) return null;
  await acceptCookies(page);
  await delay(600);

  const data = await page.evaluate(() => {
    // Get first /documents/ image (skip thumbnails in "similar works")
    const allImgs = Array.from(document.querySelectorAll('img[src*="/documents/"]'));
    // The artwork image is typically the first one
    const artworkImg = allImgs[0];
    const imageUrl = artworkImg ? artworkImg.src : '';

    // Get body text for metadata parsing
    const bodyText = document.body.innerText || '';

    return { imageUrl, bodyText };
  });

  const meta = parseDetailBodyText(data.bodyText);
  if (!meta || !meta.title) return null;

  // Filter placeholder image
  const hasImage = data.imageUrl && !data.imageUrl.includes(PLACEHOLDER_IMG);
  const cleanImage = hasImage ? data.imageUrl.replace(/&imageThumbnail=\d+/, '') : '';

  return {
    id: meta.reference || url.split('/obra/')[1]?.split('/')[0] || '',
    title: meta.title,
    artist: meta.artist,
    year: meta.year,
    medium: meta.technique,
    dimensions: meta.dimensions,
    reference: meta.reference,
    category,
    imageUrl: cleanImage,
    sourceUrl: url,
  };
}

// ─────────────────────────────────────────────────────────────
// Get artwork links + total count from a listing page
// ─────────────────────────────────────────────────────────────
async function scrapeListPage(page, url) {
  const ok = await safeGoto(page, url);
  if (!ok) return { links: [], total: 0 };
  await acceptCookies(page);
  await delay(800);

  return page.evaluate((BASE) => {
    // Get all /obra/ links
    const links = [...new Set(
      Array.from(document.querySelectorAll('a[href*="/obra/"]'))
        .map(a => a.href)
        .filter(h => h.includes('/obra/-/obra/'))
    )];

    // Get total count from pagination text
    let total = links.length;
    const pgText = document.querySelector('.pagination-results, [id*="ariaPaginationResults"]')?.textContent?.trim() || '';
    const m = pgText.match(/de (\d+) resultados/);
    if (m) total = parseInt(m[1]);

    return { links, total };
  }, BASE);
}

// ─────────────────────────────────────────────────────────────
// Scrape all pages for a technique category
// ─────────────────────────────────────────────────────────────
async function scrapeTechnique(page, techniqueId, category) {
  const baseUrl = `${BASE}/explora?technique=${techniqueId}`;
  log(`\n📂 Category: ${category} (technique=${techniqueId})`);

  // Get page 1 to find total
  const page1 = await scrapeListPage(page, baseUrl);
  log(`   Total items: ${page1.total}, Page 1 links: ${page1.links.length}`);

  const totalPages = Math.ceil(page1.total / 20);
  const allLinks = new Set(page1.links);

  // Collect links from remaining pages
  for (let p = 2; p <= totalPages; p++) {
    const pageUrl = `${baseUrl}&page=${p}`;
    log(`   📄 Page ${p}/${totalPages}...`);
    const pageData = await scrapeListPage(page, pageUrl);
    pageData.links.forEach(l => allLinks.add(l));
    await delay(300);
  }

  log(`   Total unique artwork links: ${allLinks.size}`);

  // Scrape each detail page
  const artworks = [];
  let i = 0;
  for (const artUrl of allLinks) {
    i++;
    if (i % 10 === 0) log(`   [${i}/${allLinks.size}] Scraping details...`);
    const artwork = await scrapeDetailPage(page, artUrl, category);
    if (artwork) artworks.push(artwork);
    await delay(400);
  }

  log(`   ✅ ${artworks.length} artworks scraped for ${category}`);
  return artworks;
}

// ─────────────────────────────────────────────────────────────
// Scrape special gallery page (images + refs from gallery)
// ─────────────────────────────────────────────────────────────
async function scrapeSpecialPage(page, pageConfig) {
  const { url, category, label } = pageConfig;
  log(`\n🖼️  Special page: ${label} (${url})`);

  const ok = await safeGoto(page, url);
  if (!ok) return [];
  await acceptCookies(page);
  await delay(1000);

  // First check: are there /obra/ links? If so, scrape as regular artwork pages
  const obraLinks = await page.$$eval('a[href*="/obra/-/obra/"]', els => [...new Set(els.map(e => e.href))]);
  log(`   /obra/ links found: ${obraLinks.length}`);

  if (obraLinks.length > 0) {
    // Has artwork links — scrape detail pages
    const artworks = [];
    let i = 0;
    for (const artUrl of obraLinks) {
      i++;
      if (i % 5 === 0) log(`   [${i}/${obraLinks.length}]`);
      const artwork = await scrapeDetailPage(page, artUrl, category);
      if (artwork) artworks.push(artwork);
      await delay(400);
    }
    log(`   ✅ ${artworks.length} artworks (via obra links)`);
    return artworks;
  }

  // No obra links — extract gallery images directly
  const galleryData = await page.evaluate((PLACEHOLDER_IMG) => {
    const imgs = Array.from(document.querySelectorAll('img[src*="/documents/"]'))
      .map(img => img.src)
      .filter(src => !src.includes(PLACEHOLDER_IMG));

    return imgs.map(src => {
      // Extract reference from filename (e.g. "ACF0553_v01.jpg" → "ACF0553", "OGF6099.jpg" → "OGF6099")
      const fnMatch = src.match(/\/documents\/[^/]+\/[^/]+\/([A-Z]{2,6}\d+)[_.](.+?)\.(?:jpg|png|gif)/i);
      const ref = fnMatch ? fnMatch[1] : '';
      // Remove thumbnail param
      const cleanSrc = src.replace(/[?&]imageThumbnail=\d+/, '');
      return { ref, imageUrl: cleanSrc };
    });
  }, PLACEHOLDER_IMG);

  log(`   Gallery images found: ${galleryData.length}`);

  const artworks = galleryData
    .filter(d => d.imageUrl)
    .map((d, idx) => ({
      id: d.ref || `${label.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}`,
      title: d.ref || `${label} ${idx + 1}`,
      artist: '',
      year: '',
      medium: '',
      dimensions: '',
      reference: d.ref,
      category,
      imageUrl: d.imageUrl,
      sourceUrl: url,
    }));

  log(`   ✅ ${artworks.length} gallery items`);
  return artworks;
}

// ─────────────────────────────────────────────────────────────
// Save progress
// ─────────────────────────────────────────────────────────────
function saveProgress(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2), 'utf8');
  log(`💾 Saved ${artworks.length} items to ${path.basename(OUTPUT_FILE)}`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  log('🚀 Starting CaixaForum Collection Scraper');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await ctx.newPage();

  // Suppress console noise
  page.on('console', () => {});

  let allArtworks = [];

  try {
    // ── Phase 1: Technique categories ──────────────────────
    for (const [techId, category] of Object.entries(TECHNIQUE_CATEGORIES)) {
      const artworks = await scrapeTechnique(page, techId, category);
      allArtworks = [...allArtworks, ...artworks];
      saveProgress(allArtworks);
    }

    // ── Phase 2: Special gallery pages ─────────────────────
    for (const pageConfig of SPECIAL_PAGES) {
      const artworks = await scrapeSpecialPage(page, pageConfig);
      // Avoid duplicates by ID/reference
      const existingIds = new Set(allArtworks.map(a => a.id));
      const newItems = artworks.filter(a => !existingIds.has(a.id));
      allArtworks = [...allArtworks, ...newItems];
      saveProgress(allArtworks);
    }
  } finally {
    await browser.close();
  }

  // Deduplicate
  const seen = new Set();
  const deduped = allArtworks.filter(a => {
    const key = a.id || a.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  log(`\n✅ DONE. Total: ${deduped.length} unique artworks`);
  saveProgress(deduped);
}

main().catch(e => {
  log(`💥 Fatal error: ${e.message}`);
  process.exit(1);
});
