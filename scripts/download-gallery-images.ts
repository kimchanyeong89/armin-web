/**
 * Download and Upload UK Gallery Building Images
 * 
 * This script downloads building images from Wikipedia Commons
 * and uploads them to R2 storage.
 * 
 * Usage: npx tsx scripts/download-gallery-images.ts
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { uploadToR2 } from './upload-r2';
import sharp from 'sharp';

// Gallery images from Wikipedia Commons (public domain / CC licensed)
// Using direct Wikimedia Commons upload URLs
const galleryImages: { id: string; name: string; imageUrl: string; r2Key: string }[] = [
    {
        id: 'tate-liverpool',
        name: 'Tate Liverpool',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Tate_Liverpool_2020.jpg',
        r2Key: 'galleries/tate-liverpool/building.webp'
    },
    {
        id: 'tate-st-ives',
        name: 'Tate St Ives',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/External_tate_st_ives.jpg',
        r2Key: 'galleries/tate-st-ives/building.webp'
    },
    {
        id: 'ashmolean-museum',
        name: 'Ashmolean Museum',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/89/Ashmolean_Museum%2C_Oxford_%282014%29.JPG',
        r2Key: 'galleries/ashmolean/building.webp'
    },
    {
        id: 'fitzwilliam-museum',
        name: 'Fitzwilliam Museum',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/52/Fitzwilliam_Museum%2C_Cambridge.jpg',
        r2Key: 'galleries/fitzwilliam/building.webp'
    },
    {
        id: 'scottish-national-gallery',
        name: 'Scottish National Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/National_Gallery_of_Scotland%2C_Edinburgh.jpg',
        r2Key: 'galleries/scottish-national/building.webp'
    },
    {
        id: 'royal-academy',
        name: 'Royal Academy of Arts',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/80/Royal_Academy_of_Arts.jpg',
        r2Key: 'galleries/royal-academy/building.webp'
    },
    {
        id: 'wallace-collection',
        name: 'Wallace Collection',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/Wallace_Collection_%28Hertford_House%29.jpg',
        r2Key: 'galleries/wallace/building.webp'
    },
    {
        id: 'serpentine-gallery',
        name: 'Serpentine Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Serpentine_Gallery_2006.jpg',
        r2Key: 'galleries/serpentine/building.webp'
    },
    {
        id: 'dulwich-picture-gallery',
        name: 'Dulwich Picture Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Dulwich_Picture_Gallery_1.jpg',
        r2Key: 'galleries/dulwich/building.webp'
    },
    {
        id: 'courtauld-gallery',
        name: 'Courtauld Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/35/Somerset_House%2C_Strand%2C_London_2.jpg',
        r2Key: 'galleries/courtauld/building.webp'
    },
    {
        id: 'whitechapel-gallery',
        name: 'Whitechapel Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d3/Whitechapel_Art_Gallery_2012.jpg',
        r2Key: 'galleries/whitechapel/building.webp'
    },
    {
        id: 'manchester-art-gallery',
        name: 'Manchester Art Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/fc/Manchester_Art_Gallery.jpg',
        r2Key: 'galleries/manchester/building.webp'
    },
    {
        id: 'walker-art-gallery',
        name: 'Walker Art Gallery',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/79/Walker_Art_Gallery_2012.jpg',
        r2Key: 'galleries/walker/building.webp'
    },
    {
        id: 'scottish-national-gallery-modern-art',
        name: 'Scottish National Gallery of Modern Art',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Scottish_National_Gallery_of_Modern_Art_-_Modern_One_-_Edinburgh.jpg',
        r2Key: 'galleries/sngma/building.webp'
    }
];

const TEMP_DIR = './temp-images';

function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; GalleryImageBot/1.0)'
            }
        }, (response) => {
            // Follow redirects
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
        .resize(1200, 800, { fit: 'cover' })
        .webp({ quality: 85 })
        .toFile(outputPath);
}

async function main() {
    console.log('='.repeat(60));
    console.log('  Download and Upload Gallery Building Images');
    console.log('='.repeat(60));

    // Create temp directory
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const results: { name: string; success: boolean; url?: string }[] = [];

    for (const gallery of galleryImages) {
        console.log(`\n[${gallery.name}]`);

        const tempFile = path.join(TEMP_DIR, `${gallery.id}-original.jpg`);
        const webpFile = path.join(TEMP_DIR, `${gallery.id}.webp`);

        try {
            // Download
            console.log('  Downloading...');
            await downloadFile(gallery.imageUrl, tempFile);

            // Convert to WebP
            console.log('  Converting to WebP...');
            await processImage(tempFile, webpFile);

            // Upload to R2
            console.log('  Uploading to R2...');
            await uploadToR2(webpFile, gallery.r2Key, 'image/webp');

            const publicUrl = `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${gallery.r2Key}`;
            console.log(`  ✓ Done: ${publicUrl}`);

            results.push({ name: gallery.name, success: true, url: publicUrl });

            // Cleanup temp files
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            if (fs.existsSync(webpFile)) fs.unlinkSync(webpFile);

        } catch (error) {
            console.log(`  ✗ Failed: ${(error as Error).message}`);
            results.push({ name: gallery.name, success: false });
        }
    }

    // Cleanup temp directory
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmdirSync(TEMP_DIR, { recursive: true });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`\n  ✓ Successful: ${successful.length}`);
    successful.forEach(r => console.log(`    - ${r.name}`));

    if (failed.length > 0) {
        console.log(`\n  ✗ Failed: ${failed.length}`);
        failed.forEach(r => console.log(`    - ${r.name}`));
    }

    // Output URLs for exhibitions.js update
    console.log('\n\n// URLs for exhibitions.js:');
    successful.forEach(r => {
        console.log(`// ${r.name}: "${r.url}"`);
    });
}

main().catch(console.error);
