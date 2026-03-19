
const https = require('https');

const baseUrl = 'https://samlinger.slks.dk/api/es_artworks?museum=Ny%20Carlsberg%20Glyptotek';

async function fetchPage(page) {
    return new Promise((resolve, reject) => {
        https.get(`${baseUrl}&page=${page}`, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    const objectNames = new Set();
    const artTypes = new Set();
    const templates = new Set();
    let count = 0;

    // Fetch first 10 pages
    for (let i = 1; i <= 10; i++) {
        const data = await fetchPage(i);
        if (!data['hydra:member']) break;
        
        data['hydra:member'].forEach(item => {
            if (item.objectNames) item.objectNames.forEach(n => objectNames.add(n));
            if (item.artType) artTypes.add(item.artType); // if it exists
            if (item.objectTemplate) templates.add(item.objectTemplate);
            count++;
        });
        console.log(`Fetched page ${i} ...`);
    }

    console.log(`Analyzed ${count} items.`);
    console.log('Object Names:', Array.from(objectNames).sort());
    console.log('Art Types:', Array.from(artTypes).sort());
    console.log('Templates:', Array.from(templates).sort());
}

main();
