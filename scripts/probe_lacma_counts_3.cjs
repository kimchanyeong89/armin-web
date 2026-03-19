const https = require('https');

const queries = [
  // Class 22 + On View
  'f[0]=bm_field_has_image:true&f[1]=im_field_classification:22&on_view_only=1',
  
  // Euro (39) + On View
  'f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:39&on_view_only=1',

  // Modern (32) + On View
  'f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:32&on_view_only=1',

  // American (30) + On View
  'f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:30&on_view_only=1',
  
  // Asian Art (33) + On View
  'f[0]=bm_field_has_image:true&f[1]=im_field_curatorial_area:33&on_view_only=1',
];

function fetchCount(query) {
  return new Promise((resolve) => {
    https.get(`https://collections.lacma.org/search/site/?${query}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const m = data.match(/(\d+(?:,\d+)*) results/);
        const m2 = data.match(/Search results\s*<span>\s*\((\d+(?:,\d+)*)\)/);
        const m3 = data.match(/1 - \d+ of (\d+(?:,\d+)*)/);
        const count = m ? m[1] : (m2 ? m2[1] : (m3 ? m3[1] : '???'));
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
