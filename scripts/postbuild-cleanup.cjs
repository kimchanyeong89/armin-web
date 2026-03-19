#!/usr/bin/env node
/**
 * Post-build cleanup: Remove large files from dist
 * These files are served from R2 instead
 */
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// Files to remove (served from R2)
const LARGE_FILES = [
  'atlas/ne_10m_admin_1_states_provinces.geojson',
  'atlas/ne_10m_urban_areas.geojson',
  'geodata/admin1-states-10m.json',
  'geodata/populated-places-10m.json',
  'data/national-museum-korea.json',
  'data/gyeongju-museum.json',
  'data/nga-collection.json',
  'data/aic-collection.json',
  'data/mca-collection.json', // 45MB - too large for Pages
  // 'data/nasjonal-collection.json', // Now 3.7 MB after removing _raw - small enough for Pages
  'data/search-index.json', // 221 MB - too large for Pages
];

let totalSaved = 0;

function scanAndRemoveLargeFiles(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      scanAndRemoveLargeFiles(filePath);
    } else if (stats.size > 24 * 1024 * 1024) { // 24MB limit (safe for 25MB max)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      fs.unlinkSync(filePath);
      console.log(`   ✅ Removed large file: ${path.relative(DIST_DIR, filePath)} (${sizeMB} MB)`);
      totalSaved += stats.size;
    }
  }
}

console.log('🧹 Automatically cleaning large files (>24MB) from dist...\n');
scanAndRemoveLargeFiles(DIST_DIR);

console.log(`\n📊 Total space saved: ${(totalSaved / 1024 / 1024).toFixed(1)} MB`);
