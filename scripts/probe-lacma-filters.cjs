const fs = require('fs');
const https = require('https');

// Classifications to check
const CLASS_IDS = [22, 23, 30, 31, 32, 33, 34, 39]; 
// 22=Paintings, 30=Sculpture, 33=S.Asian, 39=European

async function getCount(cid) {
  return new Promise((resolve) => {
    // Check with on_view_only=1
    const url = `https://collections.lacma.org/search/site/?f[0]=bm_field_has_image:true&f[1]=im_field_classification:${cid}&on_view_only=1`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Look for "Search results" ... "1 - 20 of 827" or similar
        // Or "There are no results"
        // Pattern: <h1 class="title">...</h1> or specific pager text
        // Usually LACMA output has: "1 - 20 of 827" in <div class="search-stats"> ?
        // Or just count the number of pages in pager? No, need total.
        
        // Let's use cheerio to find exact count or a regex
        // "1 - 20 of 827"
        const m = data.match(/of\s+([\d,]+)/);
        const count = m ? parseInt(m[1].replace(/,/g, '')) : 0;
        resolve({ cid, count, url });
      });
    }).on('error', () => resolve({ cid, count: -1, url }));
  });
}

(async () => {
  console.log('Checking counts with on_view_only=1...');
  for (const cid of CLASS_IDS) {
    const res = await getCount(cid);
    console.log(`Class ${cid}: ${res.count} items (URL: ${res.url})`);
  }
})();
