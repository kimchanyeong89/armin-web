const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = 'armin-gallery-images';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('Missing R2 credentials in .env.local');
    process.exit(1);
}

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                'Referer': 'https://www.artic.edu/',
                'Accept': 'image/avif,image/webp,*/*;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadImage(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function convertToWebP(buffer) {
    return sharp(buffer)
        .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
}

async function checkExists(key) {
    try {
        await s3Client.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
        return true;
    } catch (error) {
        if (error.name === 'NotFound') return false;
        throw error;
    }
}

async function uploadToR2(buffer, key) {
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
    });
    await s3Client.send(command);
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('=== Uploading AIC Images to R2 ===\n');

    const mainPath = path.join(__dirname, '../public/data/aic-collection.json');
    const items = JSON.parse(fs.readFileSync(mainPath, 'utf8'));

    let totalUploaded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // We process in smaller batches just to keep output clean, but sequentially per image is safer for IIIF servers.
    // Using 3 concurrent downloads max to not hurt AIC's server.
    const limit = 3;
    let running = 0;
    let index = 0;

    console.log(`Loaded ${items.length} works from AIC...`);

    // To speed up we only upload those that are likely actually queried 
    // Let's just go through all of them sequentially
    for (const item of items) {
        if (!item.imageUrl) {
            totalSkipped++;
            continue;
        }
        const rawImg = item.imageUrl;
        // Expected raw image: something like https://www.artic.edu/iiif/2/{id}/full/843,/0/default.jpg
        const match = rawImg.match(/\/iiif\/2\/([^/]+)\//);
        if (!match) {
            totalSkipped++;
            continue;
        }
        const imageId = match[1];
        const key = `aic/${imageId}_900.webp`; // This matches buildAicR2Url in ExhibitionModal.tsx!

        // Check if exists
        try {
            const exists = await checkExists(key);
            if (exists) {
                totalSkipped++;
                if (totalSkipped % 100 === 0) process.stdout.write('s');
                continue;
            }
        } catch (e) { /* ignore */ }

        try {
            // It's IIIF, we can request exactly 900px width from the server to save bandwidth
            const downloadUrl = `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
            const imageBuffer = await downloadImage(downloadUrl);

            const webpBuffer = await convertToWebP(imageBuffer);
            await uploadToR2(webpBuffer, key);

            totalUploaded++;
            process.stdout.write('.');
        } catch (error) {
            totalFailed++;
            process.stdout.write(` x[${error.message}] `);
        }

        await delay(500); // Sleep briefly to respect server
    }

    console.log('\n=== Summary ===');
    console.log(`✓ Uploaded: ${totalUploaded}`);
    console.log(`- Skipped: ${totalSkipped}`);
    console.log(`✗ Failed: ${totalFailed}`);
}

main().catch(console.error);