const axios = require('axios');

async function checkEndpoint(url, label, method = 'GET', data = null) {
  try {
    console.log(`\n🔍 Checking ${label} [${method}]: ${url}`);
    const config = {
      method: method,
      url: url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://my.tretyakov.ru',
        'Referer': 'https://my.tretyakov.ru/',
        'Content-Type': 'application/json'
      },
      data: data,
      timeout: 10000
    };
    
    const response = await axios(config);
    
    if (response.data) {
        console.log(`✅ Status: ${response.status}`);
        const resData = response.data;
        console.log('Top Keys:', Object.keys(resData));
        if (resData.data) {
            console.log('Data Keys:', Object.keys(resData.data));
            if (Array.isArray(resData.data)) console.log('Data Array Length:', resData.data.length);
            if (resData.data.items) console.log('Items Count:', resData.data.items.length);
        }
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message} (Status: ${error.response?.status})`);
    if (error.response?.data) {
        console.log('Error Data:', JSON.stringify(error.response.data).substring(0, 200));
    }
  }
}

(async () => {
    // Test 1: POST Search
    await checkEndpoint('https://my.tretyakov.ru/api/search', 'Search POST', 'POST', {
        query: "art",
        lang: "en",
        page: 1,
        pageSize: 10
    });

    // Test 2: POST Search v1
    await checkEndpoint('https://my.tretyakov.ru/api/v1/search', 'Search v1 POST', 'POST', {
        query: "art",
        lang: "en",
        page: 1,
        pageSize: 10
    });

    // Test 3: Main site collection
    await checkEndpoint('https://www.tretyakovgallery.ru/en/collection/', 'Main Site Collection', 'GET');
    
    // Test 4: Main site API?
    await checkEndpoint('https://www.tretyakovgallery.ru/api/collection', 'Main Site API', 'GET');
})();
