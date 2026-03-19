#!/usr/bin/env node
/**
 * Mass migration script: Download all artwork images, convert to WebP, and upload to Cloudflare R2
 * Features:
 * - Scans exhibitions.js to find all actively used JSON collection files
 * - Recursively finds `image` properties with absolute URLs not yet on R2
 * - Downloads, checks for placeholder (too small/broken), converts to WebP via sharp
 * - Resizes to max 1600x1600 to save space
 * - Uploads to R2 keeping `originalImage` property intact
 * - Graceful retry and error logging mechanism
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Setup R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

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
    }
});

const ERROR_FILE = path.join(__dirname, '../public/data/r2-migration-errors.json');
let errorLog = {};
if (fs.existsSync(ERROR_FILE)) {
    try { errorLog = JSON.parse(fs.readFileSync(ERROR_FILE, 'utf8')); } catch (e) { }
}

function logError(collectionName, obj, message) {
    if (!errorLog[collectionName]) errorLog[collectionName] = [];
    const url = obj.image;
    const id = obj.id || obj.name || 'unknown';
    const entry = errorLog[collectionName].find(e => e.url === url);
    if (entry) {
        entry.attempts = (entry.attempts || 1) + 1;
        entry.lastError = message;
    } else {
        errorLog[collectionName].push({ id, url, lastError: message, attempts: 1 });
    }
    // Throttled save? We'll save synchronously for accuracy on crash.
    fs.writeFileSync(ERROR_FILE, JSON.stringify(errorLog, null, 2));
}

// Extract valid JSON files from exhibitions.js
function getValidCollectionFiles() {
    const { exhibitions } = require('../src/data/exhibitions.js');
    const files = new Set();
    for (const museum of exhibitions) {
        for (const key of ['permanentExhibitions', 'temporaryExhibitions', 'pastExhibitions']) {
            if (museum[key] && Array.isArray(museum[key])) {
                for (const show of museum[key]) {
                    const fileKey = show.collectionFile || `${show.id}.json`;
                    files.add(fileKey);
                }
            }
        }
    }
    return Array.from(files);
}

// Recursive function to find object nodes and their specific image property keys
function findImageNodes(obj, nodes = []) {
    if (Array.isArray(obj)) {
        for (let item of obj) findImageNodes(item, nodes);
    } else if (obj !== null && typeof obj === 'object') {
        const imageKeys = ['image', 'imageUrl', 'thumbnail', 'representativeImage', 'primaryImage', 'primaryImageSmall'];

        let foundKeys = [];
        for (let key of imageKeys) {
            if (typeof obj[key] === 'string' && obj[key].startsWith('http') &&
                !obj[key].includes('r2.dev') && !obj[key].includes('r2.cloudflarestorage')) {
                foundKeys.push(key);
            }
        }

        if (foundKeys.length > 0) {
            nodes.push({ node: obj, keys: foundKeys });
        }

        // Recursion
        for (let key of Object.keys(obj)) {
            if (!imageKeys.includes(key) && key !== 'originalImage') {
                findImageNodes(obj[key], nodes);
            }
        }
    }
    return nodes;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function downloadImage(url, maxRetries = 2) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            // Bypass simple bot detections
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            };

            const res = await fetch(url, { signal: controller.signal, headers });
            clearTimeout(timeout);

            if (!res.ok) {
                if (res.status === 404) throw new Error(`Not Found (404)`);
                if (res.status === 403) throw new Error(`Forbidden (403)`);
                throw new Error(`HTTP ${res.status}`);
            }

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                throw new Error(`Returned HTML instead of Image`);
            }

            const buffer = await res.arrayBuffer();
            return Buffer.from(buffer);
        } catch (e) {
            if (i === maxRetries) throw e;
            await sleep(1500 * (i + 1));
        }
    }
}

async function processImageNode(item, collectionName) {
    const { node, keys } = item;
    let allSuccess = true;

    for (const key of keys) {
        const originalUrl = node[key];
        try {
            const buffer = await downloadImage(originalUrl);

            // Use sharp to validate, resize and convert to webp
            const meta = await sharp(buffer).metadata();

            // Fast-fail placeholder images (very small or 1x1 tracking pixels)
            if (meta.width < 50 || meta.height < 50) {
                throw new Error(`Image too small (${meta.width}x${meta.height}), likely placeholder`);
            }

            const webpBuffer = await sharp(buffer)
                .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 85 })
                .toBuffer();

            // Upload to R2
            const hash = crypto.createHash('md5').update(originalUrl).digest('hex').substring(0, 8);
            const safeId = String(node.id || node.title || 'img').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
            const colSafe = collectionName.replace('.json', '');
            const r2Key = `artworks/${colSafe}/${safeId}-${hash}-${key}.webp`;

            const command = new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: r2Key,
                Body: webpBuffer,
                ContentType: 'image/webp',
            });

            await s3Client.send(command);

            // Update node cleanly
            node[`original_${key}`] = originalUrl;
            node[key] = `${R2_PUBLIC_URL}/${r2Key}`;

        } catch (e) {
            logError(collectionName, node, e.message);
            allSuccess = false;
        }
    }
    return allSuccess;
}

async function processCollection(filename) {
    const filePath = path.join(__dirname, '../public/data', filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`[Skip] File not found: ${filename}`);
        return;
    }

    // Cloudflare turnstile API limits or blocks automated standard fetch
    if (['aic-collection.json', 'mfa-boston-collection.json'].includes(filename)) {
        console.warn(`[Skip] Skipping ${filename} (Cloudflare protected)`);
        return;
    }

    console.log(`\n--- Loading ${filename} ---`);
    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`[Error] Invalid JSON: ${filename}`);
        return;
    }

    const targetNodes = findImageNodes(data);
    console.log(`Found ${targetNodes.length} pending images to migrate in ${filename}`);

    if (targetNodes.length === 0) return;

    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 5;

    for (let i = 0; i < targetNodes.length; i += CONCURRENCY) {
        const batch = targetNodes.slice(i, i + CONCURRENCY);

        const results = await Promise.all(batch.map(node => processImageNode(node, filename)));

        let needsSave = false;
        results.forEach(res => {
            if (res) { successCount++; needsSave = true; }
            else failCount++;
        });

        // Save periodically to not lose progress on crash
        if (needsSave) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }

        process.stdout.write(`\rProgress: ${Math.min(i + CONCURRENCY, targetNodes.length)}/${targetNodes.length} | Success: ${successCount} | Fail: ${failCount}`);
    }

    // Final save guarantee
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`\nFinished ${filename}. Uploaded ${successCount}, failed ${failCount}.`);
}

async function main() {
    const args = process.argv.slice(2);
    let targetFiles = [];

    if (args.length > 0) {
        targetFiles = args; // Allow manual file passing e.g. "node script.cjs mfa-boston.json"
    } else {
        targetFiles = getValidCollectionFiles();
        console.log(`Found ${targetFiles.length} collection files mapped in exhibitions.js to process`);
    }

    for (const filename of targetFiles) {
        await processCollection(filename);
    }

    console.log('\n=== ALL COMPLETED ===');
    console.log('Check public/data/r2-migration-errors.json for failed images.');
}

main().catch(console.error);
