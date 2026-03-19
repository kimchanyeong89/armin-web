const https = require('https');

const queries = [
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22', // Paintings
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:21', // Drawings (guess)
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22&f[2]=bm_field_on_view:true',
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:21&f[2]=bm_field_on_view:true',
  // Curatorial Areas?
  'f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:39', // European?
  'f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:39&f[2]=bm_field_on_view:true',
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22&f[2]=im_field_curatorial_area:32',
];

function fetchCount(query) {
  return new Promise((resolve) => {
    https.get(`https://collections.lacma.org/search/site/?${query}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Look for "X results"
        const m = data.match(/(\d+(?:,\d+)*) results/);
        // Also looks like "Search results (1614)" in title maybe?
        const m2 = data.match(/Search results\s*<span>\s*\((\d+(?:,\d+)*)\)/);
        
        // Also look for "1 - 20 of X"
        const m3 = data.match(/1 - \d+ of (\d+(?:,\d+)*)/);

        const count = m ? m[1] : (m2 ? m2[1] : (m3 ? m3[1] : '???'));
        console.log(`Query: ${query} => Count: ${count}`);
        if(data.includes('827')) console.log('  -> Found 827 somewhere');
        if(data.includes('135')) console.log('  -> Found 135 somewhere');
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
