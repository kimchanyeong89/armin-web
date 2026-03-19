const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE_URL = 'https://zeitzmocaa.museum';
const PERMANENT_URL = `${BASE_URL}/exhibition/selections-from-the-collection/`;
const WP_API = `${BASE_URL}/wp-json/wp/v2/exhibition?slug=selections-from-the-collection&_embed=1`;

const OUTPUT_JSON = path.join(__dirname, '../public/data/zeitz-mocaa-collection.json');
const OUTPUT_CSV = path.join(__dirname, '../public/data/zeitz-mocaa-collection.csv');

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

function fetchWithCurl(url, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') {
  return execFileSync(
    'curl',
    [
      '-sSL',
      '--compressed',
      '--connect-timeout', '25',
      '--max-time', '80',
      '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      '-H', `Accept: ${accept}`,
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', `Referer: ${BASE_URL}/`,
      url,
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
}

function extractMetaContent(html, key, byProperty = true) {
  const attr = byProperty ? 'property' : 'name';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]*${attr}=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapedKey}["'][^>]*>`, 'i');
  const m = html.match(re1) || html.match(re2);
  if (m) return cleanText(htmlDecode(m[1]));
  return '';
}

function stripHtml(html) {
  return cleanText(htmlDecode(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')));
}

function extractArtistNames(text) {
  const cleaned = cleanText(text)
    .replace(/SELECTIONS FROM THE COLLECTION/gi, ' ')
    .replace(/About Us[\s\S]*$/i, ' ')
    .replace(/Date\s*&\s*Time[\s\S]*?Book Your Ticket/gi, ' ')
    .replace(/The Zeitz MOCAA Permanent Collection[\s\S]*$/i, ' ');

  const names = [];

  const csvSplit = cleaned
    .replace(/([a-z])([A-Z])/g, '$1|$2')
    .split('|')
    .map((x) => cleanText(x))
    .filter(Boolean);

  for (const part of csvSplit) {
    if (!/^[A-ZÀ-ÖØ-Ý]/.test(part)) continue;
    if (/^(The|A|An|Image|Detail|Copyright|Book|Date|Time)/i.test(part)) continue;
    const tokenCount = part.split(/\s+/).length;
    if (tokenCount >= 2 && tokenCount <= 5) names.push(part);
  }

  return [...new Set(names)];
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
  console.log('[zeitz] Fetching permanent collection exhibition page...');
  const html = fetchWithCurl(PERMANENT_URL);
  const pageTitle = extractMetaContent(html, 'og:title') || extractMetaContent(html, 'twitter:title', false) || 'Selections from the Collection';
  const ogImage =
    extractMetaContent(html, 'og:image') ||
    extractMetaContent(html, 'twitter:image', false) ||
    cleanText(htmlDecode((html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) || [])[1] || ''));
  const ogDescription = extractMetaContent(html, 'og:description');

  let renderedText = stripHtml(html);
  try {
    const apiText = fetchWithCurl(WP_API, 'application/json,text/plain,*/*');
    const json = JSON.parse(apiText);
    if (Array.isArray(json) && json.length > 0) {
      const contentRendered = json[0]?.content?.rendered || '';
      const excerptRendered = json[0]?.excerpt?.rendered || '';
      renderedText = stripHtml(`${contentRendered} ${excerptRendered}`) || renderedText;
    }
  } catch (err) {
    console.warn(`[zeitz] WP API fallback to HTML parse: ${err.message}`);
  }

  const artists = extractArtistNames(renderedText);
  console.log(`[zeitz] Parsed artist rows: ${artists.length}`);

  const baseDescription = cleanText(
    ogDescription ||
    renderedText.slice(0, 1200)
  );

  const items = artists.length > 0
    ? artists.map((artist, idx) => ({
      id: `zeitz-${idx + 1}`,
      museum: 'Zeitz Museum of Contemporary Art Africa',
      museumId: 'zeitz-mocaa',
      title: pageTitle.replace(/\s*\|\s*Zeitz.*$/i, ''),
      artist,
      year: '',
      category: 'Contemporary Art',
      medium: '',
      description: baseDescription,
      onDisplay: true,
      image: ogImage,
      sourceUrl: PERMANENT_URL,
    }))
    : [{
      id: 'zeitz-collection-1',
      museum: 'Zeitz Museum of Contemporary Art Africa',
      museumId: 'zeitz-mocaa',
      title: pageTitle.replace(/\s*\|\s*Zeitz.*$/i, ''),
      artist: 'Various artists',
      year: '',
      category: 'Contemporary Art',
      medium: '',
      description: baseDescription,
      onDisplay: true,
      image: ogImage,
      sourceUrl: PERMANENT_URL,
    }];

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(items, null, 2));
  writeCsv(items);

  console.log(`[zeitz] Done. ${items.length} items`);
  console.log(`[zeitz] JSON: ${OUTPUT_JSON}`);
  console.log(`[zeitz] CSV: ${OUTPUT_CSV}`);
}

scrape().catch((err) => {
  console.error('[zeitz] Fatal:', err);
  process.exitCode = 1;
});
