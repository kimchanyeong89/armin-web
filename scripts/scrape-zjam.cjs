const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CATEGORIES = [
    { id: 14, name: "Chinese Painting" },
    { id: 15, name: "Oil Painting" },
    { id: 46, name: "Watercolor Painting" },
    { id: 16, name: "Engraving" },
    { id: 47, name: "Sketch" },
    { id: 50, name: "Illustration and Cartoon" },
    { id: 51, name: "Folk Painting" },
    { id: 52, name: "Calligraphy and Seal Cutting" },
    { id: 53, name: "Others" }
];

const OUTPUT_FILE = path.resolve(__dirname, '../public/data/zjam-collection.json');

async function scrape() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Block resources to speed up
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const rType = req.resourceType();
        if (['font', 'media'].includes(rType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    let allItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            allItems = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Loaded ${allItems.length} existing items.`);
        } catch (e) {
            console.log('Starting fresh.');
        }
    }

    // Helper to check if item exists
    const exists = (url) => allItems.some(i => i.sourceUrl === url || i.image === url);

    for (const cat of CATEGORIES) {
        console.log(`\n=== Scraping Category: ${cat.name} (ID: ${cat.id}) ===`);
        const url = `https://www.zjam.org.cn/Site_En/Holding/HoldDetail.aspx?classid=${cat.id}`;
        
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        } catch (e) {
            console.error(`Failed to load category ${cat.name}: ${e.message}`);
            continue;
        }

        let currentPage = 1;
        let hasNext = true;

        while (hasNext) {
            console.log(`Processing Page ${currentPage}...`);

            // Extract items on the current page
            const items = await page.evaluate((catId, catName) => {
                const els = document.querySelectorAll('.boxgrid.caption a.single_image');
                const results = [];
                
                els.forEach(el => {
                    const href = el.getAttribute('href');
                    const titleAttr = el.getAttribute('title') || '';
                    const fullUrl = href ? (!href.startsWith('http') ? window.location.origin + href : href) : '';
                    
                    if (!fullUrl) return;

                    // Parse Metadata from title attribute
                    // Format: "Title: Foo <br />Author:Bar <br />Type:Oil<br />Time:1990 <br />Size:10x10cm"
                    const getVal = (key) => {
                        const regex = new RegExp(`${key}:(.*?)(?:<br|$)`, 'i');
                        const match = titleAttr.match(regex);
                        return match ? match[1].trim() : '';
                    };

                    const title = getVal('Title');
                    const author = getVal('Author');
                    const type = getVal('Type');
                    const time = getVal('Time');
                    const size = getVal('Size');

                    results.push({
                        id: `zjam-${catId}-${fullUrl.split('/').pop().replace(/\.\w+$/, '')}-${Math.random().toString(36).substr(2,5)}`,
                        title: title || 'Untitled',
                        artist: author || 'Unknown',
                        date: time,
                        medium: type || catName,
                        dimensions: size.replace(/&#215;/g, 'x'), // Fix encoding artifacts
                        image: fullUrl,
                        sourceUrl: window.location.href,
                        category: catName
                    });
                });
                return results;
            }, cat.id, cat.name);

            console.log(`Found ${items.length} items.`);
            
            let newItemsCount = 0;
            for (const item of items) {
                // Determine uniqueness by Image URL mainly
                if (!allItems.some(existing => existing.image === item.image)) {
                    allItems.push(item);
                    newItemsCount++;
                }
            }
            console.log(`Added ${newItemsCount} new items.`);

            // Save periodically
            if (newItemsCount > 0) {
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
            }

            // Check for next page
            // The pager uses Webdiyer AspNetPager.
            // Look for the "Next" link. It usually has text "Next" or title containing "Next".
            // Selector from HTML: <a class="pages" title="Next" href="javascript:__doPostBack(...)">Next</a>
            // Wait, in HTML provided it was: <a class="pages" title="ת2ҳ" href="...">Next</a> (Chinese charset issue likely)
            // But the text content is "Next".
            
            const nextButton = await page.evaluateHandle(() => {
                const links = Array.from(document.querySelectorAll('#pager a'));
                return links.find(a => a.innerText.trim() === 'Next' || a.innerText.trim() === '>');
            });

            if (nextButton && await nextButton.evaluate(el => !el.getAttribute('disabled'))) {
                console.log('Clicking Next...');
                try {
                     await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                        nextButton.click()
                    ]);
                    currentPage++;
                } catch (navErr) {
                    console.error('Navigation error or timeout:', navErr.message);
                    hasNext = false;
                }
            } else {
                console.log('No next page found or disabled.');
                hasNext = false;
            }
        }
    }

    console.log(`Total collected: ${allItems.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
    console.log('Done.');
    await browser.close();
}

scrape();
