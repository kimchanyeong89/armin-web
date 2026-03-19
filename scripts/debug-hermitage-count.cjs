const axios = require('axios');
const FormData = require('form-data');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

(async () => {
  const form = new FormData();
  form.append('lng', 'en');
  form.append('page', '1');
  form.append('categories', 'all');
  form.append('fund', '');
  form.append('material', '');
  form.append('author_sort', '');

  try {
    const response = await axios.post('https://www.hermitagemuseum.org/api/collections/load/highlights', form, {
      headers: { ...form.getHeaders(), 'Origin': 'https://www.hermitagemuseum.org' },
      httpsAgent: httpsAgent
    });

    if (response.data && response.data.data) {
        console.log('Keys in data:', Object.keys(response.data.data));
        if (response.data.data.totalPages) console.log('Total Pages:', response.data.data.totalPages);
        console.log('Highlights length:', response.data.data.highlights.length);
    } else {
        console.log('Structure unexpected:', response.data);
    }
  } catch (e) {
    console.error(e.message);
  }
})();
