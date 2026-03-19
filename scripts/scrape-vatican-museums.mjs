/**
 * Vatican Museums Masterpieces Scraper
 * Source: https://www.museivaticani.va/content/museivaticani/en/collezioni/capolavori.html
 *
 * Structure:
 * - 17 museum sub-pages, each with ~10-20 masterpieces in <figure class="slide-item"> blocks
 * - Each artwork has: og:image, og:title, og:description, and a metadata <p> block
 * - Metadata paragraph format: "ARTIST TITLE, DATE. MEDIUM, DIMS Cat. NUMBER"
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://www.museivaticani.va';
const OUTPUT_FILE = path.join(__dirname, '../public/data/vatican-collection.json');
const RESUME_FILE = '/tmp/vatican-scrape-resume.json';
const CONCURRENCY = 4;
const DELAY_MS = 400;
const TIMEOUT_MS = 15000;

const SECTION_PAGES = [
  { url: '/content/museivaticani/en/collezioni/capolavori/pinacoteca.html', museum: 'Pinacoteca Vaticana' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-pio-clementino.html', museum: 'Museo Pio-Clementino' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-gregoriano-egizio.html', museum: 'Museo Gregoriano Egizio' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-gregoriano-etrusco.html', museum: 'Museo Gregoriano Etrusco' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-chiaramonti.html', museum: 'Museo Chiaramonti' },
  { url: '/content/museivaticani/en/collezioni/capolavori/braccio-nuovo.html', museum: 'Braccio Nuovo' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-gregoriano-profano.html', museum: 'Museo Gregoriano Profano' },
  { url: '/content/museivaticani/en/collezioni/capolavori/collezione-d_arte-contemporanea.html', museum: 'Collection of Modern Religious Art' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-pio-cristiano.html', museum: 'Museo Pio Cristiano' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-cristiano.html', museum: 'Museo Cristiano' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-profano-.html', museum: 'Museo Profano' },
  { url: '/content/museivaticani/en/collezioni/capolavori/museo-etnologico.html', museum: 'Museo Etnologico' },
  { url: '/content/museivaticani/en/collezioni/capolavori/padiglione-delle-carrozze.html', museum: 'Padiglione delle Carrozze' },
  { url: '/content/museivaticani/en/collezioni/capolavori/galleria-lapidaria.html', museum: 'Galleria Lapidaria' },
  { url: '/content/museivaticani/en/collezioni/capolavori/cortile-della-pinacoteca.html', museum: 'Cortile della Pinacoteca' },
  { url: '/content/museivaticani/en/collezioni/capolavori/sala-delle-nozze-aldobrandine.html', museum: 'Sala delle Nozze Aldobrandine' },
  { url: '/content/museivaticani/en/collezioni/capolavori/cappella-di-san-pietro-martire.html', museum: 'Cappella di San Pietro Martire' },
];

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

async function fetchHtml(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const fullUrl = url.startsWith('http') ? url : BASE_URL + url;
    const res = await fetch(fullUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    clearTimeout(timer);
    if (!res.ok) return { status: res.status, html: '' };
    const html = await res.text();
    return { status: 200, html };
  } catch (err) {
    return { status: 0, html: '', error: err.message };
  }
}

function extractFigures(html, museumName) {
  const figures = [];
  const figurePattern = /<figure\s+class="slide-item[^"]*"[\s\S]*?<\/figure>/gi;
  let match;
  while ((match = figurePattern.exec(html)) !== null) {
    const figHtml = match[0];
    // Extract image href (full size)
    const imgHref = figHtml.match(/href="([^"]*\/content\/dam\/museivaticani[^"]*\.jpeg?)"/i)?.[1];
    // Extract data-src (thumbnail)
    const dataSrc = figHtml.match(/data-src="([^"]+)"/)?.[1];
    // Extract data-link (detail page)
    const dataLink = figHtml.match(/data-link="([^"]+)"/)?.[1];
    // Extract alt text (artist, title)
    const altText = decodeHtmlEntities(figHtml.match(/alt="([^"]+)"/)?.[1] || '');
    // Extract figcaption text
    const captionText = decodeHtmlEntities((figHtml.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    if (imgHref || dataSrc || dataLink) {
      figures.push({
        imageUrl: imgHref ? BASE_URL + imgHref : (dataSrc ? BASE_URL + dataSrc : ''),
        thumbnailUrl: dataSrc ? BASE_URL + dataSrc : '',
        detailUrl: dataLink ? BASE_URL + dataLink : '',
        altText,
        caption: captionText,
        museum: museumName,
      });
    }
  }
  return figures;
}

function parseMetadataParagraph(html, titleFromOg) {
  // Find all paragraphs and look for the one with artwork metadata
  const paras = [];
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pPattern.exec(html)) !== null) {
    const text = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (text.length > 10 && text.length < 500) paras.push(text);
  }
  
  // Find the metadata paragraph that contains catalog/dimension info
  const metaPara = paras.find(p => 
    /\bCat\.\s*\d+\b/.test(p) || 
    /\d+\s*x\s*\d+\s*cm\b/i.test(p) ||
    (/tempera|oil|fresco|marble|bronze|mosaic|canvas|panel|wood/i.test(p) && p.length < 200)
  );
  
  if (!metaPara) return {};
  
  // Format: "ARTIST TITLE, DATE. MEDIUM, DIMS Cat. NUMBER"
  // Or: "TITLE, DATE. MEDIUM, DIMS Cat. NUMBER" (with artist in ogTitle)
  let artist = '', title = '', date = '', medium = '', dimensions = '', catalogNumber = '';
  
  // Extract catalog number
  const catMatch = metaPara.match(/Cat\.\s*(\d+)/);
  if (catMatch) catalogNumber = catMatch[1];
  
  // Extract dimensions
  const dimMatch = metaPara.match(/(\d+[\d.,]*\s*[x×]\s*\d+[\d.,]*\s*(?:x\s*\d+[\d.,]*)?\s*cm)/i);
  if (dimMatch) dimensions = dimMatch[1].trim();
  
  // Split at first period to get date+medium
  const dotIdx = metaPara.indexOf('.');
  let beforeDot = metaPara.substring(0, dotIdx > 0 ? dotIdx : metaPara.length);
  let afterDot = dotIdx > 0 ? metaPara.substring(dotIdx + 1) : '';
  
  // Extract date from beforeDot (it usually ends with the date after a comma)
  // Format: "ARTIST TITLE, DATE"
  const commaIdx = beforeDot.lastIndexOf(',');
  if (commaIdx > 0) {
    const potentialDate = beforeDot.substring(commaIdx + 1).trim();
    const artistTitle = beforeDot.substring(0, commaIdx).trim();
    // Check if the part after comma looks like a date
    if (/\d{3,4}|century|cent\.|antique|B\.C\.|A\.D\.|first|second|third|half/i.test(potentialDate)) {
      date = potentialDate;
      // Now artistTitle has "ARTIST TITLE" merged, try to split using ogTitle
      if (titleFromOg) {
        // ogTitle is "ARTIST, TITLE"
        const ogCommaIdx = titleFromOg.indexOf(',');
        if (ogCommaIdx > 0) {
          artist = titleFromOg.substring(0, ogCommaIdx).trim();
          title = titleFromOg.substring(ogCommaIdx + 1).trim();
        } else {
          title = titleFromOg;
        }
      } else {
        title = artistTitle;
      }
    } else {
      // No date in standard position
      if (titleFromOg) {
        const ogCommaIdx = titleFromOg.indexOf(',');
        if (ogCommaIdx > 0) {
          artist = titleFromOg.substring(0, ogCommaIdx).trim();
          title = titleFromOg.substring(ogCommaIdx + 1).trim();
        } else {
          title = titleFromOg;
        }
      } else {
        title = beforeDot;
      }
    }
  } else {
    if (titleFromOg) {
      const ogCommaIdx = titleFromOg.indexOf(',');
      if (ogCommaIdx > 0) {
        artist = titleFromOg.substring(0, ogCommaIdx).trim();
        title = titleFromOg.substring(ogCommaIdx + 1).trim();
      } else {
        title = titleFromOg;
      }
    } else {
      title = beforeDot;
    }
  }
  
  // Extract medium from afterDot (before dimensions and Cat.)
  if (afterDot) {
    let mediumPart = afterDot
      .replace(/Cat\.\s*\d+.*$/, '')
      .replace(/\d+[\d.,]*\s*[x×]\s*\d+[\d.,]*\s*cm.*/i, '')
      .trim()
      .replace(/,\s*$/, '')
      .trim();
    medium = mediumPart;
  }
  
  return { artist, title: title || titleFromOg || '', date, medium, dimensions, catalogNumber };
}

async function enrichItem(item) {
  if (!item.detailUrl) {
    // Use alt text for basic info
    const altCommaIdx = item.altText.indexOf(',');
    const artist = altCommaIdx > 0 ? item.altText.substring(0, altCommaIdx).trim() : '';
    const title = altCommaIdx > 0 ? item.altText.substring(altCommaIdx + 1).trim() : item.altText;
    return { ...item, artist, title };
  }
  
  const { html } = await fetchHtml(item.detailUrl);
  if (!html) return { ...item, title: item.altText };
  
  const ogTitleRaw = html.match(/property="og:title" content="([^"]+)"/)?.[1] || '';
  const ogTitle = decodeHtmlEntities(ogTitleRaw);
  const ogDesc = decodeHtmlEntities(html.match(/property="og:description" content="([^"]+)"/)?.[1] || '');
  const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1] || item.imageUrl || '';
  
  const parsed = parseMetadataParagraph(html, ogTitle);
  
  return {
    ...item,
    title: parsed.title || ogTitle || item.altText,
    artist: parsed.artist || '',
    date: parsed.date || '',
    medium: parsed.medium || '',
    dimensions: parsed.dimensions || '',
    catalogNumber: parsed.catalogNumber || '',
    description: ogDesc,
    imageUrl: ogImage || item.imageUrl,
  };
}

async function processInBatches(items, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(item => enrichItem(item)));
    results.push(...batchResults);
    log(`  Enriched ${Math.min(i + concurrency, items.length)}/${items.length}`);
    if (i + concurrency < items.length) await delay(DELAY_MS);
  }
  return results;
}

async function main() {
  log('Vatican Museums Masterpieces scraper starting...');
  log(`Sections: ${SECTION_PAGES.length}`);
  
  // Load resume state
  let processed = {};
  if (existsSync(RESUME_FILE)) {
    processed = JSON.parse(readFileSync(RESUME_FILE, 'utf8'));
    log(`Resuming: ${Object.keys(processed).length} sections already done`);
  }
  
  const allFigures = [];
  
  // Phase 1: collect all figures from section pages
  for (const section of SECTION_PAGES) {
    if (processed[section.url]) {
      allFigures.push(...processed[section.url]);
      continue;
    }
    
    log(`Fetching section: ${section.museum}`);
    const { html } = await fetchHtml(section.url);
    if (!html) {
      log(`  FAILED: ${section.url}`);
      continue;
    }
    
    const figures = extractFigures(html, section.museum);
    log(`  Found ${figures.length} artworks`);
    processed[section.url] = figures;
    allFigures.push(...figures);
    
    writeFileSync(RESUME_FILE, JSON.stringify(processed, null, 2));
    await delay(DELAY_MS);
  }
  
  log(`Total artworks found: ${allFigures.length}`);
  
  // Deduplicate by detailUrl
  const seen = new Set();
  const unique = allFigures.filter(f => {
    const key = f.detailUrl || f.imageUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  log(`After dedup: ${unique.length}`);
  
  // Phase 2: Enrich each artwork with detail page data
  log('Enriching with detail page metadata...');
  const enriched = await processInBatches(unique, CONCURRENCY);
  
  // Build final collection
  const collection = enriched
    .filter(item => item.imageUrl || item.title)
    .map((item, idx) => ({
      id: `vatican-${String(idx + 1).padStart(4, '0')}`,
      title: item.title || 'Untitled',
      artist: item.artist || '',
      date: item.date || '',
      medium: item.medium || '',
      dimensions: item.dimensions || '',
      catalogNumber: item.catalogNumber || '',
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      thumbnailUrl: item.thumbnailUrl || '',
      sourceUrl: item.detailUrl || '',
      museum: item.museum || 'Vatican Museums',
      type: '2D',
    }));
  
  log(`Final collection: ${collection.length} items`);
  log('Sample items:');
  collection.slice(0, 3).forEach(c => log(`  ${c.title} | ${c.artist} | ${c.date}`));
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2), 'utf8');
  log(`Saved to ${OUTPUT_FILE}`);
  log('DONE.');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
