/**
 * Fix Museum Wales Artist Information
 * 
 * Extracts artist names from credit_line in detail pages
 * Pattern: "© Estate of Artist Name" or "© Artist Name"
 * Excludes museum names like "Amgueddfa Cymru", "Museum Wales"
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROGRESS_DIR = path.join(__dirname, '../downloads');
const OUTPUT_DIR = path.join(__dirname, '../public/data');

const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = msg => console.log(`[${timestamp()}] ${msg}`);

// Extract artist name from credit line
function extractArtist(creditLine) {
  if (!creditLine) return '';
  
  // Skip if it's just museum attribution
  const museumPatterns = [
    /by permission of amgueddfa cymru/i,
    /amgueddfa cymru.*museum wales/i,
    /^amgueddfa cymru/i,
    /^museum wales/i,
    /bridgeman images\/amgueddfa/i
  ];
  
  // Check for © pattern
  const copyrightMatch = creditLine.match(/©\s*(.+?)(?:\.|All Rights|\/Bridgeman|$)/i);
  if (copyrightMatch) {
    let artist = copyrightMatch[1].trim();
    
    // Clean up "Estate of" prefix
    artist = artist.replace(/^Estate of\s+/i, '');
    
    // Skip if it's just museum name
    if (/amgueddfa|museum wales/i.test(artist)) return '';
    
    // Clean up extra text
    artist = artist.replace(/\s*All Rights Reserved.*/i, '').trim();
    
    return artist;
  }
  
  return '';
}

async function fetchArtistFromPage(page, sourceUrl) {
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(500);
    
    const creditLine = await page.$eval('.credit_line', el => el.textContent.trim()).catch(() => '');
    return extractArtist(creditLine);
  } catch (e) {
    return '';
  }
}

async function processCollection(collectionId, progressFile, outputFile) {
  log(`Processing ${collectionId}...`);
  
  const progressPath = path.join(PROGRESS_DIR, progressFile);
  if (!fs.existsSync(progressPath)) {
    log(`  ❌ Progress file not found: ${progressFile}`);
    return;
  }
  
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const artworks = progress.artworks || [];
  
  // Count items without artist
  const withoutArtist = artworks.filter(a => !a.artist || a.artist === '');
  log(`  Total: ${artworks.length}, Without artist: ${withoutArtist.length}`);
  
  if (withoutArtist.length === 0) {
    log(`  ✅ All items have artist info`);
    return;
  }
  
  // Sample a few to check if they have credit info
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  let fixed = 0;
  let checked = 0;
  
  for (const artwork of artworks) {
    if (artwork.artist && artwork.artist !== '') continue;
    
    const artist = await fetchArtistFromPage(page, artwork.sourceUrl);
    if (artist) {
      artwork.artist = artist;
      fixed++;
    }
    checked++;
    
    if (checked % 50 === 0) {
      log(`  Progress: ${checked}/${withoutArtist.length} checked, ${fixed} artists found`);
      
      // Save progress
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    }
    
    await delay(300);
  }
  
  await browser.close();
  
  // Save final progress
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  
  log(`  ✅ Done: ${fixed} artists extracted from ${checked} items`);
  
  // Also update output file
  const outputPath = path.join(OUTPUT_DIR, outputFile);
  const outputData = {
    museum: "National Museum Wales",
    museumId: "museum-wales",
    collection: collectionId === 'art' ? "Art Collection" : "Industry Collection",
    collectionId: collectionId,
    location: "Cardiff, Wales, UK",
    type: "permanent",
    scrapedAt: new Date().toISOString(),
    totalArtworks: artworks.length,
    artworksWithCategories: artworks.filter(a => a.categories && a.categories.length > 0).length,
    artworksWithArtist: artworks.filter(a => a.artist && a.artist !== '').length,
    objects: artworks
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  log(`  📁 Output saved to ${outputFile}`);
}

async function main() {
  log('🎨 Museum Wales Artist Extractor');
  
  // Test extraction
  const testCases = [
    '© Estate of Augustus John. All Rights Reserved 2025/Bridgeman Images/Amgueddfa Cymru - Museum Wales',
    '© Kyffin Williams. All Rights Reserved',
    'By permission of Amgueddfa Cymru — Museum Wales',
    '© Estate of David Jones',
    '© Ceri Richards Estate/Bridgeman Images',
  ];
  
  console.log('\n=== Test Extraction ===');
  testCases.forEach(tc => {
    console.log(`  "${tc.substring(0, 50)}..." -> "${extractArtist(tc)}"`);
  });
  
  console.log('\n');
  
  // Process collections
  await processCollection('art', 'museum-wales-art-progress.json', 'museum-wales-art.json');
  // await processCollection('industry', 'museum-wales-industry-progress.json', 'museum-wales-industry.json');
  
  log('✅ All done!');
}

main().catch(console.error);
