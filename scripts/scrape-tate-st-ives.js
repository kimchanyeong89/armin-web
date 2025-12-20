#!/usr/bin/env node
/**
 * Scrape Tate St Ives collection artworks
 * Source: https://www.tate.org.uk/collection?attributes=img&location=229
 * Output: downloads/tate-st-ives-artworks.json
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
const BASE_URL = 'https://www.tate.org.uk/collection?attributes=img&location=229';
const MAX_PAGES = 10;
const CONCURRENCY = 5;
const OUTPUT_FILE = path.join(__dirname, '../downloads/tate-st-ives-artworks.json');

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
    
    $('a[href*="/art/artworks/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const abs = absUrl(href.split('?')[0]);
      if (!/\/art\/artworks\//i.test(abs)) return;
      
      const id = abs.toLowerCase();
      if (seen.has(id)) return;
      seen.add(id);
      
      // Extract accession number from URL
      const accMatch = abs.match(/artworks\/[^/]+-([a-z]\d+)$/i);
      const accession = accMatch ? accMatch[1].toUpperCase() : '';
      
      out.push({ 
        url: abs, 
        accession
      });
    });
    return out;
  } catch (e) {
    console.warn('List page failed', pageUrl, e.message);
    return [];
  }
}

async function fetchArtworkDetails(artwork) {
  try {
    const html = await fetchHtml(artwork.url);
    const $ = cheerioLoad(html);
    
    // Get og:title - format: "'Title', Artist Name, Year | Tate" or "Title, Artist Name, Year | Tate"
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    
    let title = '';
    let artist = '';
    let year = '';
    
    // Parse og:title
    // Patterns: 
    // 'Title', Artist Name, 1992 | Tate
    // Title, Artist Name, 1992 | Tate
    // "Title", Artist Name, 1992 | Tate
    const ogClean = ogTitle.replace(/\s*\|\s*Tate$/, '').trim();
    
    // Try pattern with quotes first
    let match = ogClean.match(/^[''""](.+?)[''""],\s*(.+?),\s*([\d\-–]+(?:,\s*[\w\s]+)?)\s*$/);
    if (match) {
      title = match[1].trim();
      artist = match[2].trim();
      year = match[3].trim();
    } else {
      // Try without quotes - split by comma, last part is year, second-to-last is artist
      const parts = ogClean.split(/,\s*/);
      if (parts.length >= 3) {
        // Last part should be year
        const lastPart = parts[parts.length - 1];
        if (/\d{4}/.test(lastPart)) {
          year = lastPart.trim();
          artist = parts[parts.length - 2].trim();
          title = parts.slice(0, -2).join(', ').trim();
        } else if (parts.length >= 2) {
          // Maybe year is embedded in artist part
          const yearMatch = parts[parts.length - 1].match(/(\d{4}.*)/);
          if (yearMatch) {
            year = yearMatch[1];
            artist = parts[parts.length - 1].replace(yearMatch[1], '').trim();
            title = parts.slice(0, -1).join(', ').trim();
          } else {
            artist = parts[parts.length - 1].trim();
            title = parts.slice(0, -1).join(', ').trim();
          }
        }
      } else if (parts.length === 2) {
        title = parts[0].trim();
        artist = parts[1].trim();
      } else {
        title = ogClean;
      }
    }
    
    // Fallback: get title from h1
    if (!title) {
      title = norm($('h1').first().text());
    }
    
    // Fallback: get artist from "More by [Artist]" link
    if (!artist) {
      $('a[href*="/art/artists/"]').each((_, el) => {
        const text = norm($(el).text());
        if (text.startsWith('More by ')) {
          artist = text.replace('More by ', '');
          return false;
        }
      });
    }
    
    // Build image URL
    let image = '';
    const accession = artwork.accession;
    if (accession) {
      const prefix = accession.charAt(0);
      const folder = accession.substring(0, 3);
      image = `https://media.tate.org.uk/art/images/work/${prefix}/${folder}/${accession}_10.jpg`;
    }
    
    // Clean up title
    title = title.replace(/^[''""](.+)[''""]$/, '$1').trim();
    
    // Clean up artist (remove honorifics at end like "OM", "RA", "CBE")
    artist = artist.replace(/\s+(OM|RA|CBE|DBE|CH)\s*$/g, '').trim();
    
    return {
      id: `tate-${accession.toLowerCase()}`,
      title: title || 'Untitled',
      artist: artist || 'Unknown Artist',
      year: year || '',
      image: image,
      url: artwork.url,
      accession: accession,
      location: 'Tate St Ives',
      scrapedAt: new Date().toISOString()
    };
  } catch (e) {
    console.warn('Failed to fetch artwork details:', artwork.url, e.message);
    return null;
  }
}

async function main() {
  console.log('Scraping Tate St Ives Collection...');
  
  const seen = new Set();
  let allItems = [];
  
  // Collect from all pages
  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = page === 1 ? BASE_URL : `${BASE_URL}&page=${page}`;
    console.log(`Fetching page ${page}...`);
    const items = await collectListPage(pageUrl, seen);
    if (items.length === 0) {
      console.log(`No more items on page ${page}, stopping.`);
      break;
    }
    allItems = allItems.concat(items);
    console.log(`  Found ${items.length} artworks (total: ${allItems.length})`);
  }
  
  console.log(`\nTotal artworks found: ${allItems.length}`);
  console.log('Fetching artwork details...\n');
  
  // Fetch details with concurrency limit
  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(
    allItems.map((item, i) => 
      limit(async () => {
        const result = await fetchArtworkDetails(item);
        if (result) {
          console.log(`[${i + 1}/${allItems.length}] ${result.title} - ${result.artist} (${result.year})`);
        }
        return result;
      })
    )
  );
  
  const artworks = results.filter(Boolean);
  
  // Save to JSON
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  
  console.log(`\n✓ Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);
}

main().catch(console.error);
