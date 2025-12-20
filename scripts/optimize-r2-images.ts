
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
import https from 'https';
import sharp from 'sharp';

// Load env
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

const JSON_FILE = path.join(process.cwd(), 'public', 'data', 'national-gallery-permanent.json');

async function downloadImage(url: string, destPath: string) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
                return;
            }
            const stream = fs.createWriteStream(destPath);
            res.pipe(stream);
            stream.on('finish', () => {
                stream.close();
                resolve(true);
            });
            stream.on('error', reject);
        }).on('error', reject);
    });
}

async function uploadToR2(filePath: string, key: string, contentType = 'image/webp') {
    const fileContent = fs.readFileSync(filePath);
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000', // Cache for a year
    });
    await S3.send(command);
    return `https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${key}`;
}

async function optimizeItem(item: any, index: number, total: number) {
    if (!item.image || item.image.endsWith('.webp')) {
        return false;
    }

    const id = item.id;
    const originalUrl = item.image;
    const tempInput = `temp_in_${id}_${Date.now()}.jpg`;
    const tempOutput = `temp_out_${id}_${Date.now()}.webp`;

    try {
        console.log(`[${index + 1}/${total}] Downloading ${originalUrl}...`);
        await downloadImage(originalUrl, tempInput);

        // Optimize
        // Resize to max 1600px width/height, convert to webp quality 80
        await sharp(tempInput)
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(tempOutput);

        const newKey = `national-gallery/collection/${id}.webp`;
        console.log(`[${index + 1}/${total}] Uploading to ${newKey}...`);

        const newUrl = await uploadToR2(tempOutput, newKey);

        // Update item
        item.image = newUrl;

        // Cleanup
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);

        return true;

    } catch (e) {
        console.error(`Failed to optimize ${id}:`, e);
        // Cleanup on error
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        return false;
    }
}

async function main() {
    console.log("Starting image optimization...");

    if (!fs.existsSync(JSON_FILE)) {
        console.error("JSON file not found");
        return;
    }

    const raw = fs.readFileSync(JSON_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const items = data.items;

    console.log(`Found ${items.length} items to check.`);

    // Process in batches of 5
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const promises = batch.map((item: any, batchIndex: number) =>
            optimizeItem(item, i + batchIndex, items.length)
        );

        await Promise.all(promises);

        // Save progress every batch
        fs.writeFileSync(JSON_FILE, JSON.stringify({ items: items }, null, 2));
        console.log(`Saved progress up to item ${Math.min(i + batchSize, items.length)}`);
    }

    console.log("Optimization complete!");
}

main().catch(console.error);
