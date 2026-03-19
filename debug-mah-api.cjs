const axios = require('axios');
const fs = require('fs');

async function testApi() {
  const url = 'https://www.mahmah.ch/views/ajax';
  const params = new URLSearchParams({
    view_name: 'search_results',
    view_display_id: 'page_4',
    view_dom_id: 'b15d35bd49faf2834d21d6a11c2954dbb5d747024bc1aef8e3a937c163b71441',
    page: '0', 
    _drupal_ajax: '1'
  });

  try {
    const response = await axios.post(url, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    console.log('Status:', response.status);
    
    fs.writeFileSync('mah-api-response-page0.json', JSON.stringify(response.data, null, 2));
    console.log('Saved response to mah-api-response-page0.json');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testApi();
