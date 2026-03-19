const axios = require('axios');

(async () => {
    // 404 on the compilation page URL is weird if the API says it exists.
    // Maybe the URL structure is different?
    // API returned link: "/compilations/exhibitions/153332/?lang=en"
    // So full URL: "https://my.tretyakov.ru/compilations/exhibitions/153332/?lang=en"
    
    // Let's try the root page again to see if we can get ANY data from SSR.
    const URL = 'https://my.tretyakov.ru/?lang=en';
    
    try {
        const response = await axios.get(URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (response.data.includes('__NEXT_DATA__')) {
            console.log('✅ Found __NEXT_DATA__ on Home!');
            const match = response.data.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
            if (match) {
                const json = JSON.parse(match[1]);
                // Maybe we can find the API endpoint structure in the build manifest or something?
                console.log('Build ID:', json.buildId);
            }
        }
    } catch (e) {
        console.log('Home page error:', e.message);
    }
})();
