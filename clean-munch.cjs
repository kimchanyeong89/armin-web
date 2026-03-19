const fs = require('fs');
const https = require('https');
const http = require('http');

let data = JSON.parse(fs.readFileSync('./public/data/munch-collection.json', 'utf8'));

function checkImage(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redir = res.headers.location;
        if (!redir.startsWith('http')) redir = new URL(redir, url).toString();
        return checkImage(redir).then(resolve);
      }
      resolve(res.statusCode === 200);
      req.destroy();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function run() {
  const keepers = [];
  let checked = 0;
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (item.image && item.image.includes('.r2.dev')) {
      keepers.push(item);
      continue;
    }
    const url = item.original_image || item.image;
    if (!url) {
      console.log(`Skipping index ${i}: No URL`);
      continue;
    }
    
    console.log(`Checking ${checked++}: ${url}`);
    const ok = await checkImage(url);
    if (ok) {
      keepers.push(item);
      console.log('OK!');
    } else {
      console.log('FAILED (404/400). Dropping.');
    }
  }
  
  fs.writeFileSync('./public/data/munch-collection.json', JSON.stringify(keepers, null, 2));
  console.log(`Finished. Kept: ${keepers.length} / ${data.length}`);
}

run();