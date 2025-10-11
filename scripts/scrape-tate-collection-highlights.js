#!/usr/bin/env node
/* Scrape Tate Collection Highlights artworks from search listing and individual artwork metadata/images.
   Source list: https://www.tate.org.uk/search?gallery=tate-modern&q=Tate+Collection+Highlights&type=artwork
   Output: public/data/tate-collection-highlights-artworks.json
   For each artwork: { id, url, title, artist, dateText, medium, dimensions, credit, accession, image, tags[], scrapedAt }
   Also writes image URLs unchanged (separate mirroring step can be added if needed).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { load as cheerioLoad } from 'cheerio';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = 'https://www.tate.org.uk';
const START_URL = 'https://www.tate.org.uk/search?gallery=tate-modern&q=Tate+Collection+Highlights&type=artwork';

const MAX_LIST_PAGES = 1; // temporarily 1 page
const CONCURRENCY = parseInt(process.env.TATE_ARTWORK_CONCURRENCY || '4', 10);

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}
function absUrl(href) {
  if (!href) return '';
  if (/^https?:/i.test(href)) return href;
  return ROOT + (href.startsWith('/') ? href : `/${href}`);
}

async function fetchHtml(url) {
  const res = await got(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    },
    timeout: { request: 30000 },
    retry: { limit: 2 }
  });
  return res.body;
}

async function collectListPage(pageUrl, seen) {
  try {
    const html = await fetchHtml(pageUrl);
    const $ = cheerioLoad(html);
    const out = [];
    // Artwork links look like /art/artworks/<slug-or-code>
    $('a[href*="/art/artworks/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const abs = absUrl(href.split('?')[0]);
      if (!/\/art\/artworks\//i.test(abs)) return;
      // avoid variant anchors with trailing fragments
      const id = abs.toLowerCase();
      if (seen.has(id)) return;
      seen.add(id);
      // Try to get a title from nearest heading or image alt
      const container = $(a).closest('article, li, div');
      let title = norm(container.find('h3, h2').first().text()) || norm($(a).text());
      if (!title) {
        const alt = container.find('img').attr('alt');
        if (alt) title = norm(alt);
      }
      // Representative thumb
      const imgEl = container.find('img').first();
      let thumb = imgEl.attr('src') || imgEl.attr('data-src') || '';
      if (thumb) thumb = absUrl(thumb);
      out.push({ id, url: abs, title, thumb });
    });
    return out;
  } catch (e) {
    console.error(`Error collecting ${pageUrl}:`, e.message);
    return [];
  }
}

async function collectAllListPages() {
  const seen = new Set();
  const allEntries = [];
  let page = 1;
  while (page <= MAX_LIST_PAGES) {
    const pageUrl = `${START_URL}&page=${page}`;
    console.log(`Collecting page ${page}: ${pageUrl}`);
    const entries = await collectListPage(pageUrl, seen);
    if (entries.length === 0) break;
    allEntries.push(...entries);
    page++;
  }
  return allEntries;
}

async function enrichArtwork(entry) {
  try {
    const html = await fetchHtml(entry.url);
    const $ = cheerioLoad(html);

    // Extract JSON-LD if present
    let jsonLd = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data['@type'] === 'VisualArtwork') {
          jsonLd = data;
        }
      } catch {}
    });

    const title = norm($('h1').first().text()) || entry.title;
    const artist = norm($('.artist a').text() || $('.artist').text()) || norm(jsonLd?.creator?.name);
    const dateText = norm($('.date').text()) || norm(jsonLd?.dateCreated);
    const medium = norm($('.medium').text()) || norm(jsonLd?.material);
    const dimensions = norm($('.dimensions').text()) || norm(jsonLd?.height && jsonLd?.width ? `${jsonLd.height} x ${jsonLd.width}` : '');
    const credit = norm($('.credit').text()) || norm(jsonLd?.creditText);
    const accession = norm($('.accession').text()) || norm(jsonLd?.identifier);

    // Images: prefer full size, fallback to thumb
    let image = '';
    const imgEl = $('img.artwork-image').first();
    if (imgEl.length) {
      const src = imgEl.attr('src');
      if (src) {
        image = absUrl(src);
      }
    }
    if (!image && jsonLd?.image) {
      image = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
      if (typeof image === 'string') image = absUrl(image);
    }
    if (!image) image = entry.thumb;

    // Tags
    const tags = [];
    $('.tags a').each((_, a) => {
      const tag = norm($(a).text());
      if (tag) tags.push(tag);
    });

    return {
      id: path.basename(entry.url),
      url: entry.url,
      title,
      artist,
      dateText,
      medium,
      dimensions,
      credit,
      accession,
      image,
      tags,
      scrapedAt: new Date().toISOString()
    };
  } catch (e) {
    console.error(`Error enriching ${entry.url}:`, e.message);
    return null;
  }
}

async function main() {
  console.log('Collecting artwork entries...');
  const artworkEntries = await collectAllListPages();
  console.log(`Found ${artworkEntries.length} artworks`);

  console.log('Enriching artworks...');
  const limit = pLimit(CONCURRENCY);
  const enriched = await Promise.all(
    artworkEntries.map(entry => limit(() => enrichArtwork(entry)))
  );
  const valid = enriched.filter(x => x && x.title);

  console.log(`Enriched ${valid.length} valid artworks`);

  const outPath = path.join(__dirname, '..', 'public', 'data', 'tate-collection-highlights-artworks.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ items: valid }, null, 2));
  console.log(`Wrote to ${outPath}`);
}

main().catch(console.error);