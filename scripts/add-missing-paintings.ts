/**
 * Add missing paintings from Room pages to our JSON
 * Uses National Gallery's CDN image URL pattern
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

// Room URLs
const ROOM_URLS: { room: string, url: string }[] = [];
for (let i = 2; i <= 66; i++) {
    ROOM_URLS.push({ room: String(i), url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-${i}` });
}
['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(letter => {
    ROOM_URLS.push({ room: letter, url: `https://www.nationalgallery.org.uk/visiting/floorplans/level-0/room-${letter.toLowerCase()}` });
});

async function downloadImage(url: string, destPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : require('http');
        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Referer': 'https://www.nationalgallery.org.uk/'
            }
        }, (res: any) => {
            if (res.statusCode !== 200) { resolve(false); return; }
            const stream = fs.createWriteStream(destPath);
            res.pipe(stream);
            stream.on('finish', () => { stream.close(); resolve(true); });
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
    } catch { return false; }
}

async function run() {
    let data: any = { items: [] };
    if (fs.existsSync(OUTPUT_FILE)) {
        data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    }
    const items: any[] = data.items;
    console.log(`Loaded ${items.length} existing items.`);

    const itemMap = new Map<string, any>();
    items.forEach(item => itemMap.set(item.id, item));

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Handle cookies
    await page.goto('https://www.nationalgallery.org.uk/', { waitUntil: 'domcontentloaded' });
    try {
        const btn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (btn) await btn.click();
    } catch { }
    await page.waitForTimeout(1000);

    let totalAdded = 0;
    let totalUpdated = 0;

    for (const { room, url } of ROOM_URLS) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForTimeout(500);

            const title = await page.title();
            if (title.includes('Page not found')) continue;

            // Get painting data directly from the page - including image URLs
            const paintings = await page.$$eval('.related-works a.related-works-link, .paintings-list a, .room-paintings a',
                (links: any[]) => links.map(a => {
                    const href = a.getAttribute('href') || '';
                    const img = a.querySelector('img');
                    const imgSrc = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
                    const titleEl = a.querySelector('.title, h3, h4');
                    const artistEl = a.querySelector('.artist, .author');
                    return {
                        href: href,
                        imgSrc: imgSrc,
                        title: titleEl ? titleEl.textContent?.trim() : '',
                        artist: artistEl ? artistEl.textContent?.trim() : ''
                    };
                }).filter(p => p.href.includes('/paintings/'))
            );

            // Also try the search results style cards
            const cards = await page.$$eval('.search-result, .card, article',
                (els: any[]) => els.map(el => {
                    const linkEl = el.querySelector('a[href*="/paintings/"]');
                    if (!linkEl) return null;
                    const href = linkEl.getAttribute('href') || '';
                    const img = el.querySelector('img, .image');
                    const imgSrc = img ? (img.getAttribute('data-square-image-url') || img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
                    const titleEl = el.querySelector('.title, h3, h4');
                    const artistEl = el.querySelector('.artist, .author, .description a');
                    return {
                        href: href,
                        imgSrc: imgSrc,
                        title: titleEl ? titleEl.textContent?.trim() : '',
                        artist: artistEl ? artistEl.textContent?.trim() : ''
                    };
                }).filter(Boolean)
            );

            const allPaintings = [...paintings, ...cards];
            const uniquePaintings = new Map<string, any>();
            allPaintings.forEach(p => {
                if (p && p.href) {
                    const slug = p.href.split('/paintings/').pop()?.split('?')[0];
                    if (slug && !slug.includes('/') && !['explore-the-collection', 'must-sees', 'latest-arrivals', 'picture-of-the-month', 'residency-programmes'].includes(slug)) {
                        uniquePaintings.set(slug, p);
                    }
                }
            });

            if (uniquePaintings.size === 0) continue;
            console.log(`Room ${room}: ${uniquePaintings.size} paintings`);

            for (const [slug, pData] of uniquePaintings) {
                const existing = itemMap.get(slug);

                if (existing) {
                    if (existing.roomId !== room) {
                        existing.roomId = room;
                        totalUpdated++;
                    }
                } else {
                    // New painting - try to get image
                    let imageUrl = pData.imgSrc;
                    if (imageUrl && !imageUrl.startsWith('http')) {
                        imageUrl = `https://www.nationalgallery.org.uk${imageUrl}`;
                    }

                    // Try National Gallery CDN pattern if no image found
                    if (!imageUrl) {
                        // Try common CDN patterns
                        imageUrl = `https://www.nationalgallery.org.uk/media/paintings/${slug}/square_200.jpg`;
                    }

                    const r2Key = `national-gallery/collection/${slug}.jpg`;
                    let r2Url = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${r2Key}`;

                    // Check if already in R2
                    const exists = await imageExistsInR2(r2Key);
                    if (!exists && imageUrl) {
                        const tempFile = `temp_${Date.now()}.jpg`;
                        const downloaded = await downloadImage(imageUrl, tempFile);
                        if (downloaded) {
                            try {
                                r2Url = await uploadToR2(tempFile, r2Key);
                                fs.unlinkSync(tempFile);
                            } catch (e) {
                                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                            }
                        }
                    }

                    const newItem = {
                        id: slug,
                        name: pData.title || slug.replace(/-/g, ' '),
                        artist: pData.artist || 'Unknown',
                        year: 0,
                        image: r2Url,
                        roomId: room,
                        exhibitionName: "European Paintings",
                        exhibitionTitle: "European Paintings",
                        url: `https://www.nationalgallery.org.uk/paintings/${slug}`
                    };

                    items.push(newItem);
                    itemMap.set(slug, newItem);
                    totalAdded++;
                    console.log(`  + ${slug}`);
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
        const getOrder = (r: string) => {
            if (r === 'n' || r === 'Not on display') return 9999;
            if (/^\d+$/.test(r)) return parseInt(r, 10);
            if (/^[A-G]$/.test(r)) return 1000 + r.charCodeAt(0);
            return 9998;
        };
        return getOrder(a.roomId) - getOrder(b.roomId);
    });

    data.items = items;
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));

    console.log(`\n=== Summary ===`);
    console.log(`Total items: ${items.length}`);
    console.log(`Added: ${totalAdded}`);
    console.log(`Updated: ${totalUpdated}`);
}

run().catch(console.error);
