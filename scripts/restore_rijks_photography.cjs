const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = 'downloads/rijksmuseum-photography-progress.json';
const OUTPUT_FILE = 'public/data/rijksmuseum-photography-collection.json';

if (fs.existsSync(PROGRESS_FILE)) {
  console.log('Found progress file. Converting to collection format...');
  const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  
  // Scraper logical structure:
  // progress.artworks is the list of fully detailed items?
  // progress.allSearchResults is the search list, which might lack details if scraper was stopped early phase 2.
  
  // The scraper does 2 phases: 1. Search (allSearchResults), 2. Details (artworks)
  // If we stopped during search, we only have allSearchResults with basic info.
  // If we stopped during details, we have mix.
  
  // Let's use whatever is richest.
  // If artworks is empty but allSearchResults has items, we can try to map search results to artwork format minimally.
  
  let finalArtworks = [];
  
  if (progress.artworks && progress.artworks.length > 0) {
      console.log(`Using detailed artworks list (${progress.artworks.length} items)`);
      finalArtworks = progress.artworks;
  } else if (progress.allSearchResults && progress.allSearchResults.length > 0) {
      console.log(`Detailed list empty. Falling back to search results (${progress.allSearchResults.length} items)`);
      finalArtworks = progress.allSearchResults.map(item => ({
        id: item.objectNumber || item.objectNodeId || '',
        objectNumber: item.objectNumber || '',
        title: item.title || '',
        artist: (item.principalMakers && item.principalMakers.length > 0) ? item.principalMakers[0].name : 'Unknown',
        // Minimal mapping for fallback
        image: item.webImage ? item.webImage.url : '',
        sourceUrl: `https://www.rijksmuseum.nl/en/collection/${item.objectNumber}`
      }));
  }
  
  const output = {
      museum: 'Rijksmuseum',
      collection: 'Photography',
      website: 'https://www.rijksmuseum.nl',
      scraped_date: new Date().toISOString(),
      total_count: finalArtworks.length,
      artworks: finalArtworks
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Successfully restored ${finalArtworks.length} artworks to ${OUTPUT_FILE}`);
} else {
  console.error("Progress file not found!");
}
