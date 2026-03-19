const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function scrapeMasp() {
    console.log("Fetching search results...");
    const url = 'https://masp.org.br/en/collections/search?author=&title=&categories%5B%5D=1&categories%5B%5D=3&categories%5B%5D=6&categories%5B%5D=9&categories%5B%5D=10&categories%5B%5D=12';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const links = [];
    $('figure a').each((i, el) => {
        let href = $(el).attr('href');
        if (href && href.includes('/collections/works/')) {
            if (!href.startsWith('http')) href = 'https://masp.org.br' + href;
            links.push(href);
        }
    });

    // remove duplicates
    const uniqueLinks = [...new Set(links)];
    console.log(`Found ${uniqueLinks.length} unique artwork links.`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // concurrency limiting
    const concurrency = 20;

    for (let i = 0; i < uniqueLinks.length; i += concurrency) {
        const batch = uniqueLinks.slice(i, i + concurrency);
        const promises = batch.map(async (link) => {
            try {
                const res = await axios.get(link, { timeout: 15000 });
                const $$ = cheerio.load(res.data);

                const image = $$('.collection-image img, #image-zoom').attr('src');
                if (!image) return null; // skip if no image

                const titleNode = $$('h4.sub-category');
                const titleFull = titleNode.text().split(',')[0].trim();

                let author = 'Unknown';
                let date = '';
                let dimensions = '';
                let medium = '';
                let category = 'Artwork';
                let typeStr = '';
                $$('ul.list-in-paragraph li').each((_, li) => {
                    const text = $$(li).text().trim().replace(/\s+/g, ' ');
                    if (text.startsWith('Author:')) author = text.replace('Author:', '').trim();
                    else if (text.startsWith('Date:')) date = text.replace('Date:', '').trim();
                    else if (text.startsWith('Dimensions:')) dimensions = text.replace('Dimensions:', '').trim();
                    else if (text.startsWith('Medium:')) medium = text.replace('Medium:', '').trim();
                    else if (text.startsWith('Object type:')) typeStr = text.replace('Object type:', '').trim();
                });

                if (typeStr) {
                    if (typeStr.toLowerCase() === 'pintura') category = 'Painting';
                    else if (typeStr.toLowerCase() === 'desenho') category = 'Drawing';
                    else if (typeStr.toLowerCase() === 'escultura') category = 'Sculpture';
                    else if (typeStr.toLowerCase() === 'fotografia') category = 'Photography';
                    else if (typeStr.toLowerCase() === 'gravura') category = 'Print';
                    else category = typeStr;
                }

                // Check if image actually exists (sometimes masp leaves dead links)
                try {
                    await axios.head(image, { timeout: 10000 });
                } catch (imgE) {
                    return null; // Image is broken or 404, omit artwork
                }

                // Use regex to get year
                let yearPattern = /\d{4}/.exec(date);
                let year = yearPattern ? parseInt(yearPattern[0]) : '';

                return {
                    id: link.split('/').pop(),
                    title: titleFull,
                    artist: author,
                    year: year,
                    date: date,
                    image: image,
                    sourceUrl: link,
                    medium: medium,
                    dimensions: dimensions,
                    category: category
                };
            } catch (e) {
                return null;
            }
        });

        const batchResults = await Promise.all(promises);
        batchResults.forEach(r => {
            if (r) {
                results.push(r);
                successCount++;
            } else {
                failCount++;
            }
        });

        process.stdout.write(`\rProgress: ${results.length}/${uniqueLinks.length} (Success: ${successCount}, Fail: ${failCount})`);
    }

    console.log(`\n\nFetched ${results.length} artworks.`);

    const destPath = path.join(__dirname, '../public/data/masp-collection.json');
    fs.writeFileSync(destPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Saved to ${destPath}`);
}

scrapeMasp();
