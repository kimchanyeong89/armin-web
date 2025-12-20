/**
 * Fetch gallery images - waits for JS rendering and clicks on images
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { uploadToR2 } from './upload-r2';

const galleries = [
    {
        id: 'scottish-national-gallery',
        name: 'Scottish National Gallery',
        searchQuery: 'Scottish National Gallery',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'wallace-collection',
        name: 'Wallace Collection',
        searchQuery: 'Wallace Collection London',
        r2Key: 'galleries/wallace/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        searchQuery: 'Manchester Art Gallery',
        r2Key: 'galleries/manchester/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        searchQuery: 'Scottish National Gallery of Modern Art',
        r2Key: 'galleries/sngma/building.webp'
    }
];

const TEMP_DIR = './temp-bing-images';

async function main() {
    console.log('Fetching gallery images via Bing Image Search...\n');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const results: { gallery: string; success: boolean; url?: string; error?: string }[] = [];

    for (const gallery of galleries) {
        console.log(`[${gallery.name}]`);
        const page = await context.newPage();

        try {
            // Use Bing Image Search
            const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(gallery.searchQuery)}&form=HDRSC2`;
            console.log(`  Searching: ${gallery.searchQuery}`);
            await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 });
            await page.waitForTimeout(3000);

            // Wait for images to load
            await page.waitForSelector('.mimg, .iusc img, img.mimg', { timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(2000);

            // Click on first image to open detail view
            const firstImage = await page.$('.iusc, .imgpt');
            if (firstImage) {
                await firstImage.click();
                await page.waitForTimeout(2000);
            }

            // Get large image URL from detail panel
            const largeImageUrl = await page.evaluate(() => {
                // Try to find the large image in the detail panel
                const selectors = [
                    '.mainImage img',
                    'img.nofocus',
                    '#mainImageWindow img',
                    '.imgContainer img'
                ];

                for (const sel of selectors) {
                    const img = document.querySelector(sel) as HTMLImageElement;
                    if (img && img.src && img.src.startsWith('http') && img.naturalWidth > 300) {
                        return img.src;
                    }
                }

                // Fallback: get any large enough image
                const allImgs = Array.from(document.querySelectorAll('img'));
                for (const img of allImgs) {
                    if (img.src.startsWith('http') && img.naturalWidth > 350 && img.naturalHeight > 200) {
                        return img.src;
                    }
                }

                return null;
            });

            if (!largeImageUrl) {
                // Take screenshot of search results
                const screenshotPath = path.join(TEMP_DIR, `${gallery.id}-screenshot.png`);
                await page.screenshot({ path: screenshotPath });
                console.log(`  Screenshot saved: ${screenshotPath}`);
                throw new Error('Could not extract image URL. See screenshot.');
            }

            console.log(`  Found: ${largeImageUrl.substring(0, 70)}...`);

            const tempFile = path.join(TEMP_DIR, `${gallery.id}-original.jpg`);
            const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

            // Download using page context to avoid bot detection
            const imageBuffer = await page.evaluate(async (url) => {
                const response = await fetch(url);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return Array.from(new Uint8Array(arrayBuffer));
            }, largeImageUrl);

            fs.writeFileSync(tempFile, Buffer.from(imageBuffer));
            console.log('  Downloaded');

            // Convert to WebP
            console.log('  Converting to WebP...');
            await sharp(tempFile)
                .resize(800, 600, { fit: 'cover' })
                .webp({ quality: 85 })
                .toFile(webpFile);

            // Upload to R2
            console.log('  Uploading to R2...');
            await uploadToR2(webpFile, gallery.r2Key, 'image/webp');

            const publicUrl = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${gallery.r2Key}`;
            console.log(`  ✓ Done: ${publicUrl}\n`);

            results.push({ gallery: gallery.name, success: true, url: publicUrl });

            // Cleanup
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(webpFile)) fs.unlinkSync(webpFile);

        } catch (error) {
            console.log(`  ✗ Failed: ${(error as Error).message}\n`);
            results.push({ gallery: gallery.name, success: false, error: (error as Error).message });
        }

        await page.close();
    }

    await browser.close();

    // Summary
    console.log('\n=== SUMMARY ===');
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\nSuccessful: ${successful.length}`);
    successful.forEach(r => console.log(`  ${r.gallery}: ${r.url}`));

    if (failed.length > 0) {
        console.log(`\nFailed: ${failed.length}`);
        failed.forEach(r => console.log(`  ${r.gallery}: ${r.error}`));
    }
}

main().catch(console.error);
