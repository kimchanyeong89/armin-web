#!/usr/bin/env node
/**
 * Merge museum-wales-extended-new.json into museum-wales-paintings.json
 * - Deduplicates by item `id` (UUID)  
 * - Prints stats before/after
 */

const fs = require('fs');
const path = require('path');

const EXISTING_FILE = path.join(__dirname, '../public/data/museum-wales-paintings.json');
const NEW_FILE      = path.join(__dirname, '../public/data/museum-wales-extended-new.json');
const BACKUP_FILE   = path.join(__dirname, '../public/data/museum-wales-paintings.backup.json');

if (!fs.existsSync(NEW_FILE)) {
  console.error('ERROR: museum-wales-extended-new.json not found. Run scrape-wales-extended.cjs first.');
  process.exit(1);
}

const existing = JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf8'));
const extended = JSON.parse(fs.readFileSync(NEW_FILE, 'utf8'));

const existingObjects = existing.objects || [];
const newObjects      = extended.objects || [];

console.log('Existing items:', existingObjects.length);
console.log('New (extended) items:', newObjects.length);

const existingIds = new Set(existingObjects.map(o => o.id));
const uniqueNew   = newObjects.filter(o => !existingIds.has(o.id));
const duplicates  = newObjects.length - uniqueNew.length;

console.log('Duplicates removed:', duplicates);
console.log('Net new items to add:', uniqueNew.length);

// Category breakdown of new items
const catCounts = {};
uniqueNew.forEach(item => {
  (item.categories || []).forEach(c => {
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
});
console.log('\nCategory breakdown of new items:');
Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => {
  console.log(`  ${k}: ${v}`);
});

// Metadata quality of new items
const withArtist = uniqueNew.filter(o => o.artist && o.artist !== 'Unknown').length;
const withMedium = uniqueNew.filter(o => o.medium).length;
const withDims   = uniqueNew.filter(o => o.dimensions).length;
const withImage  = uniqueNew.filter(o => o.image).length;
console.log(`\nNew items metadata quality:`);
console.log(`  artist: ${withArtist}/${uniqueNew.length}`);
console.log(`  medium: ${withMedium}/${uniqueNew.length}`);
console.log(`  dimensions: ${withDims}/${uniqueNew.length}`);
console.log(`  image: ${withImage}/${uniqueNew.length}`);

if (uniqueNew.length === 0) {
  console.log('\nNothing to merge. Exiting.');
  process.exit(0);
}

// Backup original
fs.copyFileSync(EXISTING_FILE, BACKUP_FILE);
console.log('\nBackup saved to museum-wales-paintings.backup.json');

// Merge
const merged = [...existingObjects, ...uniqueNew];
existing.objects = merged;
existing.totalArtworks = merged.length;
existing.lastUpdated = new Date().toISOString();

fs.writeFileSync(EXISTING_FILE, JSON.stringify(existing, null, 2));
console.log(`\nMerge complete: ${existingObjects.length} + ${uniqueNew.length} = ${merged.length} total items`);
console.log(`Written to ${EXISTING_FILE}`);
