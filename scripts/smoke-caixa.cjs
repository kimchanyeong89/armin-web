/**
 * Quick smoke test: scrape just the first page of technique 151969 (Obra sobre papel)
 * to validate the scraper logic before full run.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const delay = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[SMOKE] ${msg}`);
const PLACEHOLDER_IMG = 'Imagen+no+disponble+castellano.png';
const BASE = 'https://coleccion.caixaforum.org';

async function acceptCookies(page) {
  try {
    const btn = await page.$('#onetrust-accept-btn-handler');
    if (btn) { await btn.click(); await delay(600); }
  } catch (e) {}
}

async function safeGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    return true;
  } catch (e) {
    log('goto failed: ' + e.message.split('\n')[0]);
    return false;
  }
}

function parseDetailBodyText(bodyText) {
  const lines = (bodyText || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const volverIdx = lines.findIndex(l => l === 'VOLVER');
  if (volverIdx === -1) return null;
  const artLines = lines.slice(volverIdx + 1);
  const title = artLines[0] || '';
  const artist = artLines[1] || '';
  const rawYear = artLines[2] || '';
  const year = /^\d{4}/.test(rawYear) ? rawYear : '';
  const techniqueRaw = year ? (artLines[3] || '') : (artLines[2] || '');
  const technique = techniqueRaw.startsWith('Imprimir') ? '' : techniqueRaw;
  const dimsLine = artLines.find(l => l.startsWith('Medidas:'));
  const dimensions = dimsLine ? dimsLine.replace('Medidas:', '').trim() : '';
  const refLine = artLines.find(l => l.startsWith('Referencia:'));
  const reference = refLine ? refLine.replace('Referencia:', '').trim() : '';
  return { title, artist, year, technique, dimensions, reference };
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // ── Test 1: List page ─────────────────────────────────────
  log('Test 1: Listing page...');
  await safeGoto(page, `${BASE}/explora?technique=151969`);
  await acceptCookies(page);
  await delay(800);

  const listData = await page.evaluate(() => {
    const links = [...new Set(
      Array.from(document.querySelectorAll('a[href*="/obra/-/obra/"]')).map(a => a.href)
    )];
    const pgText = document.querySelector('.pagination-results, [id*="ariaPaginationResults"]')?.textContent?.trim() || '';
    const m = pgText.match(/de (\d+) resultados/);
    return { links, total: m ? parseInt(m[1]) : 0, pgText };
  });
  log(`Links: ${listData.links.length}, Total: ${listData.total}, PgText: "${listData.pgText}"`);
  log(`First 3 links: ${listData.links.slice(0, 3).join(', ')}`);

  // ── Test 2: Detail page parsing ───────────────────────────
  log('\nTest 2: Detail page parsing...');
  const testLinks = listData.links.slice(0, 3);
  for (const url of testLinks) {
    await safeGoto(page, url);
    await acceptCookies(page);
    await delay(500);

    const data = await page.evaluate(() => {
      const allImgs = Array.from(document.querySelectorAll('img[src*="/documents/"]'));
      return { imageUrl: allImgs[0]?.src || '', bodyText: document.body.innerText || '' };
    });

    const meta = parseDetailBodyText(data.bodyText);
    const hasImage = data.imageUrl && !data.imageUrl.includes(PLACEHOLDER_IMG);
    const cleanImage = hasImage ? data.imageUrl.replace(/[?&]imageThumbnail=\d+/, '') : '';

    console.log('\n────');
    console.log('URL:', url.slice(-40));
    console.log('Parsed:', JSON.stringify(meta, null, 2));
    console.log('Image:', cleanImage.slice(0, 80) || '[no image]');
  }

  // ── Test 3: Special gallery page ─────────────────────────
  log('\nTest 3: Special gallery page (obra-grafica)...');
  await safeGoto(page, `${BASE}/coleccion-obra-grafica`);
  await acceptCookies(page);
  await delay(1000);

  const galleryData = await page.evaluate((PLACEHOLDER_IMG) => {
    const obraLinks = [...new Set(Array.from(document.querySelectorAll('a[href*="/obra/-/obra/"]')).map(a => a.href))];
    const imgs = Array.from(document.querySelectorAll('img[src*="/documents/"]'))
      .map(img => img.src)
      .filter(s => !s.includes(PLACEHOLDER_IMG));
    return { obraLinks, imgCount: imgs.length, sampleImgs: imgs.slice(0, 3) };
  }, PLACEHOLDER_IMG);
  log(`obra-grafica: /obra/ links=${galleryData.obraLinks.length}, gallery imgs=${galleryData.imgCount}`);
  log('Sample imgs:', galleryData.sampleImgs.map(u => u.slice(0, 80)));
  
  // ── Test 4: Anglada page ──────────────────────────────────
  log('\nTest 4: Anglada-Camarasa page...');
  await safeGoto(page, `${BASE}/coleccion-anglada-camarasa`);
  await acceptCookies(page);
  await delay(1000);
  
  const angladaData = await page.evaluate(() => {
    const obraLinks = [...new Set(Array.from(document.querySelectorAll('a[href*="/obra/-/obra/"]')).map(a => a.href))];
    const imgs = Array.from(document.querySelectorAll('img[src*="/documents/"]')).map(img => img.src);
    return { obraLinks: obraLinks.slice(0, 3), imgCount: imgs.length };
  });
  log(`anglada: /obra/ links=${angladaData.obraLinks.length}, imgs=${angladaData.imgCount}`);
  log('Sample links:', angladaData.obraLinks);
  
  // ── Test 5: Testimonio page ───────────────────────────────
  log('\nTest 5: Testimonio page...');
  await safeGoto(page, `${BASE}/coleccion-testimonio`);
  await acceptCookies(page);
  await delay(1000);
  
  const testimonioData = await page.evaluate(() => {
    const obraLinks = [...new Set(Array.from(document.querySelectorAll('a[href*="/obra/-/obra/"]')).map(a => a.href))];
    const imgs = Array.from(document.querySelectorAll('img[src*="/documents/"]')).map(img => img.src);
    return { obraLinks: obraLinks.slice(0, 3), imgCount: imgs.length };
  });
  log(`testimonio: /obra/ links=${testimonioData.obraLinks.length}, imgs=${testimonioData.imgCount}`);
  log('Sample links:', testimonioData.obraLinks);

  await browser.close();
  log('\n✅ Smoke test complete');
}

main().catch(e => { console.error('FATAL:', e.message.slice(0, 200)); process.exit(1); });
