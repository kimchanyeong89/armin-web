const https = require('https');

const BASE_URL = 'https://commons.wikimedia.org/w/api.php';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'ScottishGalleryScraper/1.0 (contact@example.com)'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    // Check if redirect or error page
                    if (res.statusCode >= 400) {
                        console.log('Status code:', res.statusCode);
                        console.log('Body:', data.substring(0, 200));
                        reject(new Error(`Status ${res.statusCode}`));
                        return;
                    }
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.log('Parse error body:', data.substring(0, 200));
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function checkCategory(categoryName) {
    const params = new URLSearchParams({
        action: 'query',
        list: 'categorymembers',
        cmtitle: `Category:${categoryName}`,
        cmlimit: 10,
        format: 'json',
        origin: '*'
    });

    try {
        const data = await fetchJson(`${BASE_URL}?${params}`);
        const count = data.query?.categorymembers?.length || 0;
        console.log(`Category '${categoryName}': found ${count} items (limit 10 checked)`);
        if (count > 0) {
            console.log('Sample item:', data.query.categorymembers[0]);
        }
        return count > 0;
    } catch (e) {
        console.error(`Error checking ${categoryName}:`, e.message);
        return false;
    }
}

(async () => {
    // Probable categories
    const cats = [
        'Paintings_in_the_Scottish_National_Gallery',
        'Paintings_in_the_Scottish_National_Portrait_Gallery',
        'Collections_of_the_Scottish_National_Portrait_Gallery',
        'Collections_of_the_Scottish_National_Gallery_of_Modern_Art',
        'Works_in_the_Scottish_National_Gallery_of_Modern_Art',
        'Paintings_in_the_Scottish_National_Gallery_of_Modern_Art'
    ];

    for (const c of cats) {
        await checkCategory(c);
        await new Promise(r => setTimeout(r, 500));
    }
})();
