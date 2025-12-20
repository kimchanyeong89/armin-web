/**
 * Complete Room-based scraping from National Gallery room pages
 * This adds missing artworks and updates room assignments from the authoritative source
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
import https from 'https';

dotenv.config({ path: '.env.local' });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const S3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
});

const OUTPUT_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');

// All room URLs
const ROOM_URLS: { room: string, url: string }[] = [];
for (let i = 2; i <= 66; i++) {
    ROOM_URLS.push({
        room: String(i),
        url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-${i}`
    });
}
['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => {
    ROOM_URLS.push({
        room: letter,
        url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-0/room-${letter.toLowerCase()}`
    });
});

async function downloadImage(url: string, destPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Referer': 'https://www.nationalgallery.org.uk/'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                resolve(false);
                return;
            }
            const stream = fs.createWriteStream(destPath);
            res.pipe(stream);
            stream.on('finish', () => {
                stream.close();
                resolve(true);
            });
            stream.on('error', () => resolve(false));
        }).on('error', () => resolve(false));
    });
}

async function uploadToR2(filePath: string, key: string): Promise<string> {
    const fileContent = fs.readFileSync(filePath);
    await S3.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: 'image/jpeg',
    }));
    return `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
}

async function imageExistsInR2(key: string): Promise<boolean> {
    try {
        await S3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
        return true;
    } catch {
        return false;
    }
}

async function scrapePaintingDetails(page: any, url: string, room: string): Promise<any | null> {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(500);

        const slug = url.split('/paintings/').pop() || '';

        // Get title
        const title = await page.$eval('h1', (el: any) => el.textContent?.trim()).catch(() => 'Unknown');

        // Get artist
        const artist = await page.$eval('.artist-name, [data-artist], h2 a, .author a',
            (el: any) => el.textContent?.trim()).catch(() => 'Unknown');

        // Get year
        let year = 0;
        const dateText = await page.$eval('.date, [data-date], .painting-date',
            (el: any) => el.textContent?.trim()).catch(() => '');
        const yearMatch = dateText.match(/\d{4}/);
        if (yearMatch) year = parseInt(yearMatch[0]);

        // Get image
        let imageUrl = await page.$eval('img.painting-image, .painting img, [data-image]',
            (el: any) => el.getAttribute('src') || el.getAttribute('data-src')).catch(() => null);

        if (!imageUrl) {
            // Try different selector
            imageUrl = await page.$eval('.image-container img',
                (el: any) => el.getAttribute('src')).catch(() => null);
        }

        if (!imageUrl) {
            console.log(`    No image found for ${slug}`);
            return null;
        }

        if (!imageUrl.startsWith('http')) {
            imageUrl = `https://www.nationalgallery.org.uk${imageUrl}`;
        }

        return {
            id: slug,
            name: title,
            artist: artist,
            year: year,
            imageUrl: imageUrl,
            roomId: room,
            url: url
        };
    } catch (e) {
        return null;
    }
}

async function scrapeRoomPages() {
    // Load existing data
    let data: any = { items: [] };
    if (fs.existsSync(OUTPUT_FILE)) {
        const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
        data = JSON.parse(raw);
    }

    const items: any[] = data.items;
    console.log(`Loaded ${items.length} existing items.`);

    // Create map by ID
    const itemMap = new Map<string, any>();
    items.forEach(item => itemMap.set(item.id, item));

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Handle cookies
    await page.goto('https://www.nationalgallery.org.uk/', { waitUntil: 'domcontentloaded' });
    try {
        const acceptBtn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (acceptBtn) {
            await acceptBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch (e) { }

    let totalAdded = 0;
    let totalUpdated = 0;

    for (const { room, url } of ROOM_URLS) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForTimeout(500);

            const title = await page.title();
            if (title.includes('Page not found') || title.includes('404')) continue;

            // Get all painting URLs
            const paintingUrls = await page.$$eval('a[href*="/paintings/"]', (links: any[]) =>
                [...new Set(links.map(a => a.getAttribute('href'))
                    .filter((href: string) => href && href.includes('/paintings/') && !href.includes('/artists/'))
                    .map((href: string) => href.startsWith('http') ? href : `https://www.nationalgallery.org.uk${href}`)
                )]
            );

            console.log(`Room ${room}: ${paintingUrls.length} paintings`);

            for (const paintingUrl of paintingUrls) {
                const slug = paintingUrl.split('/paintings/').pop();
                if (!slug) continue;

                // Check if we already have this item
                const existing = itemMap.get(slug);

                if (existing) {
                    // Update room if different
                    if (existing.roomId !== room) {
                        existing.roomId = room;
                        totalUpdated++;
                    }
                } else {
                    // New item - need to scrape details
                    const detailPage = await context.newPage();
                    const details = await scrapePaintingDetails(detailPage, paintingUrl, room);
                    await detailPage.close();

                    if (details && details.imageUrl) {
                        // Check if image already in R2
                        const r2Key = `national-gallery/collection/${slug}.jpg`;
                        let r2Url = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${r2Key}`;

                        const exists = await imageExistsInR2(r2Key);
                        if (!exists) {
                            // Download and upload
                            const tempFile = `temp_${Date.now()}.jpg`;
                            const downloaded = await downloadImage(details.imageUrl, tempFile);
                            if (downloaded) {
                                r2Url = await uploadToR2(tempFile, r2Key);
                                fs.unlinkSync(tempFile);
                            }
                        }

                        const newItem = {
                            id: slug,
                            name: details.name,
                            artist: details.artist,
                            year: details.year,
                            image: r2Url,
                            roomId: room,
                            exhibitionName: "European Paintings",
                            exhibitionTitle: "European Paintings",
                            url: paintingUrl
                        };

                        items.push(newItem);
                        itemMap.set(slug, newItem);
                        totalAdded++;
                        console.log(`  Added: ${details.name}`);
                    }
                }
            }

            // Save incrementally
            data.items = items;
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

        } catch (e) {
            continue;
        }
    }

    await browser.close();

    // Final sort
    items.sort((a, b) => {
        const getOrder = (roomId: string) => {
            if (roomId === 'n' || roomId === 'Not on display') return 9999;
            if (/^\d+$/.test(roomId)) return parseInt(roomId, 10);
            if (/^[A-G]$/.test(roomId)) return 1000 + roomId.charCodeAt(0);
            return 9998;
        };
        return getOrder(a.roomId) - getOrder(b.roomId);
    });

    data.items = items;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`Total items now: ${items.length}`);
    console.log(`New items added: ${totalAdded}`);
    console.log(`Rooms updated: ${totalUpdated}`);
}

scrapeRoomPages().catch(console.error);
