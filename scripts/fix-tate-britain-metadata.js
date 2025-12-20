#!/usr/bin/env node
/**
 * Fix Tate Britain Collection metadata by fetching details from each artwork page
 * Uses same method as tate-st-ives scraper (og:title parsing)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { load as cheerioLoad } from 'cheerio';
import got from 'got';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../public/data/tate-britain-artworks.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/tate-britain-artworks.json');
const CONCURRENCY = 5;

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
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

async function fetchArtworkDetails(artwork) {
  try {
    const html = await fetchHtml(artwork.sourceUrl);
    const $ = cheerioLoad(html);
    
    // Get og:title - format: "'Title', Artist Name, Year | Tate" or "Title, Artist Name, Year | Tate"
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    
    let title = '';
    let artist = '';
    let year = '';
    
    // Parse og:title
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
    
    return {
      ...artwork,
      title: title || artwork.title,
      name: title || artwork.name,
      artist: artist || artwork.artist,
      year: year || artwork.year
    };
  } catch (e) {
    console.warn(`Failed to fetch ${artwork.id}:`, e.message);
    return artwork;
  }
}

async function main() {
  console.log('Loading existing data...');
  const artworks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`Total artworks: ${artworks.length}`);
  
  const limit = pLimit(CONCURRENCY);
  let done = 0;
  
  const updated = await Promise.all(
    artworks.map(artwork => 
      limit(async () => {
        const result = await fetchArtworkDetails(artwork);
        done++;
        if (done % 50 === 0) {
          console.log(`Progress: ${done}/${artworks.length}`);
        }
        return result;
      })
    )
  );
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updated, null, 2));
  console.log(`\nDone! Updated ${updated.length} artworks`);
  
  // Show sample
  console.log('\nSample entries:');
  updated.slice(0, 5).forEach(a => {
    console.log(`  ${a.artist} - ${a.title} (${a.year})`);
  });
}

main().catch(console.error);
