const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const OUT_FILE = 'public/data/nga-collection.json';
const PAINTINGS_FILE = 'public/data/nga-paintings-temp.json';
const DRAWINGS_FILE = 'public/data/nga-drawings-temp.json';
const PRINTS_FILE = 'public/data/nga-prints-temp.json';

const PAINTINGS_CONFIG = {
  CLASSIFICATION: 'Painting',
  IMAGES_ONLY: '1',
  OPEN_ACCESS_ONLY: '0', // Include all paintings (or restricted?) User said "merge painting". The original didn't have OPEN_ACCESS_ONLY set to 1, but maybe I should keep it consistent? Re-read: "make buttons filter visible... open access info...". So keep all data, but mark open access.
  OUT_FILE: PAINTINGS_FILE,
  // Using the original painting URL as metadata
  ORIGINAL_URL: 'https://www.nga.gov/artwork-search?images=1&f[]=awtype:107231'
};

const DRAWINGS_CONFIG = {
  CLASSIFICATION: 'Drawing',
  IMAGES_ONLY: '1',
  OPEN_ACCESS_ONLY: '1',
  OUT_FILE: DRAWINGS_FILE,
  ORIGINAL_URL: 'https://www.nga.gov/artwork-search?download=1&images=1&f[]=awtype:104756',
  EXCLUDE_SUBCLASSIFICATIONS: 'archival,miniature'
};

const PRINTS_CONFIG = {
  CLASSIFICATION: 'Print',
  IMAGES_ONLY: '1',
  OPEN_ACCESS_ONLY: '1', // download=1 from user URL
  MIN_YEAR: '1850',
  MAX_YEAR: '2026',
  OUT_FILE: PRINTS_FILE,
  ORIGINAL_URL: 'https://www.nga.gov/artwork-search?images=1&download=1&begin_year=1850&end_year=2026&f[]=awtype:105956'
};

function runScraper(config) {
  const env = { ...process.env, ...config };
  console.log(`Scraping ${config.CLASSIFICATION}...`);
  // Ensure the python script path is correct
  execSync('python3 scripts/scrape-nga-opendata-awtype-107231.py', { env, stdio: 'inherit' });
}

try {
  // 1. Run Scraper for Paintings
  runScraper(PAINTINGS_CONFIG);

  // 2. Run Scraper for Drawings
  runScraper(DRAWINGS_CONFIG);

  // 3. Run Scraper for Prints
  runScraper(PRINTS_CONFIG);

  // 4. Merge
  console.log('Merging datasets...');
  const paintings = JSON.parse(fs.readFileSync(PAINTINGS_FILE, 'utf8'));
  const drawings = JSON.parse(fs.readFileSync(DRAWINGS_FILE, 'utf8'));
  const prints = JSON.parse(fs.readFileSync(PRINTS_FILE, 'utf8'));

  // Deduplicate Prints
  // Strategy: Keep unique Title+Artist combinations.
  // This collapses multiple states/proofs of the same print into one entry.
  const printMap = new Map();
  for (const item of prints.items) {
      // Use a normalized key
      const key = `${item.title || ''}|${item.artist || ''}`.trim().toLowerCase();
      if (!key || key === '|') {
         // If missing data, keep it (or decide to drop? Better to keep safe)
         printMap.set('unique_' + item.id, item);
      } else {
         if (!printMap.has(key)) {
            printMap.set(key, item);
         }
      }
  }
  
  const uniquePrints = Array.from(printMap.values());
  console.log(`Prints deduplication: ${prints.items.length} -> ${uniquePrints.length} (removed ${prints.items.length - uniquePrints.length} duplicates)`);

  // Merge items
  // Ensure no duplicates if any overlap (unlikely given classification)
  const allItems = [...paintings.items, ...drawings.items, ...uniquePrints];
  
  // Remove duplicates by ID just in case
  const seen = new Set();
  const uniqueItems = [];
  for (const item of allItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      uniqueItems.push(item);
    }
  }

  const merged = {
    generated: new Date().toISOString(),
    total: uniqueItems.length,
    originalUrl: "Mixed: Paintings + Drawings (OpenAccess) + Prints (1850+ OpenAccess)",
    items: uniqueItems
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2));
  console.log(`Successfully merged ${uniqueItems.length} items to ${OUT_FILE}`);

  // Cleanup temp files
  fs.unlinkSync(PAINTINGS_FILE);
  fs.unlinkSync(DRAWINGS_FILE);
  fs.unlinkSync(PRINTS_FILE);

} catch (error) {
  console.error('Error during merge process:', error);
  process.exit(1);
}
