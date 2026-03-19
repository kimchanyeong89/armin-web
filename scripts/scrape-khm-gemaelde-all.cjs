const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.khm.at';

// This URL is only used to bootstrap the HTMX form/hx-post endpoint.
// It must point at the Gemälde + has_image search page.
const START_URL =
  'https://www.khm.at/en/artworks/search?fq%5Bfacet_classification%5D=Gem%C3%A4lde&fq%5Bfacet_has_image%5D%5B0%5D=1&cHash=738b8e81cc3ddb9958b1da50cd95fa40';

const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const PROGRESS_FILE = path.join(DOWNLOADS_DIR, 'khm-gemaelde-all-progress.json');
const OUT_RAW = path.join(DOWNLOADS_DIR, 'khm-gemaelde-all.json');
const OUT_LOG_HINT = path.join(DOWNLOADS_DIR, 'khm-gemaelde-all.log');

const WRITE_PUBLIC = process.env.WRITE_PUBLIC === '1' || process.env.PUBLIC === '1';
const OUT_PUBLIC = path.join(__dirname, '../public/data/khm-collection.json');

const CLEAN = process.env.CLEAN === '1';
const MAX_ITEMS = process.env.MAX_ITEMS ? Number(process.env.MAX_ITEMS) : Infinity;

const CONCURRENCY = process.env.CONCURRENCY ? Math.max(1, Number(process.env.CONCURRENCY)) : 4;
const CHECKPOINT_EVERY = process.env.CHECKPOINT_EVERY ? Math.max(1, Number(process.env.CHECKPOINT_EVERY)) : 25;

const SLEEP_LIST_MS = process.env.SLEEP_LIST_MS ? Number(process.env.SLEEP_LIST_MS) : 650;
const SLEEP_DETAIL_MS = process.env.SLEEP_DETAIL_MS ? Number(process.env.SLEEP_DETAIL_MS) : 200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[:]/g, '');
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function extractIdFromUrl(url) {
  const m = String(url || '').match(/\/object\/(\d+)/);
  return m ? m[1] : '';
}

function parseJsonLd($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // ignore
    }
  });
  return out;
}

function cleanInlineText(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(DNBarrow_outward|arrow_outward|keyboard_arrow_down)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestImageUrl($) {
  const og = $('meta[property="og:image"]').attr('content');
  if (og) return og.startsWith('http') ? og : BASE + og;

  const imgEl = $('.object-image img, .detail-image img, picture img, img[itemprop="image"], [itemprop="image"] img').first();
  const src = imgEl.attr('src') || imgEl.attr('data-src');
  if (src && src.length > 10) return src.startsWith('http') ? src : BASE + src;

  return '';
}

async function fetchHtml(url, opts = {}) {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,*/*',
      ...opts.headers
    },
    timeout: opts.timeout || 25000,
    validateStatus: (s) => s >= 200 && s < 400
  });
  return String(res.data);
}

async function postHtmx(url, formBody) {
  const res = await axios.post(url, formBody, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'HX-Request': 'true'
    },
    timeout: 25000,
    validateStatus: (s) => s >= 200 && s < 400
  });
  return String(res.data);
}

function extractHtmxListUrl(wrapperHtml) {
  const $ = cheerio.load(wrapperHtml);
  const el = $('.object-list[hx-get]').first();
  const raw = el.attr('hx-get');
  if (!raw) return '';
  return raw.replace(/&amp;/g, '&');
}

async function resolveListHtmlFromHtmxWrapper(wrapperHtml) {
  const hxGet = extractHtmxListUrl(wrapperHtml);
  if (!hxGet) return wrapperHtml;
  const url = hxGet.startsWith('http') ? hxGet : BASE + hxGet;
  return await fetchHtml(url, {
    headers: {
      'HX-Request': 'true',
      'X-Requested-With': 'XMLHttpRequest'
    }
  });
}

async function buildRequestTemplateFromStartPage() {
  const html = await fetchHtml(START_URL);
  const $ = cheerio.load(html);
  const form = $('#objectdb-form');
  const hxPost = form.attr('hx-post');
  if (!hxPost) throw new Error('Could not find hx-post on #objectdb-form');

  const base = {};
  form.find('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    if (name && value != null && value !== '') base[name] = value;
  });

  // Include selected filters (checked)
  form.find('input[checked]').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    if (!name) return;
    if (value == null) return;

    if (base[name]) {
      if (Array.isArray(base[name])) base[name].push(value);
      else base[name] = [base[name], value];
    } else {
      base[name] = value;
    }
  });

  if (base['fq[facet_classification]'] !== 'Gemälde') {
    base['fq[facet_classification]'] = 'Gemälde';
  }
  if (!base['fq[facet_has_image][]']) {
    base['fq[facet_has_image][]'] = '1';
  }

  // Some pages include date range as plain inputs
  const dateBegin = form.find('input[name="facet_date_begin"]').attr('value');
  const dateEnd = form.find('input[name="facet_date_end"]').attr('value');
  if (dateBegin) base['facet_date_begin'] = dateBegin;
  if (dateEnd) base['facet_date_end'] = dateEnd;

  return { hxPost: BASE + hxPost, baseParams: base };
}

function buildFormBody(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const one of v) usp.append(k, String(one));
    } else {
      usp.append(k, String(v));
    }
  }
  return usp.toString();
}

function parseListPage(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('.grid-item .object-gallery-item').each((_, el) => {
    const item = $(el);
    const link = item.find('a.detail').first();
    const href = link.attr('href');
    const url = href ? (href.startsWith('http') ? href : BASE + href) : '';
    const dataId = link.attr('data-id') || extractIdFromUrl(url);

    const img = item.find('img').first();
    const imageSrc = img.attr('src') || img.attr('data-src');
    const imageUrl = imageSrc ? (imageSrc.startsWith('http') ? imageSrc : BASE + imageSrc) : '';

    const caption = item.find('.object-caption p');
    const spans = caption.find('span');
    const title = firstNonEmpty(spans.eq(0).text(), img.attr('alt'));
    const artist = spans.eq(1).find('small').text().trim();
    const date = spans.eq(2).find('small').text().trim();

    if (!dataId || !url) return;
    if (!imageUrl) return;

    items.push({
      id: dataId,
      url,
      title: title || 'Untitled',
      artist,
      culture: '',
      date,
      thumb: imageUrl
    });
  });

  const next = { pageLink: '', hxPost: '' };

  const nextA =
    $('a[rel="next"], .pagination a[rel="next"], .pagination-next a').first().length
      ? $('a[rel="next"], .pagination a[rel="next"], .pagination-next a').first()
      : $('.pagination a')
          .filter((_, el) => {
            const t = ($(el).text() || '').toLowerCase();
            return t.includes('next') || t.includes('weiter');
          })
          .first();

  if (nextA && nextA.length) {
    const href = nextA.attr('href');
    if (href) next.pageLink = href.startsWith('http') ? href : BASE + href;
  }

  const loadMore = $('[hx-post*="/en/artworks/search"], [hx-get*="/en/artworks/search"]').filter((_, el) => {
    const t = ($(el).text() || '').toLowerCase();
    return t.includes('load more') || t.includes('mehr') || t.includes('weitere');
  }).first();

  if (loadMore.length) {
    const rawGet = loadMore.attr('hx-get');
    if (rawGet) {
      const href = rawGet.replace(/&amp;/g, '&');
      next.pageLink = href.startsWith('http') ? href : BASE + href;
    }

    next.hxPost = loadMore.attr('hx-post')
      ? (loadMore.attr('hx-post').startsWith('http') ? loadMore.attr('hx-post') : BASE + loadMore.attr('hx-post'))
      : '';
  }

  if (!next.pageLink) {
    const hrefs = $('a[href]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
    const candidates = hrefs
      .map((h) => (h.startsWith('http') ? h : BASE + h))
      .filter((h) => h.includes('/en/artworks/search') && /[?&]page=\d+/.test(h) && h.includes('cHash='));

    const currentPage = (() => {
      const m = html.match(/[?&]page=(\d+)/);
      return m ? Number(m[1]) : 1;
    })();

    const nextPage = currentPage + 1;
    const explicit = candidates.find((h) => new RegExp(`[?&]page=${nextPage}([&#]|$)`).test(h));
    next.pageLink = explicit || candidates[0] || '';
  }

  return { items, next };
}

async function scrapeDetail(art) {
  const html = await fetchHtml(art.url, { timeout: 25000 });
  const $ = cheerio.load(html);

  const jsonLd = parseJsonLd($);
  const ld =
    jsonLd.find((x) => x && (x['@type'] || '').toString().toLowerCase().includes('visual')) ||
    jsonLd[0] ||
    {};

  const meta = {};
  $('dt').each((_, el) => {
    const key = normKey($(el).text());
    const value = cleanInlineText($(el).next('dd').text());
    if (key && value) meta[key] = value;
  });

  const details = {};
  $('[class^=details-], [class*=" details-"]').each((_, el) => {
    const cls = String($(el).attr('class') || '')
      .split(/\s+/)
      .find((c) => c.startsWith('details-'));
    if (!cls) return;

    const p = $(el).find('p').first();
    if (!p.length) return;

    const label = cleanInlineText(
      p
        .clone()
        .children('strong')
        .remove()
        .end()
        .text()
        .replace(/:$/g, '')
    );

    const strongClone = p.find('strong').first().clone();
    strongClone.find('.icon, .material-symbols-outlined, svg').remove();
    const value = cleanInlineText(strongClone.text());

    if (!value) return;

    // Note: same class (e.g. details-artists) may repeat for different labels.
    // Store both by class and by normalized label.
    details[cls] = { label, value };
    if (label) details[`label:${normKey(label)}`] = { label, value };
  });

  const title = firstNonEmpty(
    $('h1').first().text(),
    $('[itemprop="name"]').first().text(),
    ld.name,
    art.title
  );

  const imageUrl = firstNonEmpty(
    pickBestImageUrl($),
    (Array.isArray(ld.image) ? ld.image[0] : ld.image) || '',
    art.thumb
  );

  const description = firstNonEmpty(
    $('[itemprop="description"]').text(),
    $('.object-description').text(),
    ld.description
  ).slice(0, 2000);

  const objectType = firstNonEmpty(
    details['details-object_name']?.value,
    details['label:object name']?.value,
    meta['object type'],
    meta['objekttyp'],
    meta['type'],
    meta['gattung']
  );

  const category = firstNonEmpty(
    meta['classification'],
    meta['klassifikation'],
    meta['sammlung'],
    meta['department'],
    meta['abteilung'],
    'Gemälde'
  );

  const highlight = (() => {
    const v = firstNonEmpty(meta['highlight'], meta['is highlight'], meta['featured']);
    if (!v) return false;
    const s = v.toLowerCase();
    return s === '1' || s === 'yes' || s === 'true' || s.includes('ja');
  })();

  const artist = firstNonEmpty(
    details['label:artist']?.value,
    details['label:producer/artist']?.value,
    meta['artist'],
    meta['künstler'],
    meta['creator'],
    ld?.creator?.name || '',
    art.artist
  );

  const depictionPerson = firstNonEmpty(
    details['label:depiction/person']?.value,
    details['label:depiction person']?.value
  );

  const date = firstNonEmpty(
    details['details-time']?.value,
    details['label:time']?.value,
    meta['date'],
    meta['datierung'],
    meta['dating'],
    ld.dateCreated,
    art.date
  );

  const culture = firstNonEmpty(
    details['details-culture']?.value,
    details['label:culture']?.value,
    meta['culture'],
    meta['kultur'],
    art.culture
  );

  const medium = firstNonEmpty(
    details['details-medium']?.value,
    details['label:material/technology']?.value,
    meta['material'],
    meta['medium'],
    meta['technik'],
    meta['technique']
  );

  const dimensions = firstNonEmpty(
    details['details-dimensions']?.value,
    details['label:dimensions']?.value,
    meta['maße'],
    meta['dimensions'],
    meta['size']
  );

  const inventory = firstNonEmpty(
    details['details-object_number']?.value,
    details['label:invs.']?.value,
    meta['inventarnummer'],
    meta['inventory number'],
    meta['inventory'],
    art.id
  );

  return {
    id: art.id,
    url: art.url,
    title,
    creator: artist,
    artist,
    depictionPerson,
    culture,
    date,
    medium,
    dimensions,
    inventory,
    imageUrl,
    objectType,
    category,
    isHighlight: highlight,
    description,
    source: 'Kunsthistorisches Museum Vienna',
    sourceUrl: BASE
  };
}

function loadProgress() {
  if (CLEAN) return null;
  if (!fs.existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

async function collectIdSetFromList({ hxPost, baseParams }, { maxSteps = 500, sleepMs = 600 } = {}) {
  const ids = new Set();
  let currentUrl = hxPost;
  let safety = 0;

  while (currentUrl && safety < maxSteps) {
    safety++;
    const body = buildFormBody(baseParams);

    let listHtml;
    if (currentUrl.includes('listOnly=1')) {
      listHtml = await fetchHtml(currentUrl, {
        headers: {
          'HX-Request': 'true',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
    } else {
      const wrapperHtml = await postHtmx(currentUrl, body);
      listHtml = await resolveListHtmlFromHtmxWrapper(wrapperHtml);
    }

    const { items, next } = parseListPage(listHtml);
    if (!items.length) break;

    for (const it of items) ids.add(String(it.id));
    currentUrl = next.pageLink || '';
    if (sleepMs) await sleep(sleepMs);
  }

  return ids;
}

async function resumeableListCollection({ hxPost, baseParams }, progress) {
  if (progress.listDone && Array.isArray(progress.listItems) && progress.listItems.length) {
    return progress;
  }

  progress.listItems = progress.listItems || [];
  progress.listById = progress.listById || {};

  let currentUrl = progress.listNextUrl || hxPost;
  let steps = progress.listSteps || 0;

  while (currentUrl && progress.listItems.length < MAX_ITEMS) {
    steps++;
    const body = buildFormBody(baseParams);

    let listHtml;
    if (currentUrl.includes('listOnly=1')) {
      listHtml = await fetchHtml(currentUrl, {
        headers: {
          'HX-Request': 'true',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
    } else {
      const wrapperHtml = await postHtmx(currentUrl, body);
      listHtml = await resolveListHtmlFromHtmxWrapper(wrapperHtml);
    }

    if (steps === 1 && !progress._wroteDebugList) {
      const debugOut = path.join(DOWNLOADS_DIR, 'khm-gemaelde-list-step1.html');
      fs.writeFileSync(debugOut, listHtml, 'utf8');
      progress._wroteDebugList = true;
    }

    const { items, next } = parseListPage(listHtml);
    if (!items.length) {
      progress.listDone = true;
      progress.listNextUrl = '';
      break;
    }

    for (const it of items) {
      if (progress.listItems.length >= MAX_ITEMS) break;
      if (progress.listById[it.id]) continue;
      progress.listById[it.id] = true;
      progress.listItems.push(it);
    }

    progress.listSteps = steps;
    progress.listNextUrl = next.pageLink || '';

    // Save each page; list URLs can be fragile, so don't risk losing state.
    saveProgress(progress);

    console.log(`📄 list step ${steps}: +${items.length} (total unique: ${progress.listItems.length})`);

    currentUrl = progress.listNextUrl;
    if (SLEEP_LIST_MS) await sleep(SLEEP_LIST_MS);
  }

  if (!progress.listNextUrl) progress.listDone = true;
  saveProgress(progress);
  return progress;
}

async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const results = [];

  async function runOne() {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      const r = await worker(item);
      results.push(r);
    }
  }

  const runners = Array.from({ length: concurrency }, () => runOne());
  await Promise.all(runners);
  return results;
}

function buildPublicCollection(finalRaw, currentlyShownIds) {
  return {
    museum: 'Kunsthistorisches Museum Vienna',
    museumId: 'kunsthistorisches-museum-vienna',
    collectionName: 'KHM Paintings (Gemälde)',
    scrapedAt: new Date().toISOString(),
    totalObjects: finalRaw.length,
    coverImage: finalRaw[0]?.imageUrl || '',
    objects: finalRaw.map((a) => ({
      id: `khm-${a.id}`,
      title: a.title,
      artist: a.creator || a.artist || 'Unknown',
      year: null,
      dateStr: a.date || '',
      medium: a.medium || null,
      dimensions: a.dimensions || null,
      room: null,
      image: a.imageUrl,
      source: a.source,
      url: a.url,
      classification: 'Painting',
      objectType: a.objectType || 'Gemälde',
      culture: a.culture || '',
      period: '',
      inventory: a.inventory || a.id,
      description: a.description || null,
      provenance: null,
      isHighlight: !!a.isHighlight,
      category: a.category || 'Gemälde',
      onView: currentlyShownIds.has(String(a.id)),
      depictionPerson: a.depictionPerson || null
    }))
  };
}

async function main() {
  console.log('🎨 KHM Gemälde (Paintings) - FULL scrape with resume/checkpoints\n');
  console.log('Start URL:', START_URL);
  console.log('Progress file:', PROGRESS_FILE);
  console.log('Raw output:', OUT_RAW);
  console.log('Write public:', WRITE_PUBLIC ? `yes → ${OUT_PUBLIC}` : `no (set WRITE_PUBLIC=1 to write ${OUT_PUBLIC})`);
  console.log('Log hint:', OUT_LOG_HINT);
  console.log('Concurrency:', CONCURRENCY);
  console.log('Checkpoint every:', CHECKPOINT_EVERY);
  console.log('Max items:', Number.isFinite(MAX_ITEMS) ? MAX_ITEMS : '∞');

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  const template = await buildRequestTemplateFromStartPage();
  const { hxPost, baseParams } = template;
  console.log('\nHTMX endpoint:', hxPost);

  let progress = loadProgress();
  if (!progress) {
    progress = {
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hxPost,
      baseParams,
      currentlyShownIds: null,
      listItems: [],
      listById: {},
      listNextUrl: '',
      listSteps: 0,
      listDone: false,
      processedIds: {},
      failures: {},
      artworks: []
    };
    saveProgress(progress);
  }

  // Always keep current hxPost/baseParams from live bootstrap.
  progress.hxPost = hxPost;
  progress.baseParams = baseParams;

  // 1) Collect on-view IDs once (or resume from progress)
  if (!progress.currentlyShownIds) {
    console.log('\n👀 Collecting "currently shown" IDs (onView)...');
    try {
      const shownParams = { ...baseParams, 'fq[facet_is_currently_shown][]': '1' };
      const shown = await collectIdSetFromList({ hxPost, baseParams: shownParams }, { maxSteps: 500, sleepMs: SLEEP_LIST_MS });
      progress.currentlyShownIds = Array.from(shown);
      console.log(`   onView ids collected: ${shown.size}`);
      saveProgress(progress);
    } catch (e) {
      console.log('   ⚠️ onView id collection failed:', e.message);
      progress.currentlyShownIds = [];
      saveProgress(progress);
    }
  } else {
    console.log(`\n👀 onView ids loaded from progress: ${progress.currentlyShownIds.length}`);
  }

  const currentlyShownIds = new Set(progress.currentlyShownIds || []);

  // 2) Collect the full list (resumeable)
  console.log('\n📚 Collecting full list of Gemälde with images (resumeable)...');
  progress = await resumeableListCollection({ hxPost, baseParams }, progress);
  console.log(`✅ List collected: ${progress.listItems.length} unique items`);

  // 3) Scrape details (resumeable)
  console.log('\n🔎 Scraping detail pages (resumeable)...');

  const pending = progress.listItems
    .filter((it) => !progress.processedIds[it.id])
    .slice(0, Number.isFinite(MAX_ITEMS) ? MAX_ITEMS : progress.listItems.length);

  console.log(`Pending details: ${pending.length}`);

  let scrapedSinceCheckpoint = 0;

  await runPool(
    pending,
    async (it) => {
      const id = String(it.id);
      const attempt = (progress.failures[id] || 0) + 1;

      try {
        const d = await scrapeDetail(it);
        if (!d.imageUrl) throw new Error('missing imageUrl');

        progress.artworks.push(d);
        progress.processedIds[id] = true;
        delete progress.failures[id];

        scrapedSinceCheckpoint++;

        const doneCount = Object.keys(progress.processedIds).length;
        if (doneCount % 10 === 0) {
          console.log(`   ✓ details processed: ${doneCount}/${progress.listItems.length}`);
        }

        if (scrapedSinceCheckpoint >= CHECKPOINT_EVERY) {
          scrapedSinceCheckpoint = 0;
          saveProgress(progress);
          console.log(`   💾 checkpoint saved (${progress.artworks.length} artworks)`);
        }

        if (SLEEP_DETAIL_MS) await sleep(SLEEP_DETAIL_MS);
        return true;
      } catch (e) {
        progress.failures[id] = attempt;
        if (attempt >= 3) {
          // Give up after 3 attempts; mark processed so we can finish.
          progress.processedIds[id] = true;
          console.log(`   ⚠️ gave up ${id} after ${attempt} attempts: ${e.message}`);
        } else {
          console.log(`   ⚠️ detail failed ${id} (attempt ${attempt}): ${e.message}`);
        }

        scrapedSinceCheckpoint++;
        if (scrapedSinceCheckpoint >= CHECKPOINT_EVERY) {
          scrapedSinceCheckpoint = 0;
          saveProgress(progress);
          console.log(`   💾 checkpoint saved (${progress.artworks.length} artworks)`);
        }

        if (SLEEP_DETAIL_MS) await sleep(SLEEP_DETAIL_MS);
        return false;
      }
    },
    CONCURRENCY
  );

  saveProgress(progress);

  // 4) Write outputs
  console.log('\n🧾 Writing outputs...');

  // De-dup by id and require imageUrl
  const seen = new Set();
  const finalRaw = [];
  for (const a of progress.artworks) {
    if (!a || !a.id || !a.imageUrl) continue;
    const id = String(a.id);
    if (seen.has(id)) continue;
    seen.add(id);
    finalRaw.push(a);
  }

  fs.writeFileSync(OUT_RAW, JSON.stringify(finalRaw, null, 2), 'utf8');
  console.log('📁 Saved raw:', OUT_RAW, `(count: ${finalRaw.length})`);

  if (WRITE_PUBLIC) {
    const collection = buildPublicCollection(finalRaw, currentlyShownIds);
    fs.writeFileSync(OUT_PUBLIC, JSON.stringify(collection, null, 2), 'utf8');
    console.log('📁 Updated public collection:', OUT_PUBLIC, `(count: ${collection.objects.length})`);
  }

  console.log('\n✅ Done.');
  console.log(`- Raw: ${OUT_RAW}`);
  if (WRITE_PUBLIC) console.log(`- Public: ${OUT_PUBLIC}`);
  console.log(`- Progress: ${PROGRESS_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
