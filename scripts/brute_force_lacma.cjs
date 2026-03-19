const https = require('https');

function fetchCount(type, id) {
  const query = `f[0]=bm_field_has_image:true&f[1]=${type}:${id}`;
  return new Promise((resolve) => {
    const req = https.get(`https://collections.lacma.org/search/site/?${query}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const m = data.match(/(\d+(?:,\d+)*) results/);
        const m3 = data.match(/1 - \d+ of (\d+(?:,\d+)*)/);
        let countRaw = m ? m[1] : (m3 ? m3[1] : '0');
        const count = parseInt(countRaw.replace(/,/g, ''), 10);
        
        // Exact match or close?
        if ([827, 135].some(target => Math.abs(count - target) < 20)) {
           console.log(`MATCH match! ${type}:${id} => ${count}`);
        } else {
           // console.log(`.. ${type}:${id} => ${count}`);
        }
        resolve();
      });
    });
    req.on('error', () => resolve());
  });
}

(async () => {
  console.log('Scanning Classifications 1-60...');
  for (let i = 1; i <= 60; i++) {
    await fetchCount('im_field_classification', i);
  }
  console.log('Scanning Curatorial Areas 1-60...');
  for (let i = 1; i <= 60; i++) {
    await fetchCount('im_field_curatorial_area', i);
  }
})();
