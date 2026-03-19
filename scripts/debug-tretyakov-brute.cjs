const axios = require('axios');

async function check(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://my.tretyakov.ru',
        'Referer': 'https://my.tretyakov.ru/'
      },
      timeout: 5000,
      validateStatus: () => true // Don't throw on error status
    });
    console.log(`[${response.status}] ${url}`);
    if (response.status === 200) {
        console.log('   Keys:', Object.keys(response.data));
        if (response.data.data) {
             console.log('   Data keys:', Object.keys(response.data.data));
             // Check for items
             if (response.data.data.items) console.log('   Items:', response.data.data.items.length);
        }
    }
  } catch (e) {
    console.log(`[ERR] ${url}: ${e.message}`);
  }
}

(async () => {
    const id = 153332;
    const base = 'https://my.tretyakov.ru/api';
    
    const patterns = [
        `${base}/compilation/items?id=${id}&lang=en`,
        `${base}/compilation/items?compilation_id=${id}&lang=en`,
        `${base}/compilation/items?compilationId=${id}&lang=en`,
        `${base}/compilation/${id}/items?lang=en`,
        `${base}/compilations/${id}/items?lang=en`,
        `${base}/compilation/get?id=${id}&lang=en`,
        `${base}/compilations/get?id=${id}&lang=en`,
        `${base}/items?compilation_id=${id}&lang=en`,
        `${base}/items?compilationId=${id}&lang=en`,
        `${base}/collection/items?id=${id}&lang=en`,
        // Try v1
        `${base}/v1/compilation/items?id=${id}&lang=en`,
        `${base}/v1/compilation/${id}/items?lang=en`
    ];

    for (const p of patterns) {
        await check(p);
    }
})();
