// Verify Walker Wikimedia thumb URLs are accessible
const https = require('https');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/kietzsche/armin-web-main/public/data/walker-art-gallery-collection.json', 'utf8'));

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, (res) => {
      resolve({ status: res.status || res.statusCode, type: res.headers['content-type'] || '', location: res.headers.location || '' });
      res.resume();
    });
    req.on('error', e => resolve({ error: e.message }));
    req.setTimeout(10000, () => { req.destroy(); resolve({ error: 'timeout' }); });
  });
}

(async () => {
  const sample = data.objects.filter(o => o.image).slice(0, 8);
  console.log(`Testing ${sample.length} image URLs...\n`);
  
  for (const obj of sample) {
    const r = await get(obj.image);
    const ok = r.status === 200 && r.type.startsWith('image/');
    const redir = r.status === 301 || r.status === 302;
    console.log(`${ok ? '✅' : redir ? '↩️' : '❌'} [${r.status || 'ERR'}] ${r.type.slice(0,25)} ${r.error || ''}`);
    console.log(`   ${obj.title.slice(0,50)}`);
    console.log(`   ${obj.image.slice(0, 90)}`);
    if (r.location) console.log(`   → ${r.location.slice(0,80)}`);
    console.log();
  }
})();
