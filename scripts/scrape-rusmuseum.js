import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, '../public/data/rusmuseum-collection.json');
const BASE_URL = 'https://rusmuseumvrm.ru';

// Sections to scrape: painting, iconography, old Russian art, drawings
// For each section we only want the curated "Masterpieces" list that
// appears on slide-2 of the collection page (using `t=1` and `mpage`),
// not the full online collection list (`t=0` with `page`).
const COLLECTION_SECTIONS = [
  { slug: 'painting', label: 'Painting' },
  { slug: 'iconography', label: 'Iconography' },
  { slug: 'old_russian_art', label: 'Old Russian Art' },
  { slug: 'drawings', label: 'Drawings' }
];

// Concurrency limit for detail-page fetches
const limit = pLimit(10);

async function fetchDetails(item) {
  if (!item.url) return item;

  try {
    const response = await axios.get(item.url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const medium = $('.work__info1 li:first-child span[title="Материал"]').text().trim();
    const dimensions = $('.work__info1 li:first-child span[title="Размер"]').text().trim();

    if (medium) item.medium = medium;
    if (dimensions) item.dimensions = dimensions;

    // Try to capture a higher-resolution image from the detail page.
    // The main viewer uses RoyalSlider with <img class="rsImg" src="...mainfoto_0X.jpg">.
    // Use that src as originalImage so the frontend lightbox can prefer it.
    const mainImg = $('img.rsImg').first();
    const hiSrc = mainImg.attr('src');
    if (hiSrc) {
      let fullHi = '';
      if (hiSrc.startsWith('http')) fullHi = hiSrc;
      else if (hiSrc.startsWith('/')) fullHi = BASE_URL + hiSrc;
      else fullHi = BASE_URL + '/' + hiSrc;
      item.originalImage = fullHi;
    }

    return item;
  } catch (error) {
    console.warn(`Failed to fetch details for ${item.id}: ${error.message}`);
    return item;
  }
}

async function scrapeSection(sectionSlug, sectionLabel) {
  const ps = 500; // one page is enough for all "Masterpieces" sets

  console.log(`Starting scrape of Russian Museum section: ${sectionLabel} (${sectionSlug})...`);

  // Use t=1 to select the "Masterpieces" tab and mpage=1, ps=500 so that
  // the entire curated set fits on a single page. The HTML for these
  // pages contains two .works-list blocks; the second one (index 1)
  // holds the Masterpieces entries, while the first is empty when
  // t=1 is used.
  const listUrl = `${BASE_URL}/collections/${sectionSlug}/index.php?lang=en&show=asc&p=0&t=1&mpage=1&ps=${ps}#slide-2`;
  console.log(`  Fetching masterworks list (${listUrl})...`);

  try {
    const response = await axios.get(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const pageItems = [];

    const masterList = $('.works-list').eq(1).length ? $('.works-list').eq(1) : $('.works-list').eq(0);

    masterList.find('.works__item').each((i, el) => {
      const $el = $(el);

      const $aArea = $el.find('.item__inner .a_area a');
      const href = $aArea.attr('href');
      let fullUrl = '';
      if (href) {
        if (href.startsWith('http')) fullUrl = href;
        else if (href.startsWith('/')) fullUrl = BASE_URL + href;
        else fullUrl = BASE_URL + '/' + href;
      }

      const $img = $el.find('.item__inner .a_area .item__img img');
      const src = $img.attr('src');
      let fullImage = '';
      if (src) {
        if (src.startsWith('http')) fullImage = src;
        else if (src.startsWith('/')) fullImage = BASE_URL + src;
        else fullImage = BASE_URL + '/' + src;
      }

      const title = $el.find('.item__inner .item__info .item__title').text().trim();
      const date = $el.find('.item__inner .item__info .item__desc').text().trim();
      const artist = $el.find('.item__inner .item__info .item__author').text().trim() || 'Unknown';

      let id = '';
      if (href) {
        const parts = href.split('/');
        const indexPhpIdx = parts.indexOf('index.php');
        if (indexPhpIdx > 0) {
          id = parts[indexPhpIdx - 1];
        } else {
          id = Math.random().toString(36).substring(7);
        }
      } else {
        id = Math.random().toString(36).substring(7);
      }

      if (title && fullImage) {
        pageItems.push({
          id,
          title,
          artist,
          date,
          image: fullImage,
          url: fullUrl,
          collection: 'Russian Museum',
          section: sectionLabel
        });
      }
    });

    console.log(`  Found ${pageItems.length} masterworks in section ${sectionLabel}. Fetching details...`);

    const detailedItems = await Promise.all(
      pageItems.map(item => limit(() => fetchDetails(item)))
    );

    console.log(`Finished section ${sectionLabel}. Items scraped: ${detailedItems.length}`);
    return detailedItems;
  } catch (error) {
    console.error('  Error listing masterworks for section', sectionSlug, error.message || error);
    return [];
  }
}

async function scrapeAllPaintings(existingIds) {
  const ps = 500; // show all items on a single page

  console.log('Starting scrape of full Painting collection (all works)...');

  const listUrl = `${BASE_URL}/collections/painting/index.php?lang=en&show=asc&p=0&t=0&ps=${ps}&page=1#slide-1`;
  console.log(`  Fetching full painting list (${listUrl})...`);

  try {
    const response = await axios.get(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const lists = $('.works-list');
    let bestList = null;
    let maxCount = 0;

    lists.each((i, el) => {
      const count = $(el).find('.works__item').length;
      if (count > maxCount) {
        maxCount = count;
        bestList = $(el);
      }
    });

    if (!bestList || maxCount === 0) {
      console.warn('  No painting works found in full collection view.');
      return [];
    }

    console.log(`  Found ${maxCount} works in full painting collection view before filtering duplicates.`);

    const pageItems = [];

    bestList.find('.works__item').each((i, el) => {
      const $el = $(el);

      const $aArea = $el.find('.item__inner .a_area a');
      const href = $aArea.attr('href');
      let fullUrl = '';
      if (href) {
        if (href.startsWith('http')) fullUrl = href;
        else if (href.startsWith('/')) fullUrl = BASE_URL + href;
        else fullUrl = BASE_URL + '/' + href;
      }

      const $img = $el.find('.item__inner .a_area .item__img img');
      const src = $img.attr('src');
      let fullImage = '';
      if (src) {
        if (src.startsWith('http')) fullImage = src;
        else if (src.startsWith('/')) fullImage = BASE_URL + src;
        else fullImage = BASE_URL + '/' + src;
      }

      const title = $el.find('.item__inner .item__info .item__title').text().trim();
      const date = $el.find('.item__inner .item__info .item__desc').text().trim();
      const artist = $el.find('.item__inner .item__info .item__author').text().trim() || 'Unknown';

      let id = '';
      if (href) {
        const parts = href.split('/');
        const indexPhpIdx = parts.indexOf('index.php');
        if (indexPhpIdx > 0) {
          id = parts[indexPhpIdx - 1];
        } else {
          id = Math.random().toString(36).substring(7);
        }
      } else {
        id = Math.random().toString(36).substring(7);
      }

      // Skip artworks that are already present (e.g. Painting Masterpieces)
      if (existingIds.has(id)) {
        return;
      }

      if (title && fullImage) {
        pageItems.push({
          id,
          title,
          artist,
          date,
          image: fullImage,
          url: fullUrl,
          collection: 'Russian Museum',
          section: 'Painting'
        });
      }
    });

    console.log(`  After filtering duplicates, new painting works to add: ${pageItems.length}`);

    const detailedItems = await Promise.all(
      pageItems.map(item => limit(() => fetchDetails(item)))
    );

    console.log(`Finished full Painting collection. New items scraped: ${detailedItems.length}`);
    return detailedItems;
  } catch (error) {
    console.error('  Error listing full painting collection', error.message || error);
    return [];
  }
}

async function scrape() {
  const allItems = [];
  const seenIds = new Set();

  // First, scrape the four Masterpieces sections
  for (const section of COLLECTION_SECTIONS) {
    const items = await scrapeSection(section.slug, section.label);
    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
      }
    }
  }

  console.log(`Total unique items after Masterpieces sections: ${allItems.length}`);

  // Then, add the rest of the Painting collection (t=0, all works),
  // skipping any artworks whose IDs we already have.
  const extraPaintings = await scrapeAllPaintings(seenIds);
  for (const item of extraPaintings) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      allItems.push(item);
    }
  }

  console.log(`Final total unique Russian Museum items (Masterpieces + full Painting): ${allItems.length}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

scrape();
