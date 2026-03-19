const https = require('https');

const queries = [
  // Paintings (22) + European Ptg (39) ?
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22&f[2]=im_field_curatorial_area:39',
  // Paintings (22) + American Art (30) ?
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22&f[2]=im_field_curatorial_area:30',
  // Paintings (22) + Modern Art (32) ?
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22&f[2]=im_field_curatorial_area:32',
  
  // Maybe "On View" is a facet inside?
];

function fetchCount(query) {
  return new Promise((resolve) => {
    https.get(`https://collections.lacma.org/search/site/?${query}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const m = data.match(/(\d+(?:,\d+)*) results/);
        const m3 = data.match(/1 - \d+ of (\d+(?:,\d+)*)/);
        const count = m ? m[1] : (m3 ? m3[1] : '???');
        console.log(`Query: ${query} => Count: ${count}`);
        resolve();
      });
    });
  });
}

(async () => {
  for (const q of queries) {
    await fetchCount(q);
  }
})();
