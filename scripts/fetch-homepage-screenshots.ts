/**
 * Fetch gallery logos/favicons from official websites
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
        url: 'https://www.nationalgalleries.org/',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'wallace-collection',
        name: 'Wallace Collection',
        url: 'https://www.wallacecollection.org/',
        r2Key: 'galleries/wallace/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        url: 'https://manchesterartgallery.org/',
        r2Key: 'galleries/manchester/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        url: 'https://www.nationalgalleries.org/',
        r2Key: 'galleries/sngma/building.webp'
    }
];

const TEMP_DIR = './temp-logos';

async function main() {
    console.log('Taking screenshots of gallery homepages...\n');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1200, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });

    const results: { gallery: string; success: boolean; url?: string; error?: string }[] = [];

    for (const gallery of galleries) {
        console.log(`[${gallery.name}]`);
        const page = await context.newPage();

        try {
            console.log(`  Loading: ${gallery.url}`);
            await page.goto(gallery.url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);

            // Take a screenshot of the homepage
            const screenshotPath = path.join(TEMP_DIR, `${gallery.id}-screenshot.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(`  Screenshot captured`);

            // Convert to WebP and resize
            const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);
            await sharp(screenshotPath)
                .resize(800, 600, { fit: 'cover', position: 'top' })
                .webp({ quality: 85 })
                .toFile(webpFile);

            // Upload to R2
            console.log('  Uploading to R2...');
            await uploadToR2(webpFile, gallery.r2Key, 'image/webp');

            const publicUrl = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${gallery.r2Key}`;
            console.log(`  ✓ Done: ${publicUrl}\n`);

            results.push({ gallery: gallery.name, success: true, url: publicUrl });

            // Cleanup
            if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
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
