// const fetch = require('node-fetch');

const API = 'https://www.powerstationofart.com/campus/api/feed/public/psa/psa-collections?limit=5&offset=0'; // Removed artworkType filter

(async () => {
  const res = await fetch(API, {
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Referer': 'https://www.powerstationofart.com/psa-collections',
        'x-language': 'en',
    }
  });
  const json = await res.json();
  
  const items = json.items || [];
  console.log('Total items in response:', items.length);
  // Check types returned
  const types = new Set(items.map(i => i.artworkType ? i.artworkType.title : 'Unknown'));
  console.log('Types found in first 5:', Array.from(types));
  
})();
