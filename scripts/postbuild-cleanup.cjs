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
];

console.log('🧹 Cleaning large files from dist (served from R2)...\n');

let totalSaved = 0;

for (const file of LARGE_FILES) {
  const filePath = path.join(DIST_DIR, file);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    
    fs.unlinkSync(filePath);
    console.log(`   ✅ Removed: ${file} (${sizeMB} MB)`);
    totalSaved += stats.size;
  } else {
    console.log(`   ⏭️  Not found: ${file}`);
  }
}

console.log(`\n📊 Total space saved: ${(totalSaved / 1024 / 1024).toFixed(1)} MB`);
