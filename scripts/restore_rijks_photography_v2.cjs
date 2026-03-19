const fs = require('fs');

const PROGRESS_FILE = 'downloads/rijksmuseum-photography-progress.json';
const OUTPUT_FILE = 'public/data/rijksmuseum-photography-collection.json';

if (fs.existsSync(PROGRESS_FILE)) {
  const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  
  let sourceList = [];
  if (progress.artworks && progress.artworks.length > 0) {
      sourceList = progress.artworks;
  } else if (progress.allSearchResults && progress.allSearchResults.length > 0) {
      sourceList = progress.allSearchResults;
  }
  
  const finalArtworks = sourceList.map(item => {
      // Artist extraction
      let artist = 'Unknown';
      let year = null;
      
      if (item.makerSubtitleLine) {
           const parts = item.makerSubtitleLine.split(',');
           if (parts.length > 0) {
             artist = parts[0].trim();
             // Try to find year
             const yearMatch = item.makerSubtitleLine.match(/\b(\d{4})\b/);
             if (yearMatch) year = parseInt(yearMatch[1], 10);
           }
      } else if (item.artist) {
          artist = item.artist;
      }
      
      // Image URL Construction
      let imageUrl = item.image || ''; // Keep existing if present
      
      if (!imageUrl && item.micrioImage && item.micrioImage.micrioId) {
          // Construct IIIF URL
          // Use 1000px width for better performance than max
          imageUrl = `https://iiif.micr.io/${item.micrioImage.micrioId}/full/1000,/0/default.jpg`;
      }
      
      return {
        id: item.objectNumber || item.objectNodeId || '',
        objectNumber: item.objectNumber || '',
        title: item.title || '',
        artist: artist,
        year: year || item.year || null,
        medium: item.physicalFeatures || item.medium || '',
        image: imageUrl,
        sourceUrl: `https://www.rijksmuseum.nl/en/collection/${item.objectNumber}`
      };
  });
  
  // Filter out items that still have no image?
  // No, let's keep them in the file but the frontend filters them. 
  // But to be sure we fixed the JSON, let's check count.
  const validImages = finalArtworks.filter(a => a.image).length;
  console.log(`Restored ${finalArtworks.length} items. Items with images: ${validImages}`);
  
  const output = {
      museum: 'Rijksmuseum',
      collection: 'Photography',
      website: 'https://www.rijksmuseum.nl',
      scraped_date: new Date().toISOString(),
      total_count: finalArtworks.length,
      artworks: finalArtworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}
