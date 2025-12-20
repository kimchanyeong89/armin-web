
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
import https from 'https';

// Load environment variables manually since we might run via tsx
dotenv.config({ path: '.env.local' });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error("Missing R2 environment variables");
    process.exit(1);
}

const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');
const MAX_ITEMS = 2000; // Full run target

async function downloadImage(url: string, destPath: string) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.nationalgallery.org.uk/'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
                return;
            }
            const stream = fs.createWriteStream(destPath);
            res.pipe(stream);
            stream.on('finish', () => {
                stream.close();
                resolve(true);
            });
            stream.on('error', reject);
        }).on('error', reject);
    });
}

async function uploadToR2(filePath: string, key: string, contentType = 'image/jpeg') {
    const fileContent = fs.readFileSync(filePath);
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
    });
    await S3.send(command);
    return `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
}

async function scrape() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Start at the search page
    // Note: The search page might use infinite scroll or pagination.
    // For the "Highlights" or specific query, we might need a better URL.
    // Using the general search page logic or listing highlights.
    // For now, let's try to list "paintings" sorted by popularity or just crawl the main collection highlights if possible.
    // Actual Search URL: https://www.nationalgallery.org.uk/paintings/search-the-collection

    console.log("Navigating to collection search...");
    await page.goto('https://www.nationalgallery.org.uk/paintings/search-the-collection', { waitUntil: 'domcontentloaded' });

    // Handle Cookiebot
    try {
        console.log("Waiting for cookie dialog...");
        const acceptBtn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (acceptBtn) {
            console.log("Clicking Accept Cookies...");
            await acceptBtn.click();
            await page.waitForSelector('#CybotCookiebotDialog', { state: 'hidden', timeout: 5000 });
        }
    } catch (e) {
        console.log("Cookie dialog not found or already accepted.");
    }

    // Wait for results to load
    try {
        // The class might be different. Let's try multiple common selectors for this site
        // or just wait for 'picture-card' or similar. 
        // Based on previous knowledge or general structure, it might be .card or article
        await page.waitForSelector('.card, article, .search-results__list-item', { timeout: 10000 });
    } catch (e) {
        console.log("Selectors might be different. Saving debug info...");
        await page.screenshot({ path: 'debug-scraper.png' });
        fs.writeFileSync('debug-scraper.html', await page.content());

        // Try a broader selector to see what we have
        const links = await page.$$eval('a', as => as.map(a => a.href).slice(0, 10));
        console.log("First 10 links on page:", links);
    }

    const items: any[] = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
            const data = JSON.parse(raw);
            if (Array.isArray(data.items)) {
                items.push(...data.items);
                console.log(`Loaded ${items.length} existing items.`);
            }
        } catch (e) { console.error("Could not load existing items", e); }
    }
    const validImageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    // Pure infinite scroll strategy
    let retries = 0;
    let oldItemCount = 0;

    // Initial wait
    try {
        await page.waitForSelector('li.search-result', { timeout: 10000 });
    } catch (e) { console.log("Timeout waiting for initial results"); }

    while (items.length < MAX_ITEMS) {
        const elements = await page.$$('li.search-result');
        console.log(`Visible elements: ${elements.length} | Total Saved: ${items.length}`);

        let newItemsSuccess = 0;

        for (const el of elements) {
            if (items.length >= MAX_ITEMS) break;

            try {
                const href = await el.$eval('.title a', node => node.getAttribute('href')).catch(() => "");

                // Fast dedupe check
                const id = href?.split('/').pop() || "";
                if (!id || items.find(i => i.id === id)) continue;

                // Detailed Processing
                const fullLink = href?.startsWith('http') ? href : `https://www.nationalgallery.org.uk${href}`;
                const title = await el.$eval('.title a', node => node.textContent?.trim()).catch(() => "Unknown");
                const artist = await el.$eval('.description a', node => node.textContent?.trim()).catch(() => "Unknown");

                const dateText = await el.$eval('.data-row', node => node.textContent?.replace('Date made:', '').trim()).catch(() => "");
                const yearMatch = dateText.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : 0;

                let room = "Not on display";
                const locationText = await el.$eval('.location', node => node.textContent?.trim()).catch(() => "");
                if (locationText.includes("Room")) {
                    const roomMatch = locationText.match(/Room\s+(\d+)/);
                    if (roomMatch) room = roomMatch[1];
                }

                let imageUrl = await el.$eval('.image', node => node.getAttribute('data-square-image-url')).catch(() => null);
                if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = `https://www.nationalgallery.org.uk${imageUrl}`;
                }

                if (imageUrl) {
                    const imageExt = '.jpg';
                    const r2Key = `national-gallery/collection/${id}${imageExt}`;
                    const localTemp = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}${imageExt}`;

                    try {
                        console.log(`Downloading ${imageUrl}...`);
                        await downloadImage(imageUrl, localTemp);
                        console.log(`Uploading to ${r2Key}...`);
                        const r2Url = await uploadToR2(localTemp, r2Key, 'image/jpeg');
                        fs.unlinkSync(localTemp);

                        items.push({
                            id: id,
                            name: title,
                            artist: artist,
                            year: year,
                            image: r2Url,
                            roomId: room,
                            exhibitionName: "European Paintings",
                            exhibitionTitle: "European Paintings",
                            url: fullLink
                        });
                        console.log(`Saved: ${title} (Room ${room})`);
                        newItemsSuccess++;

                        // Incremental save
                        const output = { items: items };
                        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

                    } catch (err) {
                        console.error(`Failed to process image for ${title}:`, err);
                    }
                }
            } catch (e) {
                // Ignore element error
            }
        }

        if (newItemsSuccess === 0) {
            console.log(`No new unique items found (Retry ${retries}/5). Checking for 'See more' button...`);

            // Try 'See more' button
            try {
                const seeMoreBtn = await page.$('.see-more-link');
                if (seeMoreBtn && await seeMoreBtn.isVisible()) {
                    console.log("Clicking 'See more' button...");
                    await seeMoreBtn.click();
                    await page.waitForTimeout(4000); // Wait for load
                    retries = 0; // Reset retries on successful click
                    continue;
                }
            } catch (e) { console.log("Button check failed", e); }

            retries++;
            if (retries >= 5) {
                console.log("Stuck. Finishing.");
                break;
            }
        } else {
            console.log(`Found ${newItemsSuccess} new items. Scrolling for more...`);
            retries = 0;
        }

        // After processing, scroll again to trigger more
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(3000);
    }

    // Sort items by Room Number before final save
    items.sort((a, b) => {
        const roomA = a.roomId?.match(/\d+/)?.[0] ? parseInt(a.roomId.match(/\d+/)[0], 10) : 9999;
        const roomB = b.roomId?.match(/\d+/)?.[0] ? parseInt(b.roomId.match(/\d+/)[0], 10) : 9999;
        if (roomA !== roomB) return roomA - roomB;
        return a.roomId.localeCompare(b.roomId);
    });

    const output = {
        items: items
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`Done! Saved ${items.length} items to ${OUTPUT_FILE} (Sorted by Room)`);

    await browser.close();
}

scrape().catch(console.error);
