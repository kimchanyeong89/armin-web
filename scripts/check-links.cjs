const https = require('https');
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {headers: {'User-Agent': 'Mozilla/5.0'}}, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}
(async () => {
  const html = await fetch('https://www.tate.org.uk/visit/tate-britain/display/historic-british-art');
  // Find all room links
  const pattern = /href="(\/visit\/tate-britain\/display\/[^"]+)"/g;
  const links = new Set();
  let m;
  while ((m = pattern.exec(html)) !== null) {
    links.add(m[1]);
  }
  console.log('Historic links found:');
  [...links].forEach(l => console.log('  ' + l));
})();
