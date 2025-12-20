/**
 * Fetch real gallery images from official websites
 * Uses Playwright to extract OG images or main images from each gallery's homepage
 * Then uploads to R2 as WebP
 * 
 * Usage: npx tsx scripts/fetch-real-gallery-images.ts
 */

import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import { uploadToR2 } from './upload-r2';

const galleries = [
    { id: 'tate-liverpool', name: 'Tate Liverpool', url: 'https://www.tate.org.uk/visit/tate-liverpool', r2Key: 'galleries/tate-liverpool/building.webp' },
    { id: 'tate-st-ives', name: 'Tate St Ives', url: 'https://www.tate.org.uk/visit/tate-st-ives', r2Key: 'galleries/tate-st-ives/building.webp' },
    { id: 'ashmolean-museum', name: 'Ashmolean Museum', url: 'https://www.ashmolean.org/', r2Key: 'galleries/ashmolean/building.webp' },
    { id: 'fitzwilliam-museum', name: 'Fitzwilliam Museum', url: 'https://www.fitzmuseum.cam.ac.uk/', r2Key: 'galleries/fitzwilliam/building.webp' },
    { id: 'scottish-national-gallery', name: 'Scottish National Gallery', url: 'https://www.nationalgalleries.org/visit/scottish-national-gallery', r2Key: 'galleries/scottish-national/building.webp' },
    { id: 'royal-academy', name: 'Royal Academy of Arts', url: 'https://www.royalacademy.org.uk/', r2Key: 'galleries/royal-academy/building.webp' },
    { id: 'wallace-collection', name: 'Wallace Collection', url: 'https://www.wallacecollection.org/', r2Key: 'galleries/wallace/building.webp' },
    { id: 'serpentine-gallery', name: 'Serpentine Galleries', url: 'https://www.serpentinegalleries.org/', r2Key: 'galleries/serpentine/building.webp' },
    { id: 'dulwich-picture-gallery', name: 'Dulwich Picture Gallery', url: 'https://www.dulwichpicturegallery.org.uk/', r2Key: 'galleries/dulwich/building.webp' },
    { id: 'courtauld-gallery', name: 'Courtauld Gallery', url: 'https://courtauld.ac.uk/gallery/', r2Key: 'galleries/courtauld/building.webp' },
    { id: 'whitechapel-gallery', name: 'Whitechapel Gallery', url: 'https://www.whitechapelgallery.org/', r2Key: 'galleries/whitechapel/building.webp' },
    { id: 'manchester-art-gallery', name: 'Manchester Art Gallery', url: 'https://manchesterartgallery.org/', r2Key: 'galleries/manchester/building.webp' },
    { id: 'walker-art-gallery', name: 'Walker Art Gallery', url: 'https://www.liverpoolmuseums.org.uk/walker-art-gallery', r2Key: 'galleries/walker/building.webp' },
    { id: 'scottish-national-gallery-modern-art', name: 'Scottish National Gallery of Modern Art', url: 'https://www.nationalgalleries.org/visit/scottish-national-gallery-of-modern-art', r2Key: 'galleries/sngma/building.webp' }
];

const TEMP_DIR = './temp-gallery-images';

async function extractImageUrl(page: Page): Promise<string | null> {
    // Try multiple selectors to find the best image
    const selectors = [
        // OG image (most reliable for representative images)
        'meta[property="og:image"]',
        'meta[name="og:image"]',
        // Twitter card image
        'meta[name="twitter:image"]',
        'meta[property="twitter:image"]',
        // Schema.org image
        'meta[itemprop="image"]',
        // Fallback: large hero images
        'img.hero-image',
        'img.banner-image',
        '.hero img',
        '.banner img',
        'header img',
        'main img[src*="hero"]',
        'main img[src*="banner"]',
        'main img[src*="building"]',
    ];

    for (const selector of selectors) {
        try {
            if (selector.startsWith('meta')) {
                const content = await page.$eval(selector, (el) => el.getAttribute('content'));
                if (content && content.startsWith('http')) {
                    return content;
                }
            } else {
                const src = await page.$eval(selector, (el) => (el as HTMLImageElement).src);
                if (src) {
                    return src;
                }
            }
        } catch {
            // Selector not found, try next
        }
    }

    // Last resort: find any large image
    try {
        const images = await page.$$eval('img', (imgs) =>
            imgs
                .filter(img => img.naturalWidth > 400 && img.naturalHeight > 300)
                .map(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight }))
                .sort((a, b) => (b.width * b.height) - (a.width * a.height))
        );
        if (images.length > 0) {
            return images[0].src;
        }
    } catch {
        // No images found
    }

    return null;
}

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    fs.unlinkSync(dest);
                    return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
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
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function processImage(inputPath: string, outputPath: string): Promise<void> {
    await sharp(inputPath)
        .resize(800, 600, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(outputPath);
}

async function main() {
    console.log('='.repeat(60));
    console.log('  Fetch Real Gallery Images from Official Websites');
    console.log('='.repeat(60));

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const results: { gallery: string; success: boolean; url?: string; error?: string }[] = [];

    for (const gallery of galleries) {
        console.log(`\n[${gallery.name}]`);
        console.log(`  URL: ${gallery.url}`);

        const page = await context.newPage();

        try {
            await page.goto(gallery.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000); // Wait for dynamic content

            const imageUrl = await extractImageUrl(page);

            if (!imageUrl) {
                console.log('  ✗ No image found');
                results.push({ gallery: gallery.name, success: false, error: 'No image found' });
                await page.close();
                continue;
            }

            console.log(`  Found image: ${imageUrl.substring(0, 80)}...`);

            // Download
            const extension = imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
            const tempFile = path.join(TEMP_DIR, `${gallery.id}-original.${extension}`);
            const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

            console.log('  Downloading...');
            await downloadFile(imageUrl, tempFile);

            // Convert to WebP
            console.log('  Converting to WebP...');
            await processImage(tempFile, webpFile);

            // Upload to R2
            console.log('  Uploading to R2...');
            await uploadToR2(webpFile, gallery.r2Key, 'image/webp');

            const publicUrl = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${gallery.r2Key}`;
            console.log(`  ✓ Done: ${publicUrl}`);

            results.push({ gallery: gallery.name, success: true, url: publicUrl });

            // Cleanup
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(webpFile)) fs.unlinkSync(webpFile);

        } catch (error) {
            console.log(`  ✗ Failed: ${(error as Error).message}`);
            results.push({ gallery: gallery.name, success: false, error: (error as Error).message });
        }

        await page.close();
    }

    await browser.close();

    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n  ✓ Successful: ${successful.length}`);
    successful.forEach(r => console.log(`    - ${r.gallery}: ${r.url}`));

    if (failed.length > 0) {
        console.log(`\n  ✗ Failed: ${failed.length}`);
        failed.forEach(r => console.log(`    - ${r.gallery}: ${r.error}`));
    }

    // Output code to update exhibitions.js
    console.log('\n\n// Code to update exhibitions.js representativeImage:');
    successful.forEach(r => {
        const galleryId = galleries.find(g => g.name === r.gallery)?.id;
        console.log(`// ${galleryId}: "${r.url}"`);
    });
}

main().catch(console.error);
