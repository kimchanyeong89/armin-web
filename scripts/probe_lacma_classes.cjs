const https = require('https');

const ids = [21, 22, 23, 29, 30, 31, 32, 33, 39]; 
// 21: Drawings, 22: Paintings, 23: Sculpture? 29?

function fetchCount(id) {
  return new Promise((resolve) => {
    https.get(`https://collections.lacma.org/search/site/?f[0]=bm_field_has_image:true&f[1]=im_field_classification:${id}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const m = data.match(/(\d+(?:,\d+)*) results/);
        const m2 = data.match(/Search results\s*<span>\s*\((\d+(?:,\d+)*)\)/);
        const count = m ? m[1] : (m2 ? m2[1] : '???');
        console.log(`Class ${id} => Count: ${count}`);
        resolve();
      });
    });
  });
}

(async () => {
  for (const id of ids) {
    await fetchCount(id);
  }
})();
