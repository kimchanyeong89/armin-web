/**
 * Fetch gallery images from Naver Image Search
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
        searchQuery: 'Scottish National Gallery Edinburgh 건물',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'wallace-collection',
        name: 'Wallace Collection',
        searchQuery: 'Wallace Collection London Hertford House',
        r2Key: 'galleries/wallace/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        searchQuery: 'Manchester Art Gallery 건물 외관',
        r2Key: 'galleries/manchester/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        searchQuery: 'Scottish National Gallery of Modern Art Edinburgh',
        r2Key: 'galleries/sngma/building.webp'
    }
];

const TEMP_DIR = './temp-naver-images';

function downloadImage(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(dest);

        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://search.naver.com/'
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
    console.log('Fetching gallery images via Naver Image Search...\n');

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
            // Go to Naver Image Search
            const searchUrl = `https://search.naver.com/search.naver?where=image&sm=tab_jum&query=${encodeURIComponent(gallery.searchQuery)}`;
            console.log(`  Searching: ${gallery.searchQuery}`);
            await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(3000);

            // Get image URLs from the search results
            const imageUrls = await page.evaluate(() => {
                const imgs = document.querySelectorAll('img.thumb, .photo_tile img, .image_list img, .type_grid img');
                const urls: string[] = [];
                imgs.forEach((img: Element) => {
                    const src = (img as HTMLImageElement).src || (img as HTMLImageElement).getAttribute('data-src');
                    if (src && src.startsWith('http') && !src.includes('static.naver')) {
                        urls.push(src);
                    }
                });
                return urls.slice(0, 5); // Get first 5 candidates
            });

            console.log(`  Found ${imageUrls.length} image candidates`);

            if (imageUrls.length === 0) {
                throw new Error('No image results found');
            }

            // Try to download the first valid image
            let downloaded = false;
            for (const imageUrl of imageUrls) {
                try {
                    console.log(`  Trying: ${imageUrl.substring(0, 60)}...`);

                    const tempFile = path.join(TEMP_DIR, `${gallery.id}-original.jpg`);
                    const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

                    await downloadImage(imageUrl, tempFile);

                    // Verify it's a valid image
                    const stats = fs.statSync(tempFile);
                    if (stats.size < 5000) {
                        fs.unlinkSync(tempFile);
                        continue;
                    }

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

                    downloaded = true;
                    break;
                } catch (e) {
                    console.log(`    Failed: ${(e as Error).message}`);
                }
            }

            if (!downloaded) {
                throw new Error('All image downloads failed');
            }

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
}

main().catch(console.error);
