const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');
const { URL } = require('url');

const BASE_URL = "https://www.namoc.cn";
const OUTPUT_FILE = path.join(__dirname, '../public/data/namoc-collection.json');

const CATEGORIES = {
    "zgh": "Chinese Painting",
    "youh": "Oil Painting",
    "banh": "Print",
    "diaos": "Sculpture",
    "smsx": "Drawing",
    "shey": "Photography",
    "scsfsf": "Watercolor",
    "manh": "Comic",
    "lhh": "Comic Strip",
    "qih": "Lacquer Painting",
    "sfzk": "Calligraphy"
};
// Add others if found: 'nianh' (New Year), 'xh' (Poster), 'mjms' (Folk)

async function fetchWithRetry(url, retries = 3) {
    try {
        const response = await fetch(url);
        if (response.status === 404) return null; // End of pages
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (error) {
        if (retries > 0) {
            await new Promise(res => setTimeout(res, 1000 + Math.random() * 2000));
            // console.log(`Retry ${url}`);
            return fetchWithRetry(url, retries - 1);
        }
        // console.error(`Failed to fetch ${url}: ${error.message}`);
        return null;
    }
}

function resolveUrl(base, relative) {
    if (!relative) return "";
    try {
        // Handle weird relative paths like "../"
        // base: https://www.namoc.cn/namoc/zgh/dc_list.shtml
        // relative: ./2020... or 2020...
        // simplest is new URL
        const u = new URL(relative, base);
        return u.href;
    } catch (e) {
        return relative;
    }
}

(async () => {
    const collected = [];
    const seenIds = new Set();

    console.log(`Starting NAMOC (Beijing) Scrape...`);

    for (const [code, catName] of Object.entries(CATEGORIES)) {
        console.log(`\n📂 Scraping Category: ${catName} (${code})...`);

        let page = 0;
        let totalPages = 1; // updated from page 1

        // Loop pages
        while (page < totalPages) {
            // Construct URL
            // Page 0 (Page 1): dc_list.shtml
            // Page 1 (Page 2): dc_list_1.shtml
            let pageName = page === 0 ? "dc_list.shtml" : `dc_list_${page}.shtml`;
            const listUrl = `${BASE_URL}/namoc/${code}/${pageName}`;

            console.log(`   📄 Page ${page + 1}/${totalPages}: ${listUrl}`);
            const html = await fetchWithRetry(listUrl);
            if (!html) {
                console.log("      Page not found or error. Stopping category.");
                break;
            }

            const $ = cheerio.load(html);

            // Extract Total Pages from first page
            if (page === 0) {
                // script: createPageHTML('page_div',84, 1,'dc_list','shtml',1000);
                const script = $('script').text(); // get all script text
                const match = script.match(/createPageHTML\('[^']+',\s*(\d+)/);
                if (match) {
                    totalPages = parseInt(match[1]);
                    console.log(`      Found ${totalPages} pages for ${catName}.`);
                    // Limit for testing/speed if needed? No, user wants all.
                    // But 84 pages * 12 items = 1000 items. Total ~5k items?
                }
            }

            // Process List Items
            const items = $('.dclist li');
            const pageItems = [];

            items.each((i, el) => {
                const $el = $(el);
                const $a = $el.find('a');
                const relLink = $a.attr('href');
                if (!relLink) return;

                const link = resolveUrl(listUrl, relLink);
                const thumb = resolveUrl(listUrl, $el.find('img').attr('src'));
                const title = $el.find('h3').text().trim() || $el.text().split('\n')[0].trim();

                // Extract metadata from list (fallback)
                const text = $el.text();
                let artist = "";
                let date = "";
                let dimensions = "";

                // Try parse <p>
                $el.find('p').each((j, p) => {
                    const t = $(p).text().trim();
                    if (t.includes("作者：")) artist = t.replace("作者：", "").trim();
                    if (t.includes("创作年代：")) date = t.replace("创作年代：", "").trim();
                    if (t.includes("规格：")) dimensions = t.replace("规格：", "").trim();
                });

                // ID from URL (filename)
                const idMatch = link.match(/\/([a-zA-Z0-9]+)\.shtml/);
                const id = idMatch ? idMatch[1] : `namoc-${code}-${page}-${i}`;

                if (seenIds.has(id)) return;
                seenIds.add(id);

                pageItems.push({
                    id, link, thumb, title, artist, date, dimensions, category: catName
                });
            });

            // Fetch Detail Pages in batches
            const batchSize = 10;
            for (let i = 0; i < pageItems.length; i += batchSize) {
                const batch = pageItems.slice(i, i + batchSize);
                await Promise.all(batch.map(async (item) => {
                    try {
                        // console.log(`      Fetching detail: ${item.title}`);
                        const dHtml = await fetchWithRetry(item.link);
                        if (dHtml) {
                            const $d = cheerio.load(dHtml);

                            // High-Res Image
                            // Usually in .content, <img src>
                            // Selector check needed. 
                            // Standard TRS detail: .TRS_Editor img OR .content img
                            let highRes = "";
                            const contentImg = $('.TRS_Editor img, .content img, .detail_content img').first();
                            if (contentImg.length) {
                                highRes = resolveUrl(item.link, contentImg.attr('src'));
                            }

                            // Description
                            // .TRS_Editor text, remove metadata lines?
                            const desc = $('.TRS_Editor, .content, .detail_content').text().trim();
                            // Clean up desc?

                            if (highRes) item.image = highRes;
                            if (desc) item.description = desc;

                            // Better metadata extraction from detail if available?
                            // Usually formatted in fields?
                        }
                    } catch (e) {
                        // ignore detail fail
                    }

                    // Fallback image
                    if (!item.image) item.image = item.thumb;
                }));
            }

            console.log(`      Processed ${pageItems.length} items.`);
            collected.push(...pageItems);

            // Save Progress periodically
            if (collected.length % 50 === 0) {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected.map(mapToArtwork), null, 2));
            }

            page++;
        }
    }

    // Final Save
    console.log(`✅ Collected ${collected.length} items.`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected.map(mapToArtwork), null, 2));

})();

function mapToArtwork(item) {
    return {
        id: item.id,
        title: item.title,
        artist: item.artist,
        date: item.date,
        medium: item.category, // Fallback
        dimensions: item.dimensions,
        description: item.description,
        image: item.image,
        sourceUrl: item.link,
        category: item.category
        // clean up
    };
}
