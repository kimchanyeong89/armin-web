const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio'); // Need to install cheerio or use regex

// Configuration
const BASE_URL = "https://www.artmuseumonline.org/infoplat";
const CHANNEL_ID = "zlgz_gz_gqjs_zgh,zlgz_gz_gqjs_bh,zlgz_gz_gqjs_yh,zlgz_gz_gqjs_bh,zlgz_gz_gqjs_sy,zlgz_gz_gqjs_lhh,zlgz_gz_gqjs_sf,zlgz_gz_gqjs_qt";
const OUTPUT_FILE = path.join(__dirname, '../public/data/namoc-collection.json');

const CATEGORY_MAP = {
    "版画": "Print",
    "油画": "Oil Painting",
    "中国画": "Chinese Painting",
    "国画": "Chinese Painting",
    "雕塑": "Sculpture",
    "水彩": "Watercolor",
    "水彩画": "Watercolor",
    "素描": "Drawing",
    "书法": "Calligraphy",
    "年画": "New Year Picture",
    "连环画": "Comic Strip",
    "宣传画": "Poster",
    "漆画": "Lacquer Painting",
    "综合材料": "Mixed Media",
    "其他": "Other"
};

const CHANNEL_MAP = {
    "zlgz_gz_gqjs_zgh": "Chinese Painting",
    "zlgz_gz_gqjs_bh": "Print",
    "zlgz_gz_gqjs_yh": "Oil Painting",
    "zlgz_gz_gqjs_ds": "Sculpture",
    "zlgz_gz_gqjs_sf": "Calligraphy",
    "zlgz_gz_gqjs_sy": "Watercolor",
    "zlgz_gz_gqjs_lhh": "Comic Strip",
    "zlgz_gz_gqjs_qt": "Other",
    "zlgz_gz_gqjs_mj": "Folk Art"
};

async function fetchWithRetry(url, options = {}, retries = 3) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return await response.text();
        }
    } catch (error) {
        if (retries > 0) {
            // console.log(`Retry ${retries} for ${url}`);
            await new Promise(res => setTimeout(res, 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

// Helper to get siteId
async function getSiteId() {
    try {
        const html = await fetchWithRetry("https://www.artmuseumonline.org/art/art/zlgz/gz/gzjp/index.html");
        const match = html.match(/var global_siteId\s*=\s*"([^"]+)"/);
        if (match) return match[1];
    } catch (e) { }

    // Fallback: Check local file
    try {
        if (fs.existsSync('namoc.html')) {
            const html = fs.readFileSync('namoc.html', 'utf8');
            const match = html.match(/var global_siteId\s*=\s*"([^"]+)"/);
            if (match) return match[1];
        }
    } catch (e) { }

    return "8a7aefb7675998ef016759a27f670002"; // Fallback guess
}

(async () => {
    // 1. Get Site ID
    let siteId = await getSiteId();
    console.log(`🔑 Site ID: ${siteId}`);

    const collected = [];
    let page = 1;
    let totalItems = 0;
    const pageSize = 20;

    // Loop until we collect all items or hit a safety break
    while (true) {
        const formData = new URLSearchParams();
        formData.append('searchText', '');
        formData.append('currentPage', page);
        formData.append('pageSize', pageSize);
        formData.append('channelId', CHANNEL_ID);
        formData.append('keyword', '');
        formData.append('fromwhere', '');
        if (siteId) formData.append('siteId', siteId);

        const url = `${BASE_URL}/reception/search/search!searchCollectionForArt.json?tm=${Date.now()}`;

        try {
            console.log(`📄 Scraping page ${page}...`);
            const data = await fetchWithRetry(url, {
                method: 'POST',
                body: formData,
            });

            if (page === 1) {
                totalItems = data.total || 0;
                console.log(`🔢 Total items available: ${totalItems}`);
            }

            const items = data.datas || [];
            if (items.length === 0) {
                console.log("   No more items found. Stopping.");
                break;
            }
            console.log(`   Found ${items.length} items on page ${page}`);

            for (const item of items) {
                // Fetch full details
                const detailUrl = `${BASE_URL}/reception/log/front-article!findPublishedById.json?map.articleId=${item.ID}&tm=${Date.now()}`;

                try {
                    const detailData = await fetchWithRetry(detailUrl, { method: 'GET' });

                    // Extract Category/Medium
                    // Priority: 1. Keyword Map, 2. Channel Map, 3. Raw Keyword, 4. "Artwork"
                    const rawKeyword = detailData.keyword || item.KEYWORD || "";
                    const channelCode = detailData.channelCode || item.channelCode || "";

                    let mappedCategory = CATEGORY_MAP[rawKeyword];
                    if (!mappedCategory && channelCode) {
                        mappedCategory = CHANNEL_MAP[channelCode];
                    }
                    if (!mappedCategory) mappedCategory = rawKeyword || "Artwork";

                    // Handle special cases
                    if (rawKeyword === "皮影") mappedCategory = "Shadow Puppetry";


                    // Construct Source URL
                    let sourceUrl = `https://www.artmuseumonline.org/${detailData.publishPath || item.publishPath}${detailData.publishFileName || item.publishFileName}`;

                    let dimensions = "";
                    let creationDate = "";

                    if (sourceUrl && !sourceUrl.includes("undefined")) {
                        if (!sourceUrl.includes("org//")) sourceUrl = sourceUrl.replace("org/", "org//");
                        try {
                            // Fetch HTML for metadata extraction
                            const html = await fetchWithRetry(sourceUrl);

                            // 1. Dimensions (尺寸)
                            // Pattern: "尺寸：100x200cm" or similar.
                            // The sample page (Step 807) didn't show it, but often it's in table or div.
                            // Regex for "Size: ..." or "Dimensions: ..." in Chinese
                            const dimMatch = html.match(/(?:尺寸|规格)[:：]\s*([^\s<"]+)/);
                            if (dimMatch) dimensions = dimMatch[1];

                            // 2. Date (年代)
                            const dateMatch = html.match(/(?:创作年代|年代)[:：]\s*([^\s<"]+)/);
                            if (dateMatch) {
                                creationDate = dateMatch[1];
                            }

                            // If still empty, try to find YYYY in summary
                            if (!creationDate) {
                                const yearMatch = (detailData.summary || "").match(/(19\d{2}|20\d{2})年/);
                                if (yearMatch) creationDate = yearMatch[1];
                            }

                        } catch (htmlErr) {
                            // console.warn(`   Failed to fetch HTML or parse: ${htmlErr.message}`);
                        }
                    }

                    const extracted = {
                        id: item.ID,
                        title: item.TITLE,
                        artist: item.SUB_TITLE,
                        image: item.SLICE_PATH ? `https://www.artmuseumonline.org/${item.SLICE_PATH}preview.jpg` : null,

                        description: detailData.CONTENT || detailData.SUMMARY || '',
                        date: creationDate || (detailData.PUBLISH_DATE ? detailData.PUBLISH_DATE.substring(0, 4) : ""),
                        // Use category for medium if medium is empty
                        medium: detailData.AUTHOR || mappedCategory || "",
                        category: mappedCategory,
                        dimensions: dimensions,
                        sourceUrl: sourceUrl, // Rename/Add standard field
                        msg: "Updated with sourceUrl", // Debug marker

                        raw: detailData
                    };
                    collected.push(extracted);
                } catch (e) {
                    console.error(`   Failed detail for ${item.TITLE}: ${e.message}`);
                    collected.push({
                        id: item.ID,
                        title: item.TITLE,
                        artist: item.SUB_TITLE,
                        image: item.SLICE_PATH ? `https://www.artmuseumonline.org/${item.SLICE_PATH}preview.jpg` : null,
                        category: mappedCategory || "Artwork",
                        link: item.LINK_URL || "", // Generic fallback
                        raw: item
                    });
                }
            }

            page++;
            if (page > Math.ceil(totalItems / pageSize) + 2) break;
            if (page > 50) break;

        } catch (e) {
            console.error(`Error on page ${page}:`, e);
            break;
        }
    }

    console.log(`✅ Collected ${collected.length} items. Saving to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected, null, 2));

})();
