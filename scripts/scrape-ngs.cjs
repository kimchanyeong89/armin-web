// Scrapes National Gallery Singapore (NGS) collection from Algolia
// Index: prod_ngs_collections
// AppID: TJMUSR60N2
// Key: 23fa828b71e81459128719d920fc4d09

const fs = require('fs');
const path = require('path');

const ALGOLIA_ID = 'TJMUSR60N2';
const ALGOLIA_KEY = '23fa828b71e81459128719d920fc4d09';
const INDEX_NAME = 'prod_ngs_collections';
const CHUNK_SIZE = 50; // hitsPerPage

const IMG_BASE = 'https://www.nationalgallery.sg';

async function fetchPage(page) {
  const url = `https://${ALGOLIA_ID}-dsn.algolia.net/1/indexes/${INDEX_NAME}/query`;
  
  const body = {
    params: new URLSearchParams({
      filters: 'indexCategory:artwork',
      hitsPerPage: CHUNK_SIZE.toString(),
      page: page.toString()
    }).toString()
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_ID,
      'X-Algolia-API-Key': ALGOLIA_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page ${page}: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function main() {
  console.log('Starting NGS scrape...');
  
  // Initial fetch to get details
  const initial = await fetchPage(0);
  const totalPages = initial.nbPages;
  const totalHits = initial.nbHits;
  
  console.log(`Found ${totalHits} artworks across ${totalPages} pages.`);

  let allItems = [];

  for (let i = 0; i < totalPages; i++) {
    // Basic rate limiting
    if (i % 10 === 0) process.stdout.write(`Fetching page ${i}/${totalPages}...\r`);
    
    try {
      const data = await fetchPage(i);
      
      const mapped = data.hits.map(hit => {
        const m = hit.metadata || {};
        
        // Artist handling
        let artist = 'Unknown';
        if (m.artistCfs && m.artistCfs.length > 0) {
          artist = m.artistCfs[0].availableName || m.artistCfs[0].perNameTxt || 'Unknown';
        } else if (m.artistAvailableNames && m.artistAvailableNames.length > 0) {
          artist = m.artistAvailableNames[0];
        }

        // Identifier
        // Use object number if available, else clean up the path/ID
        const id = m.objObjectNumberTxt || hit.objectID;

        // Dimensions
        let dimensions = '';
        if (m.objDim2DGrp && m.objDim2DGrp.length > 0) {
          // Summary often contains literal "null" strings
          dimensions = (m.objDim2DGrp[0].summary || '').replace(/null/gi, '').trim();
        }

        // Image URL
        // hit.path starts with /content/dam/...
        let imageUrl = null;
        if (hit.path) {
          imageUrl = IMG_BASE + hit.path;
          // TIF images are not browser-compatible, use AEM thumbnail rendition
          if (imageUrl.toLowerCase().endsWith('.tif')) {
            imageUrl += '.thumb.800.800.png';
          }
        }

        // Source URL
        // Construct detailed URL based on path
        // Pattern: {BASE}/search-collection.artwork.html{path - /content/dam/national-collections-artworks}.html
        let sourceUrl = `https://www.nationalgallery.sg/sg/en/our-collections/search-collection.html?search=${encodeURIComponent(id)}`;
        
        if (hit.path && hit.path.includes('/content/dam/national-collections-artworks')) {
          const detailPath = hit.path.replace('/content/dam/national-collections-artworks', '');
          sourceUrl = `https://www.nationalgallery.sg/sg/en/our-collections/search-collection.artwork.html${detailPath}.html`;
        }

        return {
          id: id,
          title: hit.title || m.objObjectTitleTxt || 'Untitled',
          artist: artist,
          date: m.objDateDatingTxt || '',
          medium: m.objMaterialTechniqueTxt || '',
          dimensions: dimensions.trim(),
          imageUrl: imageUrl,
          sourceUrl: sourceUrl,
          isHighlight: m.categoryLabel === 'Collection Highlights',
          category: m.categoryLabel || '',
          // Debug fields
          _score: hit.indexCategoryWeight
        };
      });

      allItems = allItems.concat(mapped);
      
      // Gentle pacing
      await new Promise(r => setTimeout(r, 100));
      
    } catch (e) {
      console.error(`Error on page ${i}:`, e.message);
      // Retry once? Nah, just continue for now
    }
  }

  console.log(`\nScraped ${allItems.length} items. Writing to file...`);
  
  const OUT_PATH = path.join(__dirname, '../public/data/ngs-all.json');
  fs.writeFileSync(OUT_PATH, JSON.stringify(allItems, null, 2));
  
  // Stats
  const highlights = allItems.filter(i => i.isHighlight);
  console.log(`Count: ${allItems.length}`);
  console.log(`Highlights: ${highlights.length}`);
  if (highlights.length > 0) {
      console.log('Sample highlight:', highlights[0]);
  }
}

main().catch(console.error);
