const axios = require('axios');

(async () => {
    // Try to list ALL compilations to see if we can find a "Masterpieces" one
    // The main page had a block "big-masterpiece-name"
    
    const url = 'https://my.tretyakov.ru/api/compilation/items/?show_on_main=y&page_size=50&lang=en&sort=index&order=asc';
    
    try {
        const response = await axios.get(url);
        if (response.data && response.data.data && response.data.data.items) {
            console.log(`Found ${response.data.data.items.length} compilations.`);
            response.data.data.items.forEach(c => {
                console.log(`[${c.id}] ${c.name} (Count: ${c.count})`);
            });
        }
    } catch (e) {
        console.error(e.message);
    }
})();
