const https = require('https');
const fs = require('fs');

const url = 'https://americanart.si.edu/search/artworks?f[0]=object_type:Paintings';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } }, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('debug-saam-search.html', data);
    console.log('Saved debug-saam-search.html status:', res.statusCode);
  });
}).on('error', (e) => console.error(e));
