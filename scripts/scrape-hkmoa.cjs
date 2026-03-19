const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const OUTPUT_FILE = path.resolve(__dirname, '../public/data/hkmoa-collection.json');
const BASE_URL = 'https://hk.art.museum';

const COLLECTIONS = [
    { url: '/en/web/ma/collections/chinese-antiquities.html', category: 'Chinese Antiquities' },
    { url: '/en/web/ma/collections/chinese-painting-and-calligraphy.html', category: 'Chinese Painting and Calligraphy' },
    { url: '/en/web/ma/collections/china-trade-art.html', category: 'China Trade Art' },
    { url: '/en/web/ma/collections/modern-and-hong-kong-art.html', category: 'Modern and Hong Kong Art' },
    { url: '/en/web/ma/collections/chih-lo-lou-collection-of-chinese-painting-and-calligraphy.html', category: 'Chih Lo Lou Collection' },
    { url: '/en/web/ma/collections/fuyun-xuan-collection.html', category: 'Fuyun Xuan Collection' },
    { url: '/en/web/ma/collections/ks-lo-collection-of-tea-ware-and-seals.html', category: 'K.S. Lo Collection of Tea Ware' },
    { url: '/en/web/ma/collections/the-jingguanlou-collection.html', category: 'The Jingguanlou Collection' },
    { url: '/en/web/ma/collections/wu-guanzhongs-paintings-and-personal-archives.html', category: 'Wu Guanzhong' },
    { url: '/en/web/ma/collections/xubaizhai-collection-of-chinese-painting-and-calligraphy.html', category: 'Xubaizhai Collection' }
];

async function fetchPage(url) {
    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return await res.text();
    } catch (e) {
        console.error(`Error fetching ${url}:`, e);
        return null;
    }
}

async function scrape() {
    const allItems = [];

    for (const coll of COLLECTIONS) {
        const fullUrl = BASE_URL + coll.url;
        const html = await fetchPage(fullUrl);
        if (!html) continue;

        const $ = cheerio.load(html);
        
        // Map data-index to detailed info
        const detailsMap = {};
        $('#collection-detail-data .collection-item').each((i, el) => {
            const index = $(el).attr('data-index');
            const title = $(el).find('.data-title').text().trim();
            const attribs = $(el).find('.data-attribute li .h5').map((i, e) => $(e).text().trim()).get();
            
            // Heuristic parsing
            let artist = 'Unknown';
            let date = '';
            let medium = '';
            let dimensions = '';

            // Standard order seems to be: Artist, Date, Medium, Dimensions
            // But sometimes fields might be missing.
            
            if (attribs.length >= 4) {
                artist = attribs[0];
                date = attribs[1];
                medium = attribs[2];
                dimensions = attribs[3];
            } else if (attribs.length === 3) {
                 // Try to guess
                 artist = attribs[0];
                 // If 2nd looks like date
                 if (/\d{4}|dated|dynasty|century/i.test(attribs[1])) {
                     date = attribs[1];
                     medium = attribs[2]; // Assume last is medium? Or dimensions?
                 } else {
                     medium = attribs[1];
                     dimensions = attribs[2];
                 }
            } else if (attribs.length > 0) {
                artist = attribs[0]; // Assume first is always artist/period
                if (attribs[1]) date = attribs[1];
            }

            detailsMap[index] = { title, artist, date, medium, dimensions };
        });

        // Parse Grid Items (Images)
        $('.grid-item').each((i, el) => {
            const link = $(el).find('a.collection-popup-toggle');
            const index = link.attr('data-index');
            const imgEl = link.find('img');
            const imgSrc = imgEl.attr('src');
            
            if (!imgSrc || !detailsMap[index]) return;

            const detail = detailsMap[index];
            const fullImgUrl = imgSrc.startsWith('http') ? imgSrc : BASE_URL + imgSrc;

            allItems.push({
                id: `hkmoa-${coll.category.replace(/\s+/g,'')}-${index}`,
                title: detail.title,
                artist: detail.artist,
                date: detail.date,
                medium: detail.medium,
                dimensions: detail.dimensions,
                image: fullImgUrl,
                sourceUrl: fullUrl,
                category: coll.category
            });
        });
        
        console.log(`  Processed category ${coll.category}: Found ${Object.keys(detailsMap).length} details`);
    }

    console.log(`Total collected: ${allItems.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
}

scrape();
