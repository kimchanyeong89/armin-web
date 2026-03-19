const fs = require('fs');
const cheerio = require('cheerio');
const path = require('path');

async function fetchWithRetry(url, retries = 3) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (error) {
        if (retries > 0) {
            await new Promise(res => setTimeout(res, 1000));
            return fetchWithRetry(url, retries - 1);
        }
        throw error;
    }
}

(async () => {
    const url = "https://www.namoc.cn/namoc/zgh/dc_list.shtml";
    console.log(`Fetching ${url}...`);
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);

    console.log("Page Title:", $('title').text());

    // Convert to absolute URL
    const baseUrl = "https://www.namoc.cn/namoc/zgh/";

    // Find lists containing images or links
    const lists = $('ul');
    console.log(`Found ${lists.length} lists.`);

    lists.each((i, ul) => {
        const cls = $(ul).attr('class') || 'no-class';
        const lis = $(ul).find('li');
        if (lis.length > 0) {
            const firstText = $(lis[0]).text().trim().substring(0, 50);
            console.log(`List ${i} (class: ${cls}): ${lis.length} items. First: "${firstText}"`);

            // Log URLs of first item
            const href = $(lis[0]).find('a').attr('href');
            if (href) console.log(`   Link: ${href}`);
        }
    });

    // Check for page counting script
    const script = $('script:contains("createPageHTML")').html();
    console.log("Pagination Script:", script);
})();
