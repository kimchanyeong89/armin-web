const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE_URL = 'https://gem.eg';
const API_URL = `${BASE_URL}/api/v1/content/artifacts`;
const LISTING_URL = `${BASE_URL}/collection/artefacts/`;

const OUTPUT_JSON = path.join(__dirname, '../public/data/gem-collection.json');
const OUTPUT_CSV = path.join(__dirname, '../public/data/gem-collection.csv');

const PAGE_SIZE = Number(process.env.PAGE_SIZE || 50);
const LIMIT = Number(process.env.LIMIT || 0);
const DEEP = String(process.env.DEEP || '').toLowerCase() === '1' || String(process.env.DEEP || '').toLowerCase() === 'true';

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

function stripHtml(html) {
  return cleanText(htmlDecode(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')));
}

function toAbsoluteUrl(url) {
  const raw = cleanText(url);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function fetchWithCurl(url, accept = 'application/json, text/plain, */*') {
  return execFileSync(
    'curl',
    [
      '-sSL',
      '--compressed',
      '--connect-timeout', '30',
      '--max-time', '90',
      '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      '-H', `Accept: ${accept}`,
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '-H', `Referer: ${LISTING_URL}`,
      '-H', `Origin: ${BASE_URL}`,
      '-H', 'X-Requested-With: XMLHttpRequest',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 }
  );
}

function fetchJson(url) {
  const text = fetchWithCurl(url);
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`Non-JSON response for ${url} (possible WAF block)`);
  }
  return JSON.parse(trimmed);
}

function buildQuery(params) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    usp.set(key, String(value));
  }
  return usp.toString();
}

function extractDetailSections(html) {
  const out = {};

  const infoRowRe = /<div[^>]*class=["'][^"']*info-item\s+row[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;
  while ((match = infoRowRe.exec(html)) !== null) {
    const rowHtml = match[1];
    const label = stripHtml((rowHtml.match(/<h3[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || '');
    const value = stripHtml((rowHtml.match(/<span[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    if (label && value) out[label] = value;
  }

  const sectionRe = /<section[^>]*class=["'][^"']*mandatory-info[^"']*["'][^>]*>[\s\S]*?<h3>([^<]+)<\/h3>[\s\S]*?<div[^>]*class=["'][^"']*card\s+card-body[^"']*["'][^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/section>/gi;
  while ((match = sectionRe.exec(html)) !== null) {
    const label = cleanText(match[1]);
    const value = stripHtml(match[2]);
    if (label && value) out[label] = value;
  }

  return out;
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
    'date',
    'category',
    'medium',
    'period',
    'dynasty',
    'king',
    'description',
    'onDisplay',
    'image',
    'sourceUrl',
    'material',
    'dimensions',
    'provenance',
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
      row.date,
      row.category,
      row.medium,
      row.period,
      row.dynasty,
      row.king,
      row.description,
      row.onDisplay,
      row.image,
      row.sourceUrl,
      row.material,
      row.dimensions,
      row.provenance,
    ].map(toCsvValue).join(','));
  }

  fs.writeFileSync(OUTPUT_CSV, lines.join('\n'));
}

async function scrape() {
  console.log('[gem] Fetching artifact pages...');

  let pageIndex = 0;
  let pagesCount = 1;
  const allItems = [];

  while (pageIndex < pagesCount) {
    const query = buildQuery({ pi: pageIndex, ps: PAGE_SIZE });
    const page = fetchJson(`${API_URL}?${query}`);

    const items = Array.isArray(page.items) ? page.items : [];
    allItems.push(...items);

    pagesCount = Number(page.pagesCount) || pagesCount;
    const count = Number(page.count) || allItems.length;
    console.log(`[gem] Page ${pageIndex}/${pagesCount}: +${items.length} (acc: ${allItems.length}, reported: ${count})`);

    if (LIMIT > 0 && allItems.length >= LIMIT) break;
    pageIndex += 1;
  }

  const sliced = LIMIT > 0 ? allItems.slice(0, LIMIT) : allItems;

  const rows = [];
  for (let idx = 0; idx < sliced.length; idx += 1) {
    const item = sliced[idx] || {};

    const sourceUrl = toAbsoluteUrl(item.url);
    const image =
      cleanText(item?.image?.desktopURL) ||
      cleanText(item?.image?.responisveURL) ||
      cleanText(item?.image?.iPadURL) ||
      cleanText(item?.image?.mobileAppURL) ||
      '';

    let detailFields = {};
    if (DEEP && sourceUrl) {
      try {
        const detailHtml = fetchWithCurl(sourceUrl, 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
        detailFields = extractDetailSections(detailHtml);
      } catch (err) {
        console.warn(`[gem] detail parse failed (${idx + 1}/${sliced.length}): ${sourceUrl} :: ${err.message}`);
      }
    }

    const medium = cleanText(detailFields.Material || detailFields.Materials || detailFields['Object Type'] || '');
    const dimensions = cleanText(detailFields.Dimensions || '');
    const provenance = cleanText(detailFields.Provenance || detailFields.Region || '');

    rows.push({
      id: `gem-${item.id || idx + 1}`,
      museum: 'Grand Egyptian Museum',
      museumId: 'gem',
      title: cleanText(item.title) || 'Untitled',
      artist: cleanText(item.king) || 'Unknown',
      year: '',
      date: '',
      category: cleanText(item.period) || cleanText(item.dynasty) || 'Artifact',
      medium,
      period: cleanText(item.period),
      dynasty: cleanText(item.dynasty),
      king: cleanText(item.king),
      description: cleanText(item.description),
      onDisplay: true,
      image,
      sourceUrl,
      dimensions,
      provenance,
      metadata: {
        ...item,
        detailFields,
      },
    });
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(rows, null, 2));
  writeCsv(rows);

  console.log(`[gem] Done. ${rows.length} items`);
  console.log(`[gem] JSON: ${OUTPUT_JSON}`);
  console.log(`[gem] CSV: ${OUTPUT_CSV}`);
}

scrape().catch((err) => {
  console.error('[gem] Fatal:', err);
  process.exitCode = 1;
});
