/**
 * Reina Sofia Data Post-Processor
 * 
 * Fix room field parsing issue where technique got concatenated to room name
 * Example: "Room 001.04TechniqueGelatin" → "Room 001.04"
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../public/data/reina-sofia-collection.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/reina-sofia-collection-clean.json');

console.log('═══════════════════════════════════════════════════════════');
console.log('  🧹 Reina Sofía Data Post-Processor');
console.log('═══════════════════════════════════════════════════════════');

// Load data
const artworks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
console.log(`\n📂 Loaded ${artworks.length} artworks`);

let fixedRoomCount = 0;
let fixedTechniqueCount = 0;

for (const artwork of artworks) {
  // Fix room field - extract room number and separate technique if mixed
  if (artwork.room) {
    // Pattern: "Room XXX.YYTechnique..." or similar
    const roomMatch = artwork.room.match(/^(Room\s*[\d.]+)/i);
    if (roomMatch) {
      const cleanRoom = roomMatch[1];
      
      // Check if technique was concatenated
      const techniqueMatch = artwork.room.match(/Technique(.+)$/);
      if (techniqueMatch && !artwork.technique) {
        artwork.technique = techniqueMatch[1].trim();
        fixedTechniqueCount++;
      }
      
      if (artwork.room !== cleanRoom) {
        artwork.room = cleanRoom;
        fixedRoomCount++;
      }
    }
  }
  
  // Clean up technique if it has extra info
  if (artwork.technique) {
    // Remove any stray text after newlines or weird patterns
    artwork.technique = artwork.technique.split('\n')[0].trim();
    
    // Remove dimensions if mixed in technique
    artwork.technique = artwork.technique.replace(/\d+(?:[,.]\d+)?\s*[x×]\s*\d+(?:[,.]\d+)?.*$/i, '').trim();
  }
  
  // Clean dimensions
  if (artwork.dimensions) {
    // Normalize spacing
    artwork.dimensions = artwork.dimensions.replace(/\s+/g, ' ').trim();
  }
  
  // Ensure consistent date format
  if (artwork.date) {
    artwork.date = artwork.date.trim();
  }
}

console.log(`\n✅ Fixed ${fixedRoomCount} room fields`);
console.log(`✅ Extracted ${fixedTechniqueCount} techniques from room fields`);

// Save cleaned data
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
console.log(`\n💾 Saved to ${OUTPUT_FILE}`);

// Also update the original file
fs.writeFileSync(INPUT_FILE, JSON.stringify(artworks, null, 2));
console.log(`💾 Updated ${INPUT_FILE}`);

// Statistics
const withRoom = artworks.filter(a => a.room).length;
const withTechnique = artworks.filter(a => a.technique).length;

console.log('\n📊 Updated Statistics:');
console.log(`  Artworks with room info: ${withRoom}`);
console.log(`  Artworks with technique: ${withTechnique}`);

// Sample
console.log('\n📋 Sample room values:');
const roomSamples = [...new Set(artworks.filter(a => a.room).map(a => a.room))].slice(0, 10);
roomSamples.forEach(r => console.log(`  - ${r}`));

console.log('\n═══════════════════════════════════════════════════════════');
