const axios = require('axios');

(async () => {
  try {
    const url = 'https://my.tretyakov.ru/api/compilation/items?id=153332&lang=en';
    const response = await axios.get(url, {
      headers: {
        'Origin': 'https://my.tretyakov.ru',
        'Referer': 'https://my.tretyakov.ru/'
      }
    });
    
    if (response.data && response.data.data && response.data.data.items) {
        const item = response.data.data.items[0];
        console.log('Sample Item:', JSON.stringify(item, null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
})();
