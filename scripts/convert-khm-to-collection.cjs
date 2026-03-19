const fs = require('fs');

// Load the scraped KHM data
const sourceData = JSON.parse(fs.readFileSync('/Users/kietzsche/armin-web-main/downloads/khm-test-100.json', 'utf8'));

// Transform to collection format
const collectionData = {
  museum: "Kunsthistorisches Museum Vienna",
  museumId: "kunsthistorisches-museum-vienna",
  collectionName: "KHM Collection",
  scrapedAt: new Date().toISOString(),
  totalObjects: sourceData.length,
  coverImage: sourceData[0]?.imageUrl || "",
  objects: sourceData.map(artwork => ({
    id: `khm-${artwork.id}`,
    title: artwork.title,
    artist: artwork.artist !== 'Unknown' ? artwork.artist : artwork.culture,
    year: extractYear(artwork.date),
    dateStr: artwork.date || 'Unknown',
    medium: artwork.medium || null,
    dimensions: artwork.dimensions || null,
    room: artwork.location || null,
    image: artwork.imageUrl,
    source: artwork.source,
    url: artwork.url,
    classification: artwork.classification,
    objectType: artwork.objectType,
    culture: artwork.culture,
    period: artwork.period,
    inventory: artwork.inventory,
    description: artwork.description || null,
    provenance: artwork.provenance || null,
    isHighlight: artwork.isHighlight || false
  }))
};

function extractYear(dateStr) {
  if (!dateStr || dateStr === 'Unknown') return null;
  
  // Try to extract 4-digit year
  const yearMatch = dateStr.match(/(\d{4})/);
  if (yearMatch) {
    return parseInt(yearMatch[1]);
  }
  
  // Try to extract century info like "2. Jh. v. Chr." -> approximately -150
  const centuryBCMatch = dateStr.match(/(\d+)\.\s*Jh\.\s*v\.\s*Chr/i);
  if (centuryBCMatch) {
    const century = parseInt(centuryBCMatch[1]);
    return -(century * 100 - 50); // Middle of the century BC
  }
  
  const centuryADMatch = dateStr.match(/(\d+)\.\s*Jh\.\s*n\.\s*Chr/i);
  if (centuryADMatch) {
    const century = parseInt(centuryADMatch[1]);
    return century * 100 - 50; // Middle of the century AD
  }
  
  return null;
}

// Save to public/data
const outputPath = '/Users/kietzsche/armin-web-main/public/data/khm-collection.json';
fs.writeFileSync(outputPath, JSON.stringify(collectionData, null, 2), 'utf8');

console.log('✅ KHM Collection converted successfully!');
console.log(`📁 Saved to: ${outputPath}`);
console.log(`📊 Total objects: ${collectionData.totalObjects}`);
console.log(`🖼️  Cover image: ${collectionData.coverImage}`);

// Print sample
console.log('\n📋 Sample entries:');
collectionData.objects.slice(0, 3).forEach((obj, idx) => {
  console.log(`\n${idx + 1}. ${obj.title}`);
  console.log(`   Artist: ${obj.artist}`);
  console.log(`   Date: ${obj.dateStr} (Year: ${obj.year || 'N/A'})`);
  console.log(`   Image: ${obj.image ? '✓' : '✗'}`);
});
