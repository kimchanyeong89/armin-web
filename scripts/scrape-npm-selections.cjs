const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Dynamic import for node-fetch
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const SNO = '03000117'; // Painting category
const BASE_URL = 'https://theme.npm.edu.tw/selection/';
const API_URL = (page) => `${BASE_URL}JasonResult.aspx?lang=2&GetType=1&pageNo=${page}&sno=${SNO}&Key=`;
const OUTPUT_FILE = path.join(__dirname, '../public/data/npm-selection-painting.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/npm-selection-progress.json');

const DELAY = 500;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    console.log('🖼️  Scraping NPM Selections (Painting)...');

    let artworks = [];
    let processedIds = new Set();

    if (fs.existsSync(PROGRESS_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        artworks = data.artworks || [];
        processedIds = new Set(data.processedIds || []);
        console.log(`📥 Resuming... ${artworks.length} artworks already collected.`);
    }

    // Step 1: Get total pages from API (Page 1)
    const res1 = await fetch(API_URL(1));
    const json1 = await res1.json();
    const totalPages = json1.pagesInfo[0]._Pages;
    const totalRecords = json1.pagesInfo[0]._RecordCount;
    console.log(`📊 Total Items: ${totalRecords}, Total Pages: ${totalPages}`);

    // Step 2: Loop pages
    for (let page = 1; page <= totalPages; page++) {
        console.log(`\n📄 Processing Page ${page}/${totalPages}...`);
        try {
            const res = await fetch(API_URL(page));
            const json = await res.json();

            const items = json.ResultList || [];

            for (const item of items) {
                // Parse HTML snippet in 'data'
                const $ = cheerio.load(item.data);
                const link = $('a').attr('href'); // e.g., Article.aspx?sNo=04009118&lang=2
                const imgUrl = $('img').attr('src');
                const titleRaw = $('b').text().trim();
                const artistRaw = $('i').text().replace(titleRaw, '').replace(/^,\s*/, '').trim();
                // e.g., "Pasturing Horses", Han Gan (8th c.), Tang dynasty -> artistRaw might be "Han Gan (8th c.), Tang dynasty" 

                if (!link) continue;

                const id = new URLSearchParams(link.split('?')[1]).get('sNo');

                if (processedIds.has(id)) {
                    process.stdout.write('.');
                    continue;
                }

                // Fetch Detail Page
                const detailUrl = `${BASE_URL}${link}`;
                try {
                    // process.stdout.write(`\n   Fetching ${id}: ${titleRaw}...`);
                    const detailRes = await fetch(detailUrl);
                    const detailHtml = await detailRes.text();
                    const $d = cheerio.load(detailHtml);

                    // Metadata Extraction
                    const period = $d('.SelectionSection .col-l .hd h3').text().trim();
                    const description = $d('.SelectionSection .col-l .mainCont').text().trim().replace(/\s+/g, ' ');

                    // Image Extraction (High Res)
                    // Usually there is <img src="..."> in .channelPic or similar
                    // Step 432 showed: https://theme.npm.edu.tw/selection/att/collection/04009118/17010406.jpg
                    // We can find the img that does NOT start with 'images/icon-' 
                    // and is inside the main area.
                    let fullImage = '';
                    $d('img').each((i, el) => {
                        const src = $(el).attr('src');
                        if (src && src.includes('att/collection') && !src.includes('b_List') && !src.includes('m_')) {
                            fullImage = src;
                        }
                    });
                    // If not found, try constructing from thumb
                    if (!fullImage && imgUrl) {
                        // thumb: .../b_List17010406.jpg
                        // medium: .../m_17010406.jpg
                        // full: .../17010406.jpg
                        const parts = imgUrl.split('/');
                        const filename = parts.pop();
                        const realName = filename.replace('b_List', '').replace('m_', '');
                        // Verify if b_List was present
                        if (filename.includes('b_List')) {
                            fullImage = imgUrl.replace(filename, realName);
                        } else {
                            fullImage = imgUrl;
                        }
                    }

                    if (fullImage && !fullImage.startsWith('http')) {
                        fullImage = `${BASE_URL}${fullImage}`; // Handle relative if any (though example was absolute)
                    }

                    // Refine Artist/Date from "Han Gan (8th c.), Tang dynasty"
                    // We have `period` "Tang dynasty AD618-907"
                    // artistRaw: "Han Gan (8th c.), Tang dynasty"
                    // We can remove period from artistRaw if it overlaps
                    let cleanArtist = artistRaw;
                    // Split by comma
                    const parts = artistRaw.split(',').map(s => s.trim());
                    // "Han Gan (8th c.)"
                    // "Tang dynasty"

                    const artwork = {
                        id,
                        title: titleRaw,
                        artist: parts[0] || 'Unknown',
                        period: period || parts[1] || '',
                        description,
                        imageUrl: fullImage,
                        thumbnailUrl: imgUrl,
                        sourceUrl: detailUrl,
                        category: 'Painting',
                        museum: 'National Palace Museum, Taipei'
                    };

                    artworks.push(artwork);
                    processedIds.add(id);
                    process.stdout.write('+');

                    await sleep(DELAY);

                } catch (e) {
                    console.error(`\n   Error fetching detail ${id}:`, e.message);
                }
            }

            // Save progress per page
            fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ artworks, processedIds: Array.from(processedIds) }, null, 2));

        } catch (e) {
            console.error(`\nError on page ${page}:`, e.message);
        }
    }

    // Final Save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
        museum: 'National Palace Museum, Taipei',
        collection: 'Painting Selections',
        total_count: artworks.length,
        scraped_on: new Date().toISOString(),
        artworks
    }, null, 2));

    console.log(`\n✅ Done! Saved ${artworks.length} artworks to ${OUTPUT_FILE}`);
}

main();
