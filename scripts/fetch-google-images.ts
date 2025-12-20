/**
 * Fetch 4 remaining gallery images from Google search results
 * Opens each gallery's Google Image search and extracts the first result
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import { uploadToR2 } from './upload-r2';

const galleries = [
    {
        id: 'scottish-national-gallery',
        name: 'Scottish National Gallery',
        searchQuery: 'Scottish National Gallery Edinburgh building exterior',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'wallace-collection',
        name: 'Wallace Collection',
        searchQuery: 'Wallace Collection Hertford House London building',
        r2Key: 'galleries/wallace/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        searchQuery: 'Manchester Art Gallery Mosley Street building exterior',
        r2Key: 'galleries/manchester/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        searchQuery: 'Scottish National Gallery of Modern Art Edinburgh building',
        r2Key: 'galleries/sngma/building.webp'
    }
];

const TEMP_DIR = './temp-google-images';

function downloadImage(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(dest);

        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'image/*,*/*'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    try { fs.unlinkSync(dest); } catch { }
                    return downloadImage(redirectUrl, dest).then(resolve).catch(reject);
                }
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            try { fs.unlinkSync(dest); } catch { }
            reject(err);
        });
    });
}

async function main() {
    console.log('Fetching 4 remaining gallery images via Google Image Search...\n');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: false }); // Visual mode to bypass bot detection
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const results: { gallery: string; success: boolean; url?: string; error?: string }[] = [];

    for (const gallery of galleries) {
        console.log(`[${gallery.name}]`);
        const page = await context.newPage();

        try {
            // Go to Google Images
            const searchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(gallery.searchQuery)}`;
            console.log(`  Searching: ${gallery.searchQuery}`);
            await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);

            // Click on first image result
            const firstImage = await page.$('div[data-ri="0"] img, img[data-iid]');
            if (!firstImage) {
                throw new Error('No image results found');
            }

            await firstImage.click();
            await page.waitForTimeout(2000);

            // Get the full-resolution image URL from the side panel
            const fullImageUrl = await page.evaluate(() => {
                // Try to find the large preview image
                const selectors = [
                    'img[jsname="kn3ccd"]', // Main preview image
                    'img[data-noaft="1"]',
                    'a[jsname="sTFXNd"] img',
                    'img.sFlh5c',
                    'img.n3VNCb'
                ];

                for (const selector of selectors) {
                    const img = document.querySelector(selector) as HTMLImageElement;
                    if (img && img.src && img.src.startsWith('http') && !img.src.includes('encrypted-tbn')) {
                        return img.src;
                    }
                }

                // Fallback: get highest resolution image on page
                const allImages = Array.from(document.querySelectorAll('img'));
                const validImages = allImages
                    .filter(img => img.src.startsWith('http') && !img.src.includes('encrypted-tbn') && img.naturalWidth > 200)
                    .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));

                return validImages[0]?.src || null;
            });

            if (!fullImageUrl) {
                throw new Error('Could not extract image URL');
            }

            console.log(`  Found: ${fullImageUrl.substring(0, 80)}...`);

            // Download the image
            const tempFile = path.join(TEMP_DIR, `${gallery.id}-original.jpg`);
            const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

            console.log('  Downloading...');
            await downloadImage(fullImageUrl, tempFile);

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

    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
        try { fs.rmSync(TEMP_DIR, { recursive: true }); } catch { }
    }

    // Summary
    console.log('=== SUMMARY ===');
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\nSuccessful: ${successful.length}`);
    successful.forEach(r => console.log(`  ${r.gallery}: ${r.url}`));

    if (failed.length > 0) {
        console.log(`\nFailed: ${failed.length}`);
        failed.forEach(r => console.log(`  ${r.gallery}: ${r.error}`));
    }

    // Output update commands
    console.log('\n\n// Update exhibitions.js with these URLs:');
    successful.forEach(r => {
        const g = galleries.find(g => g.name === r.gallery);
        console.log(`// ${g?.id}: "${r.url}"`);
    });
}

main().catch(console.error);
