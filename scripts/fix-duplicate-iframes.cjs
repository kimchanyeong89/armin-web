/**
 * Fix duplicate iframes in all Tate JSON files
 */
const fs = require('fs');
const path = require('path');

const jsonFiles = [
  'tate-modern.json',
  'tate-britain.json',
  'tate-liverpool.json',
  'tate-st-ives.json'
];

console.log('Fixing duplicate iframes in descriptionHtml...\n');

let totalFixed = 0;

for (const jsonFile of jsonFiles) {
  const jsonPath = path.join(__dirname, '..', 'public', 'data', jsonFile);
  
  if (!fs.existsSync(jsonPath)) {
    console.log(`Skipping ${jsonFile} (not found)`);
    continue;
  }
  
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  let fixed = 0;

  for (const item of data.items) {
  if (!item.descriptionHtml) continue;
  
  const original = item.descriptionHtml;
  
  // Find all iframes and keep only unique ones
  // Match both self-closing and regular iframes
  const iframeRegex = /<iframe[^>]*src="([^"]*)"[^>]*(?:\/>|><\/iframe>|>)/gi;
  const seenSrcs = new Set();
  
  item.descriptionHtml = original.replace(iframeRegex, (match, src) => {
    // Remove empty src iframes
    if (!src || src === '') {
      console.log(`  Removing empty iframe from "${item.title}"`);
      return '';
    }
    
    // Normalize the src (remove amp; entities)
    const normalizedSrc = src.replace(/&amp;/g, '&');
    if (seenSrcs.has(normalizedSrc)) {
      console.log(`  Removing duplicate iframe from "${item.title}"`);
      return ''; // Remove duplicate
    }
    seenSrcs.add(normalizedSrc);
    return match;
  });
  
  if (original !== item.descriptionHtml) {
    fixed++;
  }
}

  if (fixed > 0) {
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`  Fixed ${fixed} items in ${jsonFile}`);
    totalFixed += fixed;
  } else {
    console.log(`  No duplicates in ${jsonFile}`);
  }
}

console.log(`\n=== Total fixed: ${totalFixed} items ===`);
