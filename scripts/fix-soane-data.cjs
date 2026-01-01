#!/usr/bin/env node
/**
 * Fix Soane Museum Data
 * 
 * Cleans up title, artist, and year fields:
 * - Remove long descriptions from titles (text after / or newline artifacts)
 * - Clean artist names (remove breadcrumbs, clean up dates)
 * - Standardize year format
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/soane-paintings.json');
const OUTPUT_FILE = INPUT_FILE;

function cleanTitle(title) {
  if (!title) return '';
  
  // Remove newline artifacts and extra whitespace
  let cleaned = title.replace(/\s+/g, ' ').trim();
  
  // For titles with /, take just the first meaningful part
  if (cleaned.includes(' / ')) {
    const parts = cleaned.split(' / ');
    cleaned = parts[0].trim();
  }
  
  // For very long titles (over 80 chars), truncate at sensible break points
  if (cleaned.length > 80) {
    // Try to break at colon, comma, or semicolon
    const breakPoints = [': ', ', ', '; '];
    for (const bp of breakPoints) {
      const idx = cleaned.indexOf(bp);
      if (idx > 20 && idx < 70) {
        cleaned = cleaned.substring(0, idx);
        break;
      }
    }
    
    // If still too long, just truncate
    if (cleaned.length > 80) {
      cleaned = cleaned.substring(0, 77) + '...';
    }
  }
  
  // Remove trailing punctuation
  cleaned = cleaned.replace(/[,;:]$/, '').trim();
  
  // Remove "; or" secondary titles
  if (cleaned.includes('; or ')) {
    cleaned = cleaned.split('; or ')[0].trim();
  }
  
  return cleaned;
}

function cleanArtist(artist) {
  if (!artist) return '';
  
  // Check for breadcrumb text (common error)
  if (artist.includes('You are here:') || artist.includes('CollectionsOnline')) {
    return '';
  }
  
  // Clean up whitespace
  let cleaned = artist.replace(/\s+/g, ' ').trim();
  
  // Extract name and dates: "Henry Howard RA (1769 - 1847)" → "Henry Howard" or keep with dates
  // Remove honorifics like RA, PRA, ARA, FRSA, etc.
  cleaned = cleaned.replace(/\s+(RA|PRA|ARA|FRS|FRSA|FSA|FBA|OBE|CBE)\b/g, '');
  
  // Clean up date format: (1769 - 1847) → (1769-1847)
  cleaned = cleaned.replace(/\(\s*(\d{4})\s*-\s*(\d{4})\s*\)/g, '($1-$2)');
  cleaned = cleaned.replace(/\(\s*(\d{4})\s*–\s*(\d{4})\s*\)/g, '($1-$2)');
  
  // Handle special date formats like "fl. 1760" or "active 1760"
  cleaned = cleaned.replace(/\(\s*fl\.\s*(\d{4})[^)]*\)/gi, '(fl. $1)');
  
  return cleaned;
}

function cleanYear(year) {
  if (!year) return null;
  
  const yearStr = String(year);
  
  // Extract 4-digit year
  const match = yearStr.match(/(\d{4})/);
  if (match) {
    return match[1];
  }
  
  // Handle "c.1820" format
  const circaMatch = yearStr.match(/c\.?\s*(\d{4})/i);
  if (circaMatch) {
    return `c. ${circaMatch[1]}`;
  }
  
  return null;
}

function upgradeImageUrl(imageUrl) {
  if (!imageUrl) return '';
  
  // Replace _soane_fullview with _high for higher resolution
  // v0_soane_fullview.jpg → v0_high.jpg
  return imageUrl.replace('_soane_fullview', '_high');
}

function main() {
  console.log('🏛️ Fixing Soane Museum Data...\n');
  
  // Load data
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const artworks = data.artworks || [];
  
  console.log(`📊 Total artworks: ${artworks.length}`);
  
  let fixedTitles = 0;
  let fixedArtists = 0;
  let fixedYears = 0;
  let upgradedImages = 0;
  let removedNoArtist = 0;
  
  // Process each artwork
  for (const art of artworks) {
    const originalTitle = art.title;
    const originalArtist = art.artist;
    const originalYear = art.year;
    const originalImage = art.image;
    
    // Clean title
    art.title = cleanTitle(art.title);
    if (art.title !== originalTitle) fixedTitles++;
    
    // Clean artist
    art.artist = cleanArtist(art.artist);
    if (art.artist !== originalArtist) fixedArtists++;
    
    // Clean year
    const cleanedYear = cleanYear(art.year);
    if (cleanedYear !== art.year) {
      art.year = cleanedYear;
      fixedYears++;
    }
    
    // Upgrade image URL to high resolution
    art.image = upgradeImageUrl(art.image);
    if (art.image !== originalImage) upgradedImages++;
  }
  
  // Filter out artworks with no artist (likely corrupted entries) - but keep them, just mark
  const validArtworks = artworks.filter(art => art.title && art.image);
  
  console.log(`\n✅ Fixed:`);
  console.log(`   Titles: ${fixedTitles}`);
  console.log(`   Artists: ${fixedArtists}`);
  console.log(`   Years: ${fixedYears}`);
  console.log(`   Images upgraded to _high: ${upgradedImages}`);
  console.log(`   Final count: ${validArtworks.length}`);
  
  // Show samples
  console.log('\n📋 Sample cleaned data:');
  for (let i = 0; i < Math.min(10, validArtworks.length); i++) {
    const art = validArtworks[i];
    console.log(`\n--- ${art.id} ---`);
    console.log(`  title: ${art.title}`);
    console.log(`  artist: ${art.artist || 'Unknown'}`);
    console.log(`  year: ${art.year || '-'}`);
  }
  
  // Update data
  data.artworks = validArtworks;
  data.totalArtworks = validArtworks.length;
  data.fixedAt = new Date().toISOString();
  
  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
  console.log(`\n💾 Saved to ${OUTPUT_FILE}`);
}

main();
