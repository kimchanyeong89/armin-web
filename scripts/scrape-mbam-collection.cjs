const fs = require('fs');

async function scrape() {
  const appId = '9VPFHHF7FF';
  const apiKey = '1d8e705918b508782ee0abb03d527b28';
  const indexName = 'MBAM';
  
  // Categories requested previously + User wants 1000+ items now.
  const categories = [
    'Dessin',
    'Graphisme',
    'Design industriel',
    'Luminaire',
    'Peinture',
    'Photographie',
    'Video/Film'
  ];

  // (objFilter:"Dessin" OR objFilter:"Graphisme" ...)
  const categoryFilter = `(${categories.map(c => `objFilter:"${c}"`).join(' OR ')})`;

  // We loop from year 1400 to 2030 to cover the collection.
  const startYear = 1400;
  const endYear = 2030;
  const hitsPerPage = 1000;
  
  let allHits = [];

  console.log(`Starting massive scrape for MBAM (${startYear}-${endYear})...`);

  // Use 5-year chunks to safely stay under 1000 limit
  const chunks = [];
  for (let y = startYear; y <= endYear; y += 5) {
      chunks.push([y, Math.min(y + 4, endYear)]);
  }

  for (const [yStart, yEnd] of chunks) {
    const numFilter = `productionSort >= ${yStart} AND productionSort <= ${yEnd}`;
    const filters = `${categoryFilter} AND ${numFilter}`;

    let page = 0;
    while(true) {
        const payload = {
            requests: [
              {
                indexName: indexName,
                params: [
                  `query=`,
                  `hitsPerPage=${hitsPerPage}`,
                  `page=${page}`,
                  `facetFilters=[["lang:en"],["group:works"]]`,
                  `filters=${filters}`
                ].join('&')
              }
            ]
          };

        try {
            // Algolia API with rate limit pause if needed
            const resp = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/*/queries`, {
                method: 'POST',
                headers: {
                  'x-algolia-application-id': appId,
                  'x-algolia-api-key': apiKey,
                  'Content-Type': 'application/json',
                  'Referer': 'https://www.mbam.qc.ca/'
                },
                body: JSON.stringify(payload)
            });

            if(!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            const result = data.results[0];
            const hits = result.hits;
            const nbHits = result.nbHits;

            if (page === 0) {
                // process.stdout.write(`.`); // progress dot
                // console.log(`Range ${yStart}-${yEnd}: ${nbHits} items.`);
            }

            if (!hits || hits.length === 0) break;

            for (const hit of hits) {
                let itemUrl = hit.url;
                if (itemUrl && !itemUrl.startsWith('http')) {
                  itemUrl = 'https://www.mbam.qc.ca' + itemUrl;
                }
                let date = String(hit.productionSort || '');
                if (Array.isArray(hit.text)) {
                   const dateCandidate = hit.text.find(t => 
                     /^(\d{4}[-–]\d{2,4}|\d{4}|c\.\s*\d{4}.*)$/i.test(t) && t !== hit.productionSort && t.length < 20
                   );
                   if (dateCandidate) date = dateCandidate;
                }
                let category = hit.obj; 
                if (Array.isArray(hit.objFilter)) {
                   const en = hit.objFilter.find(c => !categories.includes(c));
                   if (en) category = en;
                   else if (hit.objFilter.length > 0) category = hit.objFilter[0];
                }

                allHits.push({
                  id: hit.objectID,
                  title: hit.primaryTitle || hit.title,
                  artist: hit.maker,
                  image: hit.imageUrl,
                  url: itemUrl,
                  date: date,
                  category: category
                });
            }

            if (page >= result.nbPages - 1) break;
            page++;
        } catch(e) {
            console.error('Error:', e.message);
            break;
        }
    }
  }

  // Deduplication
  const seen = new Set();
  const uniqueHits = [];
  for (const h of allHits) {
      if (!seen.has(h.id)) {
          seen.add(h.id);
          uniqueHits.push(h);
      }
  }

  console.log(`\nTotal collected (unique): ${uniqueHits.length}`);
  fs.writeFileSync('public/data/mbam-collection.json', JSON.stringify(uniqueHits, null, 2));
}

scrape();
