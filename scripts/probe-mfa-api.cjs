const https = require('https');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const base = 'https://collections.mfa.org';
const candidates = [
  '/objects/json',
  '/search/Objects/json',
  '/API/search',
  '/api/search',
  '/search/Objects/classifications:Paintings;onview:true;imageExistence:true/json', // Sometimes appending /json works
  '/search/Objects/classifications%3APaintings%3Bonview%3Atrue%3BimageExistence%3Atrue/json'
];

// Helper to fetch
const fetchUrl = (path) => new Promise((resolve) => {
    const url = base + path;
    const req = https.request(url, { headers: { 'User-Agent': UA } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ path, status: res.statusCode, type: res.headers['content-type'], len: data.length, snippet: data.slice(0, 100) }));
    });
    req.on('error', (e) => resolve({ path, error: e.message }));
    req.end();
});

(async () => {
    for (const path of candidates) {
        const res = await fetchUrl(path);
        console.log(`[${res.status}] ${res.path} (${res.type}) - ${res.snippet.replace(/\n/g, ' ')}`);
    }
})();
