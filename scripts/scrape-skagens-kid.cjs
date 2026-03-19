const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

const API_URL = "https://samlinger.slks.dk/api/es_artworks";
const BASE_URL = "https://samlinger.slks.dk";
const MUSEUM_NAME = "Skagens Museum";
const OUTPUT_FILE = path.join(__dirname, '../public/data/skagens-collection.json');

async function scrape() {
  console.log(`Starting scrape for ${MUSEUM_NAME}...`);
  let allWorks = [];
  let page = 1;
  const size = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = new URL(API_URL);
      url.searchParams.append('museum', MUSEUM_NAME);
      url.searchParams.append('hasReproductions', 'true');
      // Match the UI filter: only paintings (Maleri) with reproductions
      url.searchParams.append('objectNames', 'Maleri');
      url.searchParams.append('lang', 'da');
      url.searchParams.append('size', size);
      url.searchParams.append('page', page);

      console.log(`Fetching page ${page}...`);
      const res = await fetch(url.toString());
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      const hits = data['hydra:member'] || data.items || data;
      
      if (hits.length === 0) {
        console.log('No more items found (empty page).');
        hasMore = false;
        break;
      }

      console.log(`Found ${hits.length} items on page ${page}.`);

      for (const hit of hits) {
        const id = hit.id;
        
        let imageUrl = '';
        if (hit.reproductions && hit.reproductions.length > 0) {
             const rawUrl = hit.reproductions[0];
             if (rawUrl.startsWith('http')) {
                 imageUrl = rawUrl;
             } else {
                 imageUrl = BASE_URL + rawUrl;
             }
        } 
        
        if (!imageUrl) continue;

        const objectNames = hit.objectNames || [];
        const category = objectNames.join(', ') || 'Unknown';
        
        const is3D = objectNames.some(name => 
            /\b(skulptur|buste|statue|relief|objekt|installation|keramik|stentøj|model|figur)\b/i.test(name)
        );

        const work = {
          id: id,
          title: hit.title || 'Untitled',
          artist: (hit.creatorsNames || []).join(', '),
          date: hit.productionStartString || hit.productionStartDate || '',
          medium: (hit.techniqueNotes || []).join(', '),
          dimensions: (hit.dimensionValue || []).join('; '),
          image: imageUrl,
          sourceUrl: `https://samlinger.slks.dk/samlinger/${id}`,
          category: category,
          is3D: is3D
        };

        allWorks.push(work);
      }

      // if (hits.length < size) {
      //   hasMore = false;
      // }
      page++;
      
      if (page > 100) break;
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error('Error fetching page:', err);
      hasMore = false;
    }
  }

  console.log(`Scraping complete. Total works found: ${allWorks.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allWorks, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

scrape();
