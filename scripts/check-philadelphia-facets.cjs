const fs = require('fs');
const https = require('https');

const APP_ID = 'X6LQJKEE40';
const API_KEY = 'f42fa6c68b53c57e31423969d0dc6cbf';

const query = {
  requests: [
    {
      indexName: 'collection',
      params: 'facets=["classification"]&hitsPerPage=0&maxValuesPerFacet=100'
    }
  ]
};

const options = {
  hostname: `${APP_ID}-dsn.algolia.net`,
  path: '/1/indexes/*/queries?x-algolia-agent=Node.js',
  method: 'POST',
  headers: {
    'X-Algolia-Application-Id': APP_ID,
    'X-Algolia-API-Key': API_KEY,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const facets = json.results[0].facets.classification;
    console.log('--- Classification Facets ---');
    console.log(JSON.stringify(facets, null, 2));
  });
});

req.write(JSON.stringify(query));
req.end();
