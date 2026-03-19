import fetch from 'node-fetch';

const BASE_URL = 'https://collection.nationalmuseum.se';

async function countItems(filterId, name) {
    const listUrl = `${BASE_URL}/_next/data/m_Ge927LpOLHuystKX3to/en/collection.json?lng=en&f=${filterId}&v=2`;
    try {
        const response = await fetch(listUrl, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const data = await response.json();
        let ids = [];
        if (data.pageProps && data.pageProps.collections) {
             data.pageProps.collections.forEach(c => {
                 if (c.OclObjectRef && c.OclObjectRef.Items) {
                     c.OclObjectRef.Items.forEach(item => {
                         if (item.ReferencedId) {
                             ids.push(item.ReferencedId);
                         }
                     });
                 }
             });
        }
        ids = [...new Set(ids)];
        console.log(`Filter ${filterId} (${name}): Found ${ids.length} items`);
    } catch (e) {
        console.error(`Filter ${filterId} error:`, e.message);
    }
}

async function main() {
    await countItems('5006', '19th Century Paintings');
    await countItems('3011', 'Tessin Collection');
    await countItems('4002', 'Miniatures');
}

main();
