const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/tretyakov-wikidata.json');

// Improved query to fetch materials, genres, instances, and dimensions
const SPARQL_QUERY = `
SELECT ?item ?itemLabel ?image ?creatorLabel ?inception ?inventoryNumber 
       (GROUP_CONCAT(DISTINCT ?materialLabel; separator=", ") AS ?materials)
       (GROUP_CONCAT(DISTINCT ?genreLabel; separator=", ") AS ?genres)
       (GROUP_CONCAT(DISTINCT ?instanceLabel; separator=", ") AS ?instances)
       (MAX(?heightVal) AS ?height) 
       (MAX(?widthVal) AS ?width)
WHERE {
  ?item wdt:P195 wd:Q183334.  # Collection: State Tretyakov Gallery
  ?item wdt:P18 ?image.       # Must have an image
  
  OPTIONAL { ?item wdt:P170 ?creator. }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P217 ?inventoryNumber. }
  
  OPTIONAL { 
    ?item wdt:P186 ?material. 
    ?material rdfs:label ?materialLabel. 
    FILTER(LANG(?materialLabel) = "en") 
  }
  
  OPTIONAL { 
    ?item wdt:P136 ?genre. 
    ?genre rdfs:label ?genreLabel. 
    FILTER(LANG(?genreLabel) = "en") 
  }

  OPTIONAL { 
    ?item wdt:P31 ?instance. 
    ?instance rdfs:label ?instanceLabel. 
    FILTER(LANG(?instanceLabel) = "en") 
  }

  OPTIONAL { ?item wdt:P2048 ?heightVal. }
  OPTIONAL { ?item wdt:P2049 ?widthVal. }

  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ru". }
}
GROUP BY ?item ?itemLabel ?image ?creatorLabel ?inception ?inventoryNumber
LIMIT 2000
`;

(async () => {
    try {
        console.log('Fetching from Wikidata with detailed metadata (including instances)...');
        const url = 'https://query.wikidata.org/sparql';
        const response = await axios.get(url, {
            params: {
                query: SPARQL_QUERY,
                format: 'json'
            },
            headers: {
                'User-Agent': 'TretyakovScraper/1.0 (mailto:your@email.com)'
            }
        });

        if (response.data && response.data.results && response.data.results.bindings) {
            const items = response.data.results.bindings.map(b => {
                let year = b.inception ? b.inception.value : '';
                // Clean year: "1887-01-01T00:00:00Z" -> "1887"
                if (year && year.includes('T')) {
                    year = year.split('T')[0].split('-')[0];
                }
                
                let artist = b.creatorLabel ? b.creatorLabel.value : 'Unknown';
                if (artist.startsWith('http')) artist = 'Unknown';

                // Format dimensions
                let dimensions = '';
                if (b.height && b.width) {
                    dimensions = `${b.height.value} x ${b.width.value} cm`;
                }

                // Determine category: Instance preferred, fallback to Genre
                let category = b.instances ? b.instances.value : '';
                if (!category && b.genres) {
                    category = b.genres.value;
                }
                if (!category) category = 'Painting'; // Ultimate fallback

                return {
                    id: `tretyakov-${b.item.value.split('/').pop()}`,
                    title: b.itemLabel.value,
                    artist: artist,
                    year: year,
                    image: b.image.value,
                    inventoryNumber: b.inventoryNumber ? b.inventoryNumber.value : '',
                    museum: 'State Tretyakov Gallery',
                    sourceUrl: b.item.value,
                    medium: b.materials ? b.materials.value : '',
                    category: category, 
                    dimensions: dimensions
                };
            });

            console.log(`Found ${items.length} items.`);
            if (items.length > 0) {
                console.log('Sample:', JSON.stringify(items[0], null, 2));
            }
            
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
            console.log(`Saved to ${OUTPUT_FILE}`);
        }
    } catch (e) {
        console.error(e.message);
    }
})();
