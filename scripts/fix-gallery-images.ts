/**
 * Fix Gallery Images - Download correct images from Wikipedia
 * 
 * This script downloads the correct building images for galleries that had
 * Cloudflare waiting room screenshots, and uploads them to R2 storage.
 * 
 * Priority order for sourcing images:
 * 1. Museum homepage logo image
 * 2. Wikipedia images (if homepage is blocked)
 * 3. Search engines (Google, Bing, Naver) for image search
 * 4. Manual capture and verification
 * 
 * Usage: npx tsx scripts/fix-gallery-images.ts
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { uploadToR2 } from './upload-r2';
import sharp from 'sharp';

// Corrected gallery images from Wikipedia Commons (verified URLs)
const galleryImages: { id: string; name: string; imageUrl: string; r2Key: string }[] = [
    {
        id: 'scottish-national-gallery',
        name: 'Scottish National Gallery',
        // Updated URL from Wikipedia (aerial view, 2025-04-19)
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Scottish_National_Gallery_-_aerial_-_2025-04-19_01.jpg',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        // Updated URL from Wikipedia (Modern One exterior by Greg Steadman)
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/64/Modern_One_exterior._Photograph_Greg_Steadman.JPG',
        r2Key: 'galleries/sngma/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        // Updated URL from Wikipedia (geograph.org.uk image)
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Manchester_Art_Gallery_-_geograph.org.uk_-_1748756.jpg',
        r2Key: 'galleries/manchester/building.webp'
    }
];

const TEMP_DIR = './temp-fix-images';

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (response) => {
            // Follow redirects
            if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
                }
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });

        request.on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

async function processImage(inputPath: string, outputPath: string): Promise<void> {
    await sharp(inputPath)
        .resize(1200, 800, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(outputPath);
}

async function main() {
    console.log('='.repeat(60));
    console.log('  Fix Gallery Images - Download from Wikipedia');
    console.log('='.repeat(60));
    console.log('');
    console.log('  Fixing images for:');
    galleryImages.forEach(g => console.log(`    - ${g.name}`));
    console.log('');

    // Create temp directory
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const results: { name: string; success: boolean; url?: string; error?: string }[] = [];

    for (const gallery of galleryImages) {
        console.log(`\n[${gallery.name}]`);
        console.log(`  Source: Wikipedia Commons`);

        const ext = path.extname(gallery.imageUrl).toLowerCase() || '.jpg';
        const tempFile = path.join(TEMP_DIR, `${gallery.id}-original${ext}`);
        const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

        try {
            // Download
            console.log('  📥 Downloading...');
            await downloadFile(gallery.imageUrl, tempFile);

            // Verify file was downloaded and has content
            const stats = fs.statSync(tempFile);
            console.log(`  📦 Downloaded: ${(stats.size / 1024).toFixed(1)} KB`);

            if (stats.size < 1000) {
                throw new Error('Downloaded file is too small, might be an error page');
            }

            // Convert to WebP
            console.log('  🔄 Converting to WebP (1200x800)...');
            await processImage(tempFile, webpFile);

            // Upload to R2
            console.log('  ☁️  Uploading to R2...');
            await uploadToR2(webpFile, gallery.r2Key, 'image/webp');

            const publicUrl = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${gallery.r2Key}`;
            console.log(`  ✅ Done: ${publicUrl}`);

            results.push({ name: gallery.name, success: true, url: publicUrl });

            // Cleanup temp files
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(webpFile)) fs.unlinkSync(webpFile);

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.log(`  ❌ Failed: ${errorMessage}`);
            results.push({ name: gallery.name, success: false, error: errorMessage });

            // Cleanup on error
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(webpFile)) fs.unlinkSync(webpFile);
        }
    }

    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
        try {
            fs.rmdirSync(TEMP_DIR, { recursive: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n  ✅ Successful: ${successful.length}`);
    successful.forEach(r => console.log(`    - ${r.name}`));

    if (failed.length > 0) {
        console.log(`\n  ❌ Failed: ${failed.length}`);
        failed.forEach(r => console.log(`    - ${r.name}: ${r.error}`));
    }

    // Output URLs for exhibitions.js update
    if (successful.length > 0) {
        console.log('\n\n// Updated URLs for exhibitions.js:');
        successful.forEach(r => {
            console.log(`// ${r.name}: "${r.url}"`);
        });
    }

    console.log('\n' + '='.repeat(60));
    console.log('  Image fix process completed!');
    console.log('='.repeat(60));
}

main().catch(console.error);
