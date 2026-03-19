// const fetch = require('node-fetch');

const slug = 'carrying-loads';
const API = `https://www.powerstationofart.com/campus/api/feed/public/psa/psa-collections/${slug}`;

(async () => {
  const res = await fetch(API, {
    headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Referer': `https://www.powerstationofart.com/psa-collections/${slug}`,
        'x-language': 'en',
    }
  });
  if (!res.ok) {
      console.log('Error:', res.status);
      process.exit(1);
  }
  const json = await res.json();
  
  console.log('Keys:', Object.keys(json));
  // print medium and dimensions if strictly present
  console.log('Title:', json.title);
  console.log('Medium:', json.medium);
  console.log('Dimension:', json.dimension || json.dimensions);
  
  // Dump a bit more to see if structure is nested
  console.log('Dump:', JSON.stringify(json, null, 2));
})();
