const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../public/data/guggenheim-ny-collection.json');

const API_ROOT = 'https://www.guggenheim.org/wp-json/wp/v2';
const SITE_CLASS = 'site-solomon-r-guggenheim-museum';
const PER_PAGE = Number(process.env.PER_PAGE || 100);
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : null; // optional limit for testing

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    }, (res) => {
      const { statusCode } = res;
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (statusCode && statusCode >= 200 && statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve({ json, headers: res.headers });
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${statusCode} for ${url}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function toYearFromDecade(decadeTerms) {
  if (!Array.isArray(decadeTerms) || decadeTerms.length === 0) return 0;
  for (const t of decadeTerms) {
    const m = String(t.name || '').match(/(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return 0;
}

function pickArtist(terms) {
  if (!Array.isArray(terms) || terms.length === 0) return 'Unknown';
  const names = terms
    .filter((t) => /artist/i.test(String(t.taxonomy || ''))) 
    .map((t) => String(t.name || '').trim())
    .filter(Boolean);
  if (names.length === 0) return 'Unknown';
  return Array.from(new Set(names)).join(', ');
}

// Map Guggenheim taxonomies + class_list to a primary medium category
function pickMediumCategory(allTerms, classList) {
  const tokens = [];
  for (const t of allTerms || []) {
    const tax = String(t.taxonomy || '').toLowerCase();
    const slug = String(t.slug || '').toLowerCase();
    const name = String(t.name || '').toLowerCase();
    if (/artwork_type|medium|mediums?/i.test(tax)) {
      tokens.push(slug, name);
    }
  }
  for (const cls of classList || []) {
    if (typeof cls !== 'string') continue;
    const c = cls.toLowerCase();
    if (c.includes('film') || c.includes('video')) tokens.push('film/video');
    if (c.includes('installation')) tokens.push('installation');
    if (c.includes('internet')) tokens.push('internet art');
    if (c.includes('painting')) tokens.push('painting');
    if (c.includes('photo')) tokens.push('photography');
    if (c.includes('sculpture')) tokens.push('sculpture');
    if (c.includes('work-on-paper') || c.includes('works-on-paper')) tokens.push('work on paper');
  }

  const text = tokens.join(' ').toLowerCase();
  if (!text) return 'Artwork';
  if (/(film|video)/.test(text)) return 'Film/Video';
  if (/installation/.test(text)) return 'Installation';
  if (/internet/.test(text)) return 'Internet Art';
  if (/painting|oil on canvas|acrylic on canvas|tempera/.test(text)) return 'Painting';
  if (/photograph|photography|gelatin silver|chromogenic/.test(text)) return 'Photography';
  if (/sculpture|bronze|marble|steel|wood|plaster/.test(text)) return 'Sculpture';
  if (/work on paper|works on paper|drawing|gouache|watercolor|ink on paper|etching|lithograph|print/.test(text)) return 'Work on Paper';
  return 'Artwork';
}

// Collect a richer categories[] array from movements, special collections, etc.
function pickCategories(allTerms, classList, mediumCategory) {
  const out = new Set();
  if (mediumCategory) out.add(mediumCategory);

  for (const t of allTerms || []) {
    const name = String(t.name || '').trim();
    if (!name) continue;
    const tax = String(t.taxonomy || '').toLowerCase();
    if (tax.includes('movement') || tax.includes('special_collection') || tax.includes('site')) {
      out.add(name);
    }
  }

  for (const cls of classList || []) {
    if (!cls || typeof cls !== 'string') continue;
    const c = cls.toLowerCase();
    if (c.startsWith('category-')) {
      const label = cls.replace(/^category-/, '').replace(/-/g, ' ');
      if (!/permanent collection/i.test(label)) out.add(label);
    }
  }

  return Array.from(out);
}

async function fetchAllArtworks() {
  let page = 1;
  let total = null;
  const items = [];

  while (true) {
    if (MAX_PAGES && page > MAX_PAGES) break;
    const url = `${API_ROOT}/artwork?per_page=${PER_PAGE}&page=${page}&class_list=${encodeURIComponent(
      SITE_CLASS
    )}&_embed=1`;
    process.stdout.write(`page ${page}... `);
    const { json, headers } = await fetchJson(url);
    if (!Array.isArray(json) || json.length === 0) {
      console.log('no items, stop');
      break;
    }
    if (total == null && headers['x-wp-total']) {
      total = parseInt(String(headers['x-wp-total']), 10) || null;
    }
    console.log(`+${json.length}`);
    items.push(...json);

    const totalPages = headers['x-wp-totalpages'] ? parseInt(String(headers['x-wp-totalpages']), 10) : null;
    if (!totalPages || page >= totalPages) break;
    page += 1;
    await sleep(400);
  }

  return { total, items };
}

(async () => {
  console.log('Fetching Guggenheim NY artworks via WordPress JSON...');
  const { total, items } = await fetchAllArtworks();
  console.log(`Total header: ${total}, fetched: ${items.length}`);

  const mapped = [];
  for (const post of items) {
    const id = String(post.id);
    const slug = String(post.slug || '');
    const title = stripHtml(post.title?.rendered || '') || 'Untitled';
    const link = post.link || '';
    const classList = Array.isArray(post.class_list) ? post.class_list : [];
    const termGroups = Array.isArray(post._embedded?.['wp:term']) ? post._embedded['wp:term'] : [];
    const allTerms = termGroups.flat().filter(Boolean);
    const artist = pickArtist(allTerms);
    const decadeTerms = allTerms.filter((t) => /decade/i.test(String(t.taxonomy || '')));
    const year = toYearFromDecade(decadeTerms);
    const mediumCategory = pickMediumCategory(allTerms, classList);
    const categories = pickCategories(allTerms, classList, mediumCategory);
    const media = Array.isArray(post._embedded?.['wp:featuredmedia'])
      ? post._embedded['wp:featuredmedia'][0]
      : null;
    const image = media?.source_url || '';

    mapped.push({
      id: slug || id,
      slug,
      title,
      artist,
      year,
      medium: '',
      category: mediumCategory || 'Artwork',
      categories,
      dimensions: '',
      image,
      sourceUrl: link,
    });
  }

  const summary = {
    museum: 'Solomon R. Guggenheim Museum',
    museumId: 'guggenheim-ny',
    location: 'New York, USA',
    type: 'permanent',
    source: `${API_ROOT}/artwork?class_list=${SITE_CLASS}`,
    scrapedAt: new Date().toISOString(),
    totalArtworks: mapped.length,
    objects: mapped,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(`Wrote ${mapped.length} artworks to ${OUTPUT_FILE}`);
})();
