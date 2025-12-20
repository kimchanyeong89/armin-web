#!/usr/bin/env node
/**
 * Scrape Tate Britain collection artworks
 * Source: https://www.tate.org.uk/collection?attributes=img&location=211
 * Output: downloads/tate-britain-artworks.json
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
const BASE_URL = 'https://www.tate.org.uk/collection?attributes=img&location=211';
const MAX_PAGES = 50; // Tate Britain has more artworks
const CONCURRENCY = 5;
const OUTPUT_FILE = path.join(__dirname, '../downloads/tate-britain-artworks.json');

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
    
    // Title
    const titleEl = $('h1').first();
    const title = norm(titleEl.text()) || 'Untitled';
    
    // Artist
    let artist = '';
    const artistLink = $('a[href*="/art/artists/"]').first();
    if (artistLink.length) {
      artist = norm(artistLink.text());
    }
    
    // Year - look for date info
    let year = null;
    const dateText = $('p:contains("date")').text() || $('span:contains("date")').text() || '';
    const yearMatch = dateText.match(/(\d{4})/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }
    
    // Also check the artwork page for year in various places
    if (!year) {
      $('p, span, div').each((_, el) => {
        const txt = $(el).text();
        const m = txt.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
        if (m && !year) {
          year = parseInt(m[1], 10);
        }
      });
    }
    
    // Image - get the highest resolution available
    let image = '';
    
    // Look for the main artwork image
    const imgCandidates = [
      $('img[src*="tate.org.uk/art/images/work/"]'),
      $('img[src*="tate.org.uk/sites/default/files/styles/"]'),
      $('img[data-src*="tate.org.uk"]'),
      $('picture source').attr('srcset'),
      $('figure img').first()
    ];
    
    for (const candidate of imgCandidates) {
      if (typeof candidate === 'string' && candidate) {
        image = candidate.split(' ')[0].split(',')[0];
        break;
      }
      if (candidate && candidate.length) {
        const src = candidate.attr('src') || candidate.attr('data-src') || '';
        if (src && src.includes('tate.org.uk')) {
          image = absUrl(src);
          break;
        }
      }
    }
    
    // Try to get a high-res version (size _10)
    if (image) {
      // Convert to highest available resolution
      image = image.replace(/_\d+\.jpg$/i, '_10.jpg');
    }
    
    // Medium
    let medium = '';
    const mediumEl = $('p:contains("Medium"), dt:contains("Medium")').next();
    if (mediumEl.length) {
      medium = norm(mediumEl.text());
    }
    
    // Dimensions
    let dimensions = '';
    const dimEl = $('p:contains("Dimensions"), dt:contains("Dimensions")').next();
    if (dimEl.length) {
      dimensions = norm(dimEl.text());
    }
    
    return {
      id: artwork.accession || artwork.url.split('/').pop(),
      name: title,
      title,
      artist,
      year,
      medium,
      dimensions,
      image,
      sourceUrl: artwork.url,
      accession: artwork.accession
    };
  } catch (e) {
    console.warn('Details failed', artwork.url, e.message);
    return null;
  }
}

async function main() {
  console.log('=== Tate Britain Collection Scraper ===');
  console.log('Source:', BASE_URL);
  
  const seen = new Set();
  const allArtworks = [];
  
  // Phase 1: Collect all artwork URLs from list pages
  console.log('\nPhase 1: Collecting artwork URLs from list pages...');
  
  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = `${BASE_URL}&page=${page}`;
    console.log(`  Page ${page}/${MAX_PAGES}: ${pageUrl}`);
    
    const artworks = await collectListPage(pageUrl, seen);
    if (artworks.length === 0) {
      console.log(`  No more artworks found on page ${page}, stopping.`);
      break;
    }
    
    allArtworks.push(...artworks);
    console.log(`    Found ${artworks.length} artworks (total: ${allArtworks.length})`);
    
    // Be polite
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\nTotal artworks collected: ${allArtworks.length}`);
  
  // Phase 2: Fetch details for each artwork
  console.log('\nPhase 2: Fetching artwork details...');
  
  const limit = pLimit(CONCURRENCY);
  let completed = 0;
  
  const detailedArtworks = await Promise.all(
    allArtworks.map(artwork => limit(async () => {
      const details = await fetchArtworkDetails(artwork);
      completed++;
      if (completed % 10 === 0 || completed === allArtworks.length) {
        console.log(`  Progress: ${completed}/${allArtworks.length}`);
      }
      return details;
    }))
  );
  
  // Filter out nulls
  const validArtworks = detailedArtworks.filter(a => a !== null);
  
  console.log(`\nValid artworks with details: ${validArtworks.length}`);
  
  // Save to JSON
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(validArtworks, null, 2));
  console.log(`\nSaved to: ${OUTPUT_FILE}`);
  
  // Summary
  const withImages = validArtworks.filter(a => a.image).length;
  const withYears = validArtworks.filter(a => a.year).length;
  console.log('\n=== Summary ===');
  console.log(`Total artworks: ${validArtworks.length}`);
  console.log(`With images: ${withImages}`);
  console.log(`With years: ${withYears}`);
}

main().catch(console.error);
