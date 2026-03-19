const axios = require('axios');
const fs = require('fs');
const path = require('path');

const https = require('https');

const OUTPUT_FILE = path.join(__dirname, '../downloads/tretyakov-test.html');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

(async () => {
    try {
        console.log('Fetching https://www.tretyakovgallery.ru/en/collection/');
        const response = await axios.get('https://www.tretyakovgallery.ru/en/collection/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.tretyakovgallery.ru/',
                'Origin': 'https://www.tretyakovgallery.ru'
            },
            httpsAgent: httpsAgent,
            timeout: 30000
        });
        
        fs.writeFileSync(OUTPUT_FILE, response.data);
        console.log(`Saved HTML to ${OUTPUT_FILE}`);
        
    } catch (e) {
        console.error(e.message);
    }
})();
