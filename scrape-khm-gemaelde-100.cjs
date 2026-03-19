const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE = 'https://www.khm.at';
const START_URL = 'https://www.khm.at/en/artworks/search?fq%5Bfacet_classification%5D=Gem%C3%A4lde&fq%5Bfacet_has_image%5D%5B0%5D=1&cHash=738b8e81cc3ddb9958b1da50cd95fa40';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
      'Accept': 'text/html,*/*',
      ...opts.headers,
    },
    timeout: opts.timeout || 20000,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return String(res.data);
}

async function postHtmx(url, formBody) {
  const res = await axios.post(url, formBody, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,*/*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'HX-Request': 'true',
    },
    timeout: 20000,
    validateStatus: (s) => s >= 200 && s < 400,
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
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
}

async function buildRequestTemplateFromStartPage() {
  const html = await fetchHtml(START_URL);
  const $ = cheerio.load(html);
  const form = $('#objectdb-form');
  const hxPost = form.attr('hx-post');
  if (!hxPost) throw new Error('Could not find hx-post on #objectdb-form');

  // Base params: include always-present hidden inputs
  const base = {};
  form.find('input[type="hidden"]').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    if (name && value != null && value !== '') base[name] = value;
  });

  // Also include selected filters (checked)
  form.find('input[checked]').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value');
    if (!name) return;
    if (value == null) return;

    // Multiple values: turn into arrays
    if (base[name]) {
      if (Array.isArray(base[name])) base[name].push(value);
      else base[name] = [base[name], value];
    } else {
      base[name] = value;
    }
  });

  // Ensure the two critical filters are present
  if (base['fq[facet_classification]'] !== 'Gemälde') {
    base['fq[facet_classification]'] = 'Gemälde';
  }
  // has_image checkbox uses [] in name
  if (!base['fq[facet_has_image][]']) {
    base['fq[facet_has_image][]'] = '1';
  }

  // Some pages include date range as plain inputs (not hidden)
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
      thumb: imageUrl,
    });
  });

  // Try to discover next-page hx-post URL or page count
  const next = {
    pageLink: '',
    hxPost: '',
  };

  const nextA = (
    $('a[rel="next"], .pagination a[rel="next"], .pagination-next a').first().length
      ? $('a[rel="next"], .pagination a[rel="next"], .pagination-next a').first()
      : $('.pagination a').filter((_, el) => {
          const t = ($(el).text() || '').toLowerCase();
          return t.includes('next') || t.includes('weiter');
        }).first()
  );
  if (nextA && nextA.length) {
    const href = nextA.attr('href');
    if (href) next.pageLink = href.startsWith('http') ? href : BASE + href;
  }

  // Sometimes a "load more" button uses hx-post or hx-get
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

  // Fallback: if the markup doesn't use rel="next", attempt to find a link to the next page
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

async function collectIdsFromList({ hxPost, baseParams }, { maxSteps = 50, sleepMs = 600 } = {}) {
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
          'X-Requested-With': 'XMLHttpRequest',
        },
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

async function scrapeDetail(art) {
  const html = await fetchHtml(art.url, { timeout: 20000 });
  const $ = cheerio.load(html);

  const jsonLd = parseJsonLd($);
  const ld = jsonLd.find(x => x && (x['@type'] || '').toString().toLowerCase().includes('visual')) || jsonLd[0] || {};

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

  // Common keys on KHM pages (German/English variants)
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

  // Highlight detection (best-effort): sometimes presented as a label or metadata field
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
    (ld.creator && ld.creator.name) ? ld.creator.name : '',
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
    sourceUrl: BASE,
  };
}

async function main() {
  console.log('🎨 KHM Gemälde (Paintings) - 100 scrape with full metadata\n');
  console.log('Start URL:', START_URL, '\n');

  const { hxPost, baseParams } = await buildRequestTemplateFromStartPage();
  console.log('HTMX endpoint:', hxPost);

  // Collect on-view ids (KHM calls this "currently shown")
  let currentlyShownIds = new Set();
  try {
    const shownParams = { ...baseParams };
    // checkbox name uses []
    shownParams['fq[facet_is_currently_shown][]'] = '1';
    console.log('\n👀 Collecting "currently shown" IDs (onView)...');
    currentlyShownIds = await collectIdsFromList({ hxPost, baseParams: shownParams }, { maxSteps: 50, sleepMs: 600 });
    console.log(`   onView ids collected: ${currentlyShownIds.size}`);
  } catch (e) {
    console.log('   ⚠️ onView id collection failed:', e.message);
    currentlyShownIds = new Set();
  }

  const results = [];
  const byId = new Map();

  let currentUrl = hxPost;
  let safety = 0;

  while (results.length < 100 && currentUrl && safety < 50) {
    safety++;
    const body = buildFormBody(baseParams);

    console.log(`\n📄 Fetch list page (step ${safety})...`);

    let listHtml;
    try {
      if (currentUrl.includes('listOnly=1')) {
        listHtml = await fetchHtml(currentUrl, {
          headers: {
            'HX-Request': 'true',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
      } else {
        const wrapperHtml = await postHtmx(currentUrl, body);
        listHtml = await resolveListHtmlFromHtmxWrapper(wrapperHtml);
      }
    } catch (e) {
      console.log('   ❌ list fetch failed:', e.message);
      break;
    }

    if (safety === 1) {
      const debugOut = '/Users/kietzsche/armin-web-main/downloads/khm-gemaelde-list-step1.html';
      fs.writeFileSync(debugOut, listHtml, 'utf8');
      console.log('   🧾 saved list HTML for debugging:', debugOut);
    }

    const { items, next } = parseListPage(listHtml);
    console.log(`   items found: ${items.length}`);

    if (items.length === 0) break;

    for (const it of items) {
      if (results.length >= 100) break;
      if (byId.has(it.id)) continue;
      byId.set(it.id, it);
      results.push(it);
    }

    currentUrl = next.pageLink || '';
    await sleep(800);
  }

  console.log(`\n✅ Collected list items: ${results.length}`);

  // Enhance with detail metadata
  const enriched = [];
  for (let i = 0; i < results.length && enriched.length < 100; i++) {
    const it = results[i];
    try {
      const d = await scrapeDetail(it);
      if (!d.imageUrl) continue;
      enriched.push({ ...d, index: enriched.length + 1 });
      console.log(`   ✓ [${enriched.length}/100] ${d.title.substring(0, 60)}...`);
    } catch (e) {
      console.log(`   ⚠️ detail failed ${it.id}: ${e.message}`);
    }
    await sleep(500);
  }

  // Enforce: 100 with images, unique IDs
  const final = [];
  const seen = new Set();
  for (const it of enriched) {
    if (final.length >= 100) break;
    if (!it.imageUrl) continue;
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    final.push({ ...it, index: final.length + 1 });
  }

  console.log(`\n✅ FINAL: ${final.length} paintings with images`);

  const outRaw = '/Users/kietzsche/armin-web-main/downloads/khm-gemaelde-100.json';
  fs.writeFileSync(outRaw, JSON.stringify(final, null, 2), 'utf8');
  console.log('📁 Saved raw:', outRaw);

  // Convert to public/data collection shape used by modal
  const collection = {
    museum: 'Kunsthistorisches Museum Vienna',
    museumId: 'kunsthistorisches-museum-vienna',
    collectionName: 'KHM Paintings (Gemälde)',
    scrapedAt: new Date().toISOString(),
    totalObjects: final.length,
    coverImage: final[0]?.imageUrl || '',
    objects: final.map((a) => ({
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

  const outCollection = '/Users/kietzsche/armin-web-main/public/data/khm-collection.json';
  fs.writeFileSync(outCollection, JSON.stringify(collection, null, 2), 'utf8');
  console.log('📁 Updated modal collection:', outCollection);

  console.log('\n📊 Completeness (first 100):');
  const withObjType = final.filter(x => x.objectType).length;
  const withCat = final.filter(x => x.category).length;
  const withMedium = final.filter(x => x.medium).length;
  const withDim = final.filter(x => x.dimensions).length;
  console.log('   objectType:', withObjType + '/' + final.length);
  console.log('   category:', withCat + '/' + final.length);
  console.log('   medium:', withMedium + '/' + final.length);
  console.log('   dimensions:', withDim + '/' + final.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
