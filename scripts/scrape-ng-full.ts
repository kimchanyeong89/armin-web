/**
 * Full National Gallery Collection Scraper
 * Scrapes all ~2659 artworks with proper metadata and room assignments
 * Uses WebP format with 2400px max size and 85% quality
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
import https from 'https';
import sharp from 'sharp';

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
const MAX_ITEMS = 3000; // Target: 2659

// Image settings
const MAX_IMAGE_SIZE = 2400; // px
const WEBP_QUALITY = 85;

async function downloadImage(url: string, destPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : require('http');
        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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

async function optimizeAndUpload(inputPath: string, id: string): Promise<string | null> {
    const outputPath = `temp_opt_${Date.now()}.webp`;
    try {
        // Convert to WebP with quality settings
        await sharp(inputPath)
            .resize({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toFile(outputPath);

        const key = `national-gallery/collection/${id}.webp`;
        const fileContent = fs.readFileSync(outputPath);

        await S3.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: fileContent,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000',
        }));

        fs.unlinkSync(outputPath);
        return `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
    } catch (e) {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return null;
    }
}

async function imageExistsInR2(slug: string): Promise<string | null> {
    try {
        const key = `national-gallery/collection/${slug}.webp`;
        await S3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
        return `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
    } catch {
        return null;
    }
}

async function scrape() {
    console.log("=== National Gallery Full Collection Scraper ===");
    console.log(`Settings: ${MAX_IMAGE_SIZE}px max, ${WEBP_QUALITY}% WebP quality`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Load existing data if any
    let items: any[] = [];
    const existingIds = new Set<string>();
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
            if (Array.isArray(data.items)) {
                items = data.items;
                items.forEach(i => existingIds.add(i.id));
                console.log(`Loaded ${items.length} existing items.`);
            }
        } catch { }
    }

    console.log("Navigating to collection page...");
    await page.goto('https://www.nationalgallery.org.uk/paintings/explore-the-collection', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    // Handle cookies
    try {
        const cookieBtn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 5000 });
        if (cookieBtn) {
            await cookieBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch { console.log("No cookie dialog."); }

    // Wait for initial results
    await page.waitForSelector('.search-result, .card, article', { timeout: 15000 }).catch(() => { });
    await page.waitForTimeout(2000);

    let retries = 0;
    let processedThisRound = 0;

    while (items.length < MAX_ITEMS && retries < 10) {
        // Get all visible items
        const elements = await page.$$('.search-result, li.search-result');
        console.log(`Visible: ${elements.length} | Saved: ${items.length}`);

        let newItems = 0;

        for (const el of elements) {
            if (items.length >= MAX_ITEMS) break;

            try {
                // Extract data from list item
                const href = await el.$eval('a[href*="/paintings/"]', (a: any) => a.getAttribute('href')).catch(() => '');
                if (!href) continue;

                const slug = href.split('/paintings/').pop()?.split('?')[0] || '';
                if (!slug || existingIds.has(slug)) continue;

                // Extract metadata
                const title = await el.$eval('.title a, h3 a, .name', (e: any) => e.textContent?.trim()).catch(() => 'Unknown');
                const artist = await el.$eval('.description a, .artist, .author', (e: any) => e.textContent?.trim()).catch(() => 'Unknown');

                const dateText = await el.$eval('.data-row, .date', (e: any) => e.textContent?.replace('Date made:', '').trim()).catch(() => '');
                const yearMatch = dateText.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : 0;

                // Room info
                let roomId = 'n';
                const locationText = await el.$eval('.location', (e: any) => e.textContent?.trim()).catch(() => '');
                if (locationText.includes('Room')) {
                    const roomMatch = locationText.match(/Room\s+(\d+)/i);
                    if (roomMatch) roomId = roomMatch[1];
                }

                // Image - try multiple sources
                let imageUrl = await el.$eval('.image', (e: any) =>
                    e.getAttribute('data-square-image-url') || e.getAttribute('data-src') || e.getAttribute('src')
                ).catch(() => null);

                if (!imageUrl) {
                    imageUrl = await el.$eval('img', (e: any) => e.getAttribute('src') || e.getAttribute('data-src')).catch(() => null);
                }

                if (imageUrl && !imageUrl.startsWith('http')) {
                    imageUrl = `https://www.nationalgallery.org.uk${imageUrl}`;
                }

                if (!imageUrl) {
                    console.log(`  Skip ${slug}: no image`);
                    continue;
                }

                // Check if already in R2
                let r2Url = await imageExistsInR2(slug);

                if (!r2Url) {
                    // Download and optimize
                    const tempFile = `temp_dl_${Date.now()}.jpg`;
                    const downloaded = await downloadImage(imageUrl, tempFile);

                    if (downloaded) {
                        r2Url = await optimizeAndUpload(tempFile, slug);
                        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    }
                }

                if (!r2Url) {
                    console.log(`  Skip ${slug}: upload failed`);
                    continue;
                }

                const item = {
                    id: slug,
                    name: title,
                    artist: artist,
                    year: year,
                    image: r2Url,
                    roomId: roomId,
                    exhibitionName: "European Paintings",
                    exhibitionTitle: "European Paintings",
                    url: `https://www.nationalgallery.org.uk/paintings/${slug}`
                };

                items.push(item);
                existingIds.add(slug);
                newItems++;
                console.log(`  [${items.length}] ${title} (Room ${roomId})`);

                // Save every 10 items
                if (items.length % 10 === 0) {
                    const sorted = [...items].sort((a, b) => {
                        const ra = a.roomId === 'n' ? 9999 : (parseInt(a.roomId) || 9998);
                        const rb = b.roomId === 'n' ? 9999 : (parseInt(b.roomId) || 9998);
                        return ra - rb;
                    });
                    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items: sorted }, null, 2));
                }

            } catch (e) {
                // Skip element errors
            }
        }

        processedThisRound += newItems;

        if (newItems === 0) {
            // Try clicking "See more" button
            try {
                const seeMore = await page.$('.see-more-link, button[class*="see-more"]');
                if (seeMore && await seeMore.isVisible()) {
                    console.log("Clicking 'See more'...");
                    await seeMore.click();
                    await page.waitForTimeout(3000);
                    retries = 0;
                    continue;
                }
            } catch { }

            retries++;
            console.log(`No new items (retry ${retries}/10)`);
        } else {
            retries = 0;
        }

        // Scroll to load more
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
    }

    await browser.close();

    // Final sort and save
    items.sort((a, b) => {
        const ra = a.roomId === 'n' ? 9999 : (parseInt(a.roomId) || 9998);
        const rb = b.roomId === 'n' ? 9999 : (parseInt(b.roomId) || 9998);
        return ra - rb;
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ items }, null, 2));

    // Stats
    const roomCounts: Record<string, number> = {};
    items.forEach(i => { roomCounts[i.roomId] = (roomCounts[i.roomId] || 0) + 1; });

    console.log("\n=== COMPLETE ===");
    console.log(`Total items: ${items.length}`);
    console.log(`Displayed (with room): ${items.filter(i => i.roomId !== 'n').length}`);
    console.log(`Not displayed (n): ${items.filter(i => i.roomId === 'n').length}`);
}

scrape().catch(console.error);
