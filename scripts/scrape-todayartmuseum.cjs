const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/today-art-museum.json');
const BASE_URL = 'http://www.todayartmuseum.com/';
const START_URL = 'http://www.todayartmuseum.com/encollectionworks.aspx?type=collectionsworks&worktype=artname';

async function scrape() {
    console.log('=== Today Art Museum Scraper ===');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const artworks = [];
    let currentPage = 1;
    let hasNext = true;

    while (hasNext) {
        const listUrl = `${START_URL}&page=${currentPage}`;
        console.log(`\nNavigating to List Page ${currentPage}: ${listUrl}`);

        await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        const itemLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll("a[href*='encollectionsworkdetails.aspx']"));
            return links.map(a => a.getAttribute('href'));
        });

        const uniqueLinks = [...new Set(itemLinks)];
        console.log(`  Found ${uniqueLinks.length} items on page ${currentPage}.`);

        if (uniqueLinks.length === 0) {
            console.log('  No items found. Stopping pagination.');
            hasNext = false;
            break;
        }

        for (let i = 0; i < uniqueLinks.length; i++) {
            const relativeLink = uniqueLinks[i];
            const fullLink = new URL(relativeLink, BASE_URL).href;
            console.log(`  [${i + 1}/${uniqueLinks.length}] Scraping ${fullLink}...`);

            try {
                await page.goto(fullLink, { waitUntil: 'domcontentloaded', timeout: 30000 });

                const data = await page.evaluate(() => {
                    let title = '', artist = '', medium = '', dimensions = '', year = '';

                    // Helper: find text after Label in array of elements
                    const findVal = (elements, labels) => {
                        for (const label of labels) {
                            for (const el of elements) {
                                let txt = (el.innerText || '').trim();
                                if (txt.startsWith(label) || txt.includes(label + ':') || txt.includes(label + '：')) {
                                    // Remove label
                                    let val = txt.substring(txt.indexOf(label) + label.length);
                                    val = val.replace(/^[:：]/, '').trim();
                                    return val;
                                }
                            }
                        }
                        return '';
                    };

                    const rightDiv = document.querySelector('.right');
                    let ps = [];
                    if (rightDiv) {
                        ps = Array.from(rightDiv.querySelectorAll('p'));
                        // Specific structure check: Title is usually bold or first line
                        if (!title && ps.length > 0 && !ps[0].innerText.includes(':') && !ps[0].innerText.includes('：')) {
                            title = ps[0].innerText.trim();
                        }
                    }
                    const allPs = Array.from(document.querySelectorAll('p, div, span, td')); // Fallback

                    if (!title) title = findVal(allPs, ['Title', '名称', 'Heading']);

                    artist = findVal(ps.length ? ps : allPs, ['Artist', 'Author', '作者']);
                    medium = findVal(ps.length ? ps : allPs, ['Form', 'Category', 'Medium', '材质', '质地']);
                    dimensions = findVal(ps.length ? ps : allPs, ['Size', 'Dimensions', '尺寸']);
                    year = findVal(ps.length ? ps : allPs, ['Time', 'Year', 'Creation', 'Date', '创作年代', '时间']);

                    // Search fallbacks if empty
                    if (!artist) artist = findVal(allPs, ['Artist', 'Author', '作者']);
                    if (!medium) medium = findVal(allPs, ['Form', 'Category', 'Medium']);
                    if (!dimensions) dimensions = findVal(allPs, ['Size', 'Dimensions']);
                    if (!year) year = findVal(allPs, ['Time', 'Year', 'Creation']);

                    // Cleaning
                    if (dimensions) {
                        // Remove trailing junk
                        if (dimensions.includes('Creation')) dimensions = dimensions.split('Creation')[0].trim();
                        if (dimensions.includes('Time')) dimensions = dimensions.split('Time')[0].trim();
                        if (dimensions.includes('Collection')) dimensions = dimensions.split('Collection')[0].trim();
                        // Remove newlines
                        dimensions = dimensions.split('\n')[0].trim();
                    }
                    if (medium) {
                        if (medium.includes('Creation')) medium = ''; // Garbage
                        medium = medium.split('\n')[0].trim();
                    }
                    if (year) {
                        const m = year.match(/(\d{4})/);
                        if (m) year = m[1];
                    }
                    if (title && title.includes('\n')) title = title.split('\n')[0].trim();
                    if (artist && artist.includes('\n')) artist = artist.split('\n')[0].trim();

                    // Image
                    let imageUrl = '';
                    const imgs = Array.from(document.querySelectorAll("img"));
                    let targetImg = imgs.find(img => img.src.includes('WorkBigImgFile')) ||
                        imgs.find(img => img.src.includes('WorkSmallImgFile')) ||
                        document.querySelector('.imgcontent img') ||
                        document.querySelector('.left img');

                    if (targetImg) {
                        imageUrl = targetImg.src;
                        if (imageUrl.includes('WorkSmallImgFile')) {
                            imageUrl = imageUrl.replace('WorkSmallImgFile', 'WorkBigImgFile');
                        }
                    }

                    if (!imageUrl && !title) return null;

                    return {
                        title: title || 'Untitled',
                        artist: artist || 'Unknown',
                        medium,
                        dimensions,
                        year,
                        image: imageUrl,
                        sourceUrl: document.location.href
                    };
                });

                if (data) {
                    // Proxy Image
                    if (data.image && data.image.startsWith('http://')) {
                        data.image = `https://wsrv.nl/?url=${encodeURIComponent(data.image)}`;
                    }

                    // Categorization Logic
                    let category = data.medium;
                    if (/painting/i.test(data.medium) || /oil/i.test(data.medium) || /ink/i.test(data.medium)) category = 'Painting';
                    else if (/photo/i.test(data.medium)) category = 'Photography';
                    else if (/sculpture/i.test(data.medium)) category = 'Sculpture';
                    else if (/installation/i.test(data.medium)) category = 'Installation';
                    if (!category && data.medium) category = data.medium;

                    if (!category) category = 'Artwork';

                    artworks.push({
                        id: `todayart-${artworks.length + 1}`,
                        title: data.title,
                        artist: data.artist,
                        medium: data.medium,
                        dimensions: data.dimensions,
                        year: data.year,
                        image: data.image,
                        sourceUrl: data.sourceUrl,
                        category: category,
                        museum: "Today Art Museum"
                    });
                }

            } catch (e) {
                console.error(`  Error scraping item: ${e.message}`);
            }

            await new Promise(r => setTimeout(r, 500));
        }

        currentPage++;
        if (currentPage > 20) { hasNext = false; }
    }

    console.log(`\nScraping complete. Collected ${artworks.length} items.`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    await browser.close();
}

scrape();
