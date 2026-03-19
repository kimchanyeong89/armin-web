#!/usr/bin/env node
/**
 * Scraper for Musée des Arts Décoratifs masterpieces
 * Source: https://collections.madparis.fr/page/chefs-d-oeuvres/64463337d0b7061116c3bf4e
 * 292 items, 15/page, ~20 pages (pgn=0..19+)
 */

import { writeFileSync } from 'fs';

const BASE = 'https://collections.madparis.fr';
const PAGE_URL = (n) =>
  `${BASE}/page/chefs-d-oeuvres/64463337d0b7061116c3bf4e?v=mosaic&pgn=${n}`;
const OUT = '/Users/kietzsche/armin-web-main/public/data/mad-paris-collection.json';

const DELAY = 400; // ms between requests to be polite
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- helpers --------------------------------------------------------

function extractText(html, tag, nth = 0) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m, i = 0;
  while ((m = re.exec(html)) !== null) {
    if (i === nth) {
      // strip inner tags
      return m[1].replace(/<[^>]+>/g, '').trim();
    }
    i++;
  }
  return '';
}

function stripParens(s) {
  // remove life dates and profession suffixes: "Gaillard, Lucien (1861-1942) (bijoutier)" → "Gaillard, Lucien"
  return s.replace(/\s*\(\d{4}[^)]*\).*$/, '').trim();
}

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        Referer: BASE + '/',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (attempt < 3) {
      console.warn(`  Retry ${attempt} for ${url}: ${e.message}`);
      await sleep(1500 * attempt);
      return fetchHtml(url, attempt + 1);
    }
    throw e;
  }
}

// ---------- Phase 1: collect document URLs from mosaic pages ---------------

async function collectDocUrls() {
  const items = []; // [{url, mosaicImage, slug, mongoId}]
  const seen = new Set();

  for (let pgn = 0; pgn < 25; pgn++) {
    const url = PAGE_URL(pgn);
    process.stdout.write(`Page ${pgn}: ${url} ... `);
    const html = await fetchHtml(url);

    // Extract document links
    const docRe = /href="(https:\/\/collections\.madparis\.fr\/document\/([^\/]+)\/([a-z0-9]+))[^"]*"/gi;
    let m;
    let pageCount = 0;
    while ((m = docRe.exec(html)) !== null) {
      const [, fullUrl, slug, mongoId] = m;
      if (!seen.has(mongoId)) {
        seen.add(mongoId);
        // Mosaic image: /media/cache/mosaic/sw-media/{mongoId}.jpg
        const mosaicImage = `${BASE}/media/cache/mosaic/sw-media/${mongoId}.jpg`;
        items.push({ url: fullUrl, mosaicImage, slug, mongoId });
        pageCount++;
      }
    }

    console.log(`${pageCount} new items (total: ${items.length})`);

    if (pageCount === 0) {
      console.log('No new items on this page, stopping.');
      break;
    }

    await sleep(DELAY);
  }

  return items;
}

// ---------- Phase 2: fetch detail per document ----------------------------

async function fetchDetail(item) {
  const html = await fetchHtml(item.url);
  const h3s = [];
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = h3Re.exec(html)) !== null) {
    h3s.push(m[1].replace(/<[^>]+>/g, '').trim());
  }

  // h3[0] = title, h3[1] = artist, h3[2] = year
  const title = h3s[0] || item.slug.replace(/-/g, ' ');
  const artistRaw = h3s[1] || '';
  const artist = stripParens(artistRaw);
  const year = h3s[2] || '';

  // Big image: media/cache/big/sw-media/{id}.jpg
  const bigImgMatch = html.match(/media\/cache\/big\/sw-media\/([^"'\s]+\.jpg)/i);
  const image = bigImgMatch
    ? `${BASE}/media/cache/big/sw-media/${bigImgMatch[1]}`
    : item.mosaicImage;

  // Denomination (medium) via h2[1]
  const h2s = [];
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  while ((m = h2Re.exec(html)) !== null) {
    h2s.push(m[1].replace(/<[^>]+>/g, '').trim());
  }
  const medium = h2s[1] || '';

  return { title, artist, year, image, medium };
}

// ---------- Main -----------------------------------------------------------

async function main() {
  console.log('=== MAD Masterpieces Scraper ===\n');

  // Phase 1
  console.log('--- Phase 1: Collecting document URLs ---');
  const docItems = await collectDocUrls();
  console.log(`\nTotal unique items collected: ${docItems.length}\n`);

  // Phase 2
  console.log('--- Phase 2: Fetching details ---');
  const objects = [];
  let errors = 0;

  for (let i = 0; i < docItems.length; i++) {
    const item = docItems[i];
    process.stdout.write(`[${i + 1}/${docItems.length}] ${item.slug}/${item.mongoId} ... `);

    try {
      const detail = await fetchDetail(item);
      const obj = {
        id: `mad-${item.slug}-${item.mongoId.slice(-8)}`,
        title: detail.title,
        artist: detail.artist,
        year: detail.year,
        medium: detail.medium,
        image: detail.image,
        sourceUrl: item.url,
        source: 'Musée des Arts Décoratifs',
      };
      objects.push(obj);
      console.log(`✓ "${obj.title.slice(0, 40)}" / ${obj.artist.slice(0, 30) || '(no artist)'}`);
    } catch (e) {
      errors++;
      console.error(`✗ ERROR: ${e.message}`);
      objects.push({
        id: `mad-${item.slug}-${item.mongoId.slice(-8)}`,
        title: item.slug.replace(/-/g, ' '),
        artist: '',
        year: '',
        medium: '',
        image: item.mosaicImage,
        sourceUrl: item.url,
        source: 'Musée des Arts Décoratifs',
      });
    }

    await sleep(DELAY);
  }

  // Save
  const out = {
    museum: 'Musée des Arts Décoratifs',
    museumId: 'mad-paris',
    scrapedAt: new Date().toISOString(),
    totalObjects: objects.length,
    objects,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n✅ Saved ${objects.length} items → ${OUT}`);
  if (errors > 0) console.log(`⚠ ${errors} items had errors (used fallback data)`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
