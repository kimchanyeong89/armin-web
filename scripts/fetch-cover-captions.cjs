/**
 * Fetch cover image captions from Tate room pages and update JSON
 * Extracts: artist, title, year from caption like "Artist Name, Title Year. Source."
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(__dirname, '../public/data/tate-britain.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCaption(caption) {
  // Example: "Joseph Mallord William Turner, Self-Portrait c.1799. Tate."
  // Format: Artist, Title Year. Source.
  // Special case: "Unknown artist, Britain, The Cholmondeley Ladies c.1600–10. Tate."
  
  if (!caption) return null;
  
  // Clean up HTML entities
  caption = caption.replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
  caption = caption.replace(/&copy;/g, '©').replace(/&amp;/g, '&');
  caption = caption.replace(/\s+/g, ' ').trim();
  
  // Remove copyright notices like "© ... 2020" or "All Rights Reserved 2023"
  caption = caption.replace(/©[^\.]+\./g, '');
  caption = caption.replace(/All Rights Reserved[^\.]+\./gi, '');
  
  // Handle "Unknown artist, Britain" or "Unknown artist, England" as a single artist field
  let artist = '';
  let rest = '';
  
  // Check for "Unknown artist, Britain/England/Scotland/Ireland" pattern
  const unknownMatch = caption.match(/^(Unknown artist,\s*(Britain|England|Scotland|Ireland|British School))\s*,\s*/i);
  if (unknownMatch) {
    artist = unknownMatch[1];
    rest = caption.substring(unknownMatch[0].length);
  } else {
    const commaIdx = caption.indexOf(',');
    if (commaIdx === -1) return null;
    artist = caption.substring(0, commaIdx).trim();
    rest = caption.substring(commaIdx + 1).trim();
  }
  
  // Remove honorifics at start of title like "Bt", "CH", "OM" 
  rest = rest.replace(/^(Bt,?\s*|CH,?\s*|OM,?\s*)+/i, '');
  
  // Remove source like ". Tate." or ". Tate Archive." or "Lent by..." at end
  rest = rest.replace(/\.\s*(Tate|Lent by)[^\.]*\.?\s*$/i, '');
  // Also handle case where Tate is directly after year without space
  rest = rest.replace(/(\d{4})(?:–\d+)?Tate.*$/i, '$1');
  
  // Extract year - find FIRST 4-digit year (artwork creation year, not print year)
  // Look for patterns like: c.1799, 1888, exhibited 1842, 1910, 1931–1933, [c.1943]
  const yearMatch = rest.match(/\[?c?\.?\s*(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  
  // Extract title - everything before the year notation
  let title = rest;
  // Remove year pattern and everything after (including brackets)
  title = title.replace(/\s*\[?c?\.?\s*\d{4}.*$/, '');
  // Remove "exhibited" word
  title = title.replace(/\s+exhibited\s*$/i, '');
  // Remove trailing period
  title = title.replace(/\.\s*$/, '');
  // Remove square brackets
  title = title.replace(/\s*[\[\]]?\s*$/, '');
  // Remove trailing question mark
  title = title.replace(/\s*\?\s*$/, '');
  title = title.trim();
  
  return { artist, title, year };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const displays = data.items.filter(i => i.id.startsWith('tate-britain-display-'));
  
  let updated = 0;
  
  for (const display of displays) {
    console.log(`\n=== ${display.name} ===`);
    
    if (!display.rooms || display.rooms.length === 0) {
      console.log('  No rooms');
      continue;
    }
    
    for (let i = 0; i < display.rooms.length; i++) {
      const room = display.rooms[i];
      if (!room.url) {
        console.log(`  Room ${i + 1}: No URL`);
        continue;
      }
      
      console.log(`  Room ${i + 1}: ${room.name}`);
      
      try {
        const html = await fetch(room.url);
        
        // Extract caption from splash-header__image-caption
        const match = html.match(/class="splash-header__image-caption"[^>]*>([\s\S]*?)<\/div>/i);
        if (match) {
          // Clean HTML tags
          const caption = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          console.log(`    Caption: ${caption}`);
          
          const parsed = parseCaption(caption);
          if (parsed) {
            room.coverArtist = parsed.artist;
            room.coverTitle = parsed.title;
            room.coverYear = parsed.year;
            console.log(`    -> ${parsed.artist} | ${parsed.title} | ${parsed.year}`);
            updated++;
          }
        } else {
          console.log('    No caption found');
        }
        
        // Small delay to be nice to server
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`    Error: ${e.message}`);
      }
    }
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`\n\nUpdated ${updated} room cover captions`);
}

main().catch(console.error);
