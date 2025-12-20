/**
 * Script to handle the 4 remaining galleries that failed in the first run
 * Uses direct Wikipedia Commons image URLs
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import sharp from 'sharp';
import { uploadToR2 } from './upload-r2';

// Correctly formatted Wikipedia Commons direct URLs (original, not thumbnails)
const galleries = [
    {
        id: 'scottish-national-gallery',
        name: 'Scottish National Gallery',
        // Original file URL (not /thumb/)
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/National_Gallery_of_Scotland%2C_Edinburgh.jpg',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'wallace-collection',
        name: 'Wallace Collection',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Hertford_House%2C_Manchester_Square%2C_London_W1_-_geograph.org.uk_-_1525640.jpg',
        r2Key: 'galleries/wallace/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Manchester_Art_Gallery.jpg',
        r2Key: 'galleries/manchester/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Scottish_National_Gallery_of_Modern_Art_-_Modern_One_-_Edinburgh.jpg',
        r2Key: 'galleries/sngma/building.webp'
    }
];

const TEMP_DIR = './temp-remaining';

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);

        const request = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    file.close();
                    try { fs.unlinkSync(dest); } catch { }
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
        });

        request.on('error', (err) => {
            try { fs.unlinkSync(dest); } catch { }
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
        .resize(800, 600, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(outputPath);
}

async function main() {
    console.log('Processing 4 remaining galleries...\n');

    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const results: { gallery: string; success: boolean; url?: string; error?: string }[] = [];

    for (const gallery of galleries) {
        console.log(`[${gallery.name}]`);
        console.log(`  URL: ${gallery.imageUrl.substring(0, 80)}...`);

        try {
            const extension = 'jpg';
            const tempFile = path.join(TEMP_DIR, `${gallery.id}-original.${extension}`);
            const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

            console.log('  Downloading...');
            await downloadFile(gallery.imageUrl, tempFile);

            console.log('  Converting to WebP...');
            await processImage(tempFile, webpFile);

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
    }

    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
        try { fs.rmSync(TEMP_DIR, { recursive: true }); } catch { }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\nSuccessful: ${successful.length}`);
    successful.forEach(r => console.log(`  - ${r.gallery}: ${r.url}`));

    if (failed.length > 0) {
        console.log(`\nFailed: ${failed.length}`);
        failed.forEach(r => console.log(`  - ${r.gallery}: ${r.error}`));
    }
}

main().catch(console.error);
