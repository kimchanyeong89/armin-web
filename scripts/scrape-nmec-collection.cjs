const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE_URL = 'https://nmec.gov.eg';
const COLLECTION_URL = `${BASE_URL}/collection/`;
const OUTPUT_JSON = path.join(__dirname, '../public/data/nmec-collection.json');
const OUTPUT_CSV = path.join(__dirname, '../public/data/nmec-collection.csv');
const DEEP = process.env.DEEP === '1';
const FALLBACK_IMAGE = 'https://nmec.gov.eg/wp-content/uploads/2021/03/nmec.jpg';

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function htmlDecode(value) {
  return String(value == null ? '' : value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function toAbsoluteUrl(url) {
  const u = cleanText(url);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${BASE_URL}${u}`;
  return `${BASE_URL}/${u.replace(/^\/+/, '')}`;
}

function fetchWithCurl(url) {
  return execFileSync(
    'curl',
    [
      '-sSL',
      '--compressed',
      '--connect-timeout', '25',
      '--max-time', '80',
      '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', `Referer: ${BASE_URL}/`,
      url,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
}

function extractLinks(html, patternRe) {
  const out = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = toAbsoluteUrl(htmlDecode(m[1]));
    if (patternRe.test(href)) out.push(href);
  }
  return out;
}

function extractMetaContent(html, key, byProperty = true) {
  const attr = byProperty ? 'property' : 'name';
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const m = html.match(re);
  if (m) return cleanText(htmlDecode(m[1]));
  return '';
}

function extractBodyText(html) {
  const m = html.match(/<div[^>]+class=["'][^"']*(?:entry-content|elementor)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const scope = m ? m[1] : html;
  return cleanText(htmlDecode(scope.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')));
}

function toCsvValue(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function writeCsv(rows) {
  const headers = [
    'id',
    'museum',
    'museumId',
    'title',
    'artist',
    'year',
    'category',
    'medium',
    'description',
    'onDisplay',
    'image',
    'sourceUrl',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.museum,
      row.museumId,
      row.title,
      row.artist,
      row.year,
      row.category,
      row.medium,
      row.description,
      row.onDisplay,
      row.image,
      row.sourceUrl,
    ].map(toCsvValue).join(','));
  }

  fs.writeFileSync(OUTPUT_CSV, lines.join('\n'));
}

async function scrape() {
  console.log('[nmec] Fetching collection landing page...');
  const html = fetchWithCurl(COLLECTION_URL);

  const detailPattern = /\/collections\/[a-z0-9-]+\/?$/i;
  const links = extractLinks(html, detailPattern);
  const detailUrls = [...new Set(links)];

  console.log(`[nmec] Detail links found: ${detailUrls.length}`);

  const items = [];
  for (let i = 0; i < detailUrls.length; i += 1) {
    const url = detailUrls[i];
    try {
      const slug = cleanText(url.split('/').filter(Boolean).pop() || `item-${i + 1}`);
      let title = slug
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
      let image = FALLBACK_IMAGE;
      let description = '';

      if (DEEP) {
        const detailHtml = fetchWithCurl(url);
        title = extractMetaContent(detailHtml, 'og:title') || cleanText(htmlDecode((detailHtml.match(/<title>([^<]+)<\/title>/i) || [])[1] || title));
        image = toAbsoluteUrl(extractMetaContent(detailHtml, 'og:image')) || FALLBACK_IMAGE;
        description = extractMetaContent(detailHtml, 'og:description') || extractBodyText(detailHtml).slice(0, 1000);
      }

      const item = {
        id: `nmec-${slug}`,
        museum: 'National Museum of Egyptian Civilization',
        museumId: 'nmec',
        title: title.replace(/\s*\|\s*NMEC.*$/i, ''),
        artist: 'Unknown',
        year: '',
        category: 'Collection',
        medium: '',
        description,
        onDisplay: true,
        image: image || FALLBACK_IMAGE,
        sourceUrl: url,
      };

      if (item.title) items.push(item);
    } catch (err) {
      console.warn(`[nmec] Failed item ${url}: ${err.message}`);
    }
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));
  writeCsv(items);

  console.log(`[nmec] Done. ${items.length} items`);
  console.log(`[nmec] JSON: ${OUTPUT_JSON}`);
  console.log(`[nmec] CSV: ${OUTPUT_CSV}`);
}

scrape().catch((err) => {
  console.error('[nmec] Fatal:', err);
  process.exitCode = 1;
});
