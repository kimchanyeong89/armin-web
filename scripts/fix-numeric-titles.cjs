#!/usr/bin/env node
/**
 * Fix numeric titles in collections by re-scraping detail pages
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// All collection files to check
const COLLECTION_FILES = [
  'versailles-collection.json',
  'musee-guimet-collection.json',
  'musee-conde-drawings.json',
  'petit-palais-drawings.json',
  'carnavalet-paintings.json',
  'carnavalet-prints.json',
  'macval-collection.json'
];

const DATA_DIR = path.join(__dirname, '../public/data');

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getTitleFromDetailPage(page, sourceUrl) {
  if (!sourceUrl) return null;
  
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(800);
    
    const title = await page.evaluate(() => {
      // Try second h1 (first is empty logo, second is title)
      const h1s = document.querySelectorAll('h1');
      for (const h1 of h1s) {
        const text = h1.textContent?.trim();
        if (text && text.length > 0) {
          return text;
        }
      }
      
      // Fallback: try "Series title" previewmeta
      const previewMetas = document.querySelectorAll('.previewmeta');
      for (const meta of previewMetas) {
        const legend = meta.querySelector('.previewmeta-legend')?.textContent?.toLowerCase() || '';
        if (legend.includes('series title') || legend.includes('titre')) {
          const value = meta.querySelector('.previewmeta-content')?.textContent?.trim();
          if (value) return value;
        }
      }
      
      return null;
    });
    
    return title;
  } catch (e) {
    return null;
  }
}

async function fixCollection(browser, filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📖 Processing ${fileName}...`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️ File not found, skipping`);
    return 0;
  }
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const objects = data.objects || data.artworks || [];
  
  // Find items with numeric-only titles
  const numericItems = objects.filter(obj => /^\d+$/.test(obj.title));
  console.log(`   🔍 Found ${numericItems.length} items with numeric titles`);
  
  if (numericItems.length === 0) {
    return 0;
  }
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  // Use multiple pages for parallel scraping
  const PARALLEL = 5;
  const pages = await Promise.all(Array.from({ length: PARALLEL }, () => context.newPage()));
  
  let fixed = 0;
  
  for (let i = 0; i < numericItems.length; i += PARALLEL) {
    const batch = numericItems.slice(i, i + PARALLEL);
    
    await Promise.all(batch.map(async (item, idx) => {
      const page = pages[idx];
      const newTitle = await getTitleFromDetailPage(page, item.sourceUrl);
      
      if (newTitle && newTitle !== item.title) {
        console.log(`   ✓ ${item.title} → ${newTitle}`);
        item.title = newTitle;
        fixed++;
      }
    }));
    
    console.log(`   Progress: ${Math.min(i + PARALLEL, numericItems.length)}/${numericItems.length}`);
    await delay(200);
  }
  
  await Promise.all(pages.map(p => p.close()));
  await context.close();
  
  // Save updated data
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`   ✅ Fixed ${fixed}/${numericItems.length} titles`);
  
  return fixed;
}

async function main() {
  console.log('🔧 Fixing numeric titles in all collections...\n');
  
  const browser = await chromium.launch({ headless: true });
  let totalFixed = 0;
  
  for (const file of COLLECTION_FILES) {
    const filePath = path.join(DATA_DIR, file);
    const fixed = await fixCollection(browser, filePath);
    totalFixed += fixed;
  }
  
  await browser.close();
  console.log(`\n🎉 Total fixed: ${totalFixed} titles across all collections`);
}

main().catch(console.error);
