/**
 * Musée d'Orsay Collection Scraper (v2 — got + cheerio, no Playwright)
 *
 * Two search sources:
 *   1. paintings-domain:  f[0]=artwork_domain:peintures
 *   2. drawings-pastels:  f[0]=artwork_designation:dessin&pastel&peinture
 *
 * Metadata per artwork (from detail page):
 *   title, artist, year, image, dimensions, medium, objectType[],
 *   materials[], tags[], accessionNumber, onDisplay, room, detailUrl
 *
 * Output: public/data/orsay-collection.json
 * Progress (resume): downloads/orsay-progress.json
 */

const fs   = require('fs');
const path = require('path');

let got, cheerio, pLimit;

const ROOT      = 'https://www.musee-orsay.fr';
const OUT_PATH  = path.join(__dirname, '..', 'public', 'data', 'orsay-collection.json');
const PROG_PATH = path.join(__dirname, '..', 'downloads', 'orsay-progress.json');
const CONC      = parseInt(process.env.ORSAY_CONCURRENCY || '3', 10);
const DELAY_MS  = parseInt(process.env.ORSAY_DELAY || '1200', 10);

// ── Two search sources ───────────────────────────────────────────────────────
const SEARCH_SOURCES = [
  {
    label: 'paintings-domain',
    url: 'https://www.musee-orsay.fr/fr/collections/recherche?search=&domain_kind_checkboxes%5B276575%5D=276575&domain_kind_checkboxes%5B276577%5D=276577&index_artwork_has_picture=1&sort_by=search_api_relevance&items_per_page=100&search_type=simple_search&display_type=grid&f%5B0%5D=artwork_domain%3Apeintures',
  },
  {
    label: 'drawings-pastels',
    url: 'https://www.musee-orsay.fr/fr/collections/recherche?search=&domain_kind_checkboxes%5B276575%5D=276575&domain_kind_checkboxes%5B276577%5D=276577&index_artwork_has_picture=1&sort_by=search_api_relevance&items_per_page=100&search_type=simple_search&display_type=grid&f%5B0%5D=artwork_designation%3Adessin&f%5B1%5D=artwork_designation%3Apastel&f%5B2%5D=artwork_designation%3Apeinture',
  },
];

const FETCH_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr,en;q=0.9',
    'Referer': ROOT,
  },
  timeout: { request: 30000 },
  retry: { limit: 3, backoffLimit: 10000 },
};

function norm(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&ndash;/g, '–')
    .trim();
}

async function fetchHtml(url) {
  if (!got) got = (await import('got')).default;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await got(url, { ...FETCH_OPTS });
      return res.body;
    } catch (e) {
      if (e.response?.statusCode === 429 || (e.message || '').includes('429')) {
        const wait = 12000 * (attempt + 1);
        console.log(`  Rate limited, waiting ${wait / 1000}s (attempt ${attempt + 1})...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
  throw new Error(`Max retries exceeded for ${url}`);
}

// ── Phase 1: Collect artwork URLs from paginated search ───────────────────────
async function collectArtworkUrls(sourceLabel, baseUrl) {
  const seen = new Set();
  const urls = [];
  let page = 0;
  let consecutive_empty = 0;

  while (consecutive_empty < 2) {
    const url = `${baseUrl}&page=${page}`;
    console.log(`  [${sourceLabel}] Page ${page}...`);
    try {
      const html = await fetchHtml(url);
      if (!cheerio) cheerio = require('cheerio');
      const $ = cheerio.load(html);

      let found = 0;
      $('a[href^="/fr/oeuvres/"]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href || !/\/fr\/oeuvres\/[a-z0-9%-]+-\d+$/.test(href)) return;
        const id = parseInt(href.split('-').pop(), 10);
        if (isNaN(id) || seen.has(id)) return;
        seen.add(id);
        urls.push({ id, url: ROOT + href, slug: href.split('/').pop() });
        found++;
      });

      console.log(`    → ${found} new, running total: ${urls.length}`);
      if (found === 0) {
        consecutive_empty++;
      } else {
        consecutive_empty = 0;
        page++;
      }
      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (e) {
      console.error(`  Page ${page} error: ${e.message}`);
      await new Promise(r => setTimeout(r, 6000));
      if (++consecutive_empty >= 3) break;
    }
  }
  console.log(`  [${sourceLabel}] Done: ${urls.length} unique URLs`);
  return urls;
}

// ── Phase 2: Extract full metadata from detail page ───────────────────────────
async function fetchArtworkDetail(entry) {
  if (!cheerio) cheerio = require('cheerio');
  const html = await fetchHtml(entry.url);
  const $ = cheerio.load(html);

  // Title (first "titre principal")
  let title = '';
  $('#artwork-resume .sub-section').each((_, s) => {
    if (/Titre/i.test($(s).find('.label').text()) && !title) {
      $(s).find('.paragraph').each((_, p) => {
        const t = norm($(p).text());
        const m = t.match(/titre principal\s*:\s*(.+)/i);
        if (m && !title) title = m[1].trim();
      });
    }
  });
  if (!title) title = norm($('title').text().split('|')[0]);

  // Artist
  let artist = 'Unknown';
  $('#artwork-resume .sub-section').each((_, s) => {
    if (/Artiste/i.test($(s).find('.label').text())) {
      const a = $(s).find('.paragraph a').first();
      if (a.length) artist = norm(a.text());
    }
  });

  // Year
  let year = '';
  $('#artwork-resume .sub-section').each((_, s) => {
    const lbl = norm($(s).find('.label').text());
    if (lbl === 'Date') year = norm($(s).find('.value').text());
  });

  // Accession number
  let accessionNumber = '';
  $('#artwork-resume .sub-section').each((_, s) => {
    const lbl = norm($(s).find('.label').text());
    if (/inventaire/i.test(lbl) && !/autres/i.test(lbl)) {
      accessionNumber = norm($(s).find('.value').text()).replace(/\s+/g, ' ').trim();
    }
  });

  // Description (brief medium from resume)
  let medium = '';
  $('#artwork-resume .sub-section').each((_, s) => {
    if (/Description/i.test($(s).find('.label').text())) {
      medium = norm($(s).find('.value').text());
    }
  });

  // Dimensions
  let dimensions = '';
  $('#artwork-resume .sub-section').each((_, s) => {
    if (/Dimensions/i.test($(s).find('.label').text())) {
      dimensions = norm($(s).find('.value').html() || '').replace(/<br\s*\/?>/gi, ' ').trim();
    }
  });

  // Indexation: objectType, materials, tags
  const objectType = [];
  const materials  = [];
  const tags       = [];

  $('#artwork-indexation').find('.tags').each((_, tagsDiv) => {
    const drawer = norm($(tagsDiv).find('.drawer').first().text()).toLowerCase();
    const vals = $(tagsDiv).find('.value a').map((_, a) => norm($(a).text())).get().filter(Boolean);
    if (drawer.includes("type d'objet") || drawer.includes("type d\u2019objet")) {
      objectType.push(...vals);
    } else if (drawer.includes('matériaux') || drawer.includes('materiaux') || drawer.includes('technique')) {
      materials.push(...vals);
    } else if (drawer.includes('détails') || drawer.includes('details')) {
      tags.push(...vals);
    }
  });

  // On display / room
  const bodyText = $.root().text();
  const notDisplayed = /non\s+expos[ée]e?\s+en\s+salle/i.test(bodyText);
  const onDisplay    = !notDisplayed;
  const roomM        = bodyText.match(/Salle\s+(\d+)/);
  const room         = (onDisplay && roomM) ? roomM[1] : null;

  // Image (first CDN image on page)
  let image = '';
  $('img[src*="cdn.mediatheque.epmoo.fr"], source[srcset*="cdn.mediatheque.epmoo.fr"]').each((_, el) => {
    if (!image) image = $(el).attr('src') || $(el).attr('srcset') || '';
  });

  return {
    id: `orsay-${entry.id}`,
    orsayId: entry.id,
    title: title || entry.slug.replace(/-\d+$/, '').replace(/-/g, ' '),
    artist,
    year,
    image,
    dimensions,
    medium,
    objectType,
    materials,
    tags,
    accessionNumber,
    onDisplay,
    room,
    detailUrl: entry.url,
    source: "Musée d'Orsay",
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  got     = (await import('got')).default;
  pLimit  = (await import('p-limit')).default;
  cheerio = require('cheerio');

  fs.mkdirSync(path.dirname(PROG_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  // Load / init progress
  let prog = { phase1: {}, phase2: {}, done: false };
  if (fs.existsSync(PROG_PATH)) {
    prog = JSON.parse(fs.readFileSync(PROG_PATH, 'utf8'));
    console.log('Resuming from progress file');
    if (prog.done) { console.log('Already complete.'); return; }
  }
  if (!prog.phase2) prog.phase2 = {};

  // ── Phase 1 ────────────────────────────────────────────────────────────────
  const allUrls = new Map();
  for (const src of SEARCH_SOURCES) {
    if (prog.phase1[src.label]) {
      prog.phase1[src.label].forEach(e => allUrls.set(e.id, e));
      console.log(`[${src.label}] phase1 cached (${prog.phase1[src.label].length})`);
    } else {
      console.log(`\nPhase 1 [${src.label}]...`);
      const urls = await collectArtworkUrls(src.label, src.url);
      prog.phase1[src.label] = urls;
      urls.forEach(e => allUrls.set(e.id, e));
      fs.writeFileSync(PROG_PATH, JSON.stringify(prog, null, 2));
    }
  }

  const uniqueEntries = [...allUrls.values()];
  console.log(`\nUnique artworks: ${uniqueEntries.length}`);

  // ── Phase 2 ────────────────────────────────────────────────────────────────
  const completed = new Map(
    Object.entries(prog.phase2).map(([k, v]) => [parseInt(k, 10), v])
  );
  const toFetch = uniqueEntries.filter(e => !completed.has(e.id));
  console.log(`\nPhase 2: ${toFetch.length} to fetch (${completed.size} already done)...`);

  const limit = pLimit(CONC);
  let newDone = 0;
  const SAVE_EVERY = 50;

  const tasks = toFetch.map(entry => limit(async () => {
    try {
      const artwork = await fetchArtworkDetail(entry);
      completed.set(entry.id, artwork);
      prog.phase2[entry.id] = artwork;
      newDone++;
      if (newDone % 25 === 0) {
        process.stdout.write(`  ${completed.size}/${uniqueEntries.length}...\r`);
      }
      if (newDone % SAVE_EVERY === 0) {
        fs.writeFileSync(PROG_PATH, JSON.stringify(prog, null, 2));
      }
    } catch (e) {
      console.error(`  Error [${entry.id}]: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, Math.random() * 500 + DELAY_MS));
  }));

  await Promise.all(tasks);
  fs.writeFileSync(PROG_PATH, JSON.stringify(prog, null, 2));

  // ── Write output ──────────────────────────────────────────────────────────
  const artworks = [...completed.values()].filter(a => a?.image);
  const onDisplayCount = artworks.filter(a => a.onDisplay).length;
  console.log(`\nWith images: ${artworks.length} (on display: ${onDisplayCount})`);

  const output = {
    museum: "Musée d'Orsay",
    museumId: "orsay",
    collectionName: "Collection",
    scrapedAt: new Date().toISOString(),
    totalObjects: artworks.length,
    objects: artworks,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`Written to ${OUT_PATH}`);

  prog.done = true;
  fs.writeFileSync(PROG_PATH, JSON.stringify(prog, null, 2));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
