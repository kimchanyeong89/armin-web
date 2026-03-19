const fs = require('fs');

async function probe() {
  const urls = [
    'https://crystalbridges.emuseum.com/objects/json',
    'https://crystalbridges.emuseum.com/api/search', // Common in newer eMuseums
    'https://crystalbridges.emuseum.com/objects',
    'https://crystalbridges.emuseum.com/collections',
    'https://crystalbridges.emuseum.com/robots.txt'
  ];

  for (const url of urls) {
    console.log(`\nProbing ${url}...`);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/json,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      console.log(`Status: ${res.status}`);
      console.log(`Content-Type: ${res.headers.get('content-type')}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`Body start: ${text.slice(0, 200)}`);
        
        // Check if it's JSON
        if (res.headers.get('content-type')?.includes('json') || (text.startsWith('{') || text.startsWith('['))) {
           console.log('Posible JSON response found.');
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

probe();
