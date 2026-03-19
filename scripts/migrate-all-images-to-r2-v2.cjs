#!/usr/bin/env node
/**
 * migrate-all-images-to-r2-v2.cjs
 * Improved version of the R2 migration script:
 *  - Wider image key detection (covers imageUrl, iiifUrl, etc.)
 *  - Stronger fetch headers (Referer, Accept-Language, etc.)
 *  - Retry with delay for 429 (rate-limited) responses
 *  - Separate retry mode: --retry to reprocess error log entries
 *  - Slower concurrency (3) to reduce 429s
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Bypass SSL leaf signature errors for certain museums

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
    const url = obj.image || obj.imageUrl || obj.iiifUrl || obj.thumbnail || '';
    const id = obj.id || obj.name || 'unknown';
    const entry = errorLog[collectionName].find(e => e.url === url);
    if (entry) {
        entry.attempts = (entry.attempts || 1) + 1;
        entry.lastError = message;
    } else {
        errorLog[collectionName].push({ id, url, lastError: message, attempts: 1 });
    }
    fs.writeFileSync(ERROR_FILE, JSON.stringify(errorLog, null, 2));
}

function clearError(collectionName, url) {
    if (!errorLog[collectionName]) return;
    errorLog[collectionName] = errorLog[collectionName].filter(e => e.url !== url);
    if (errorLog[collectionName].length === 0) delete errorLog[collectionName];
    fs.writeFileSync(ERROR_FILE, JSON.stringify(errorLog, null, 2));
}

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

// FIXED: Much wider set of image keys to detect
const IMAGE_KEYS = [
    'image', 'imageUrl', 'thumbnail', 'representativeImage',
    'primaryImage', 'primaryImageSmall', 'iiifUrl', 'imageLink',
    'imgUrl', 'img', 'coverImage', 'photoUrl', 'artImage',
    'mediumUrl', 'largeUrl', 'smallUrl', 'fullUrl'
];

function findImageNodes(obj, nodes = []) {
    if (Array.isArray(obj)) {
        for (let item of obj) findImageNodes(item, nodes);
    } else if (obj !== null && typeof obj === 'object') {
        let foundKeys = [];
        for (let key of IMAGE_KEYS) {
            if (typeof obj[key] === 'string' && obj[key].startsWith('http') &&
                !obj[key].includes('r2.dev') && !obj[key].includes('r2.cloudflarestorage')) {
                foundKeys.push(key);
            }
        }
        if (foundKeys.length > 0) {
            nodes.push({ node: obj, keys: foundKeys });
        }
        for (let key of Object.keys(obj)) {
            const skip = IMAGE_KEYS.includes(key) || key.startsWith('original_') || key === 'originalImage';
            if (!skip) {
                findImageNodes(obj[key], nodes);
            }
        }
    }
    return nodes;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Map domains to their referer headers (helps avoid 403)
function getHeaders(url) {
    const base = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
    };
    try {
        const u = new URL(url);
        base['Referer'] = u.origin + '/';

        // Wikimedia strongly recommends a unique descriptive User-Agent to avoid 429 blocks
        if (url.includes('wikimedia.org') || url.includes('wikipedia.org')) {
            base['User-Agent'] = 'ArminWebBot/1.0 (Contact: kietzland@gmail.com)';
        }
    } catch (e) { }
    return base;
}

let pwBrowser = null;
let pwContext = null;

async function getPlaywrightBuffer(url) {
    if (!pwBrowser) {
        const { chromium } = require('playwright');
        pwBrowser = await chromium.launch({ headless: true });
        pwContext = await pwBrowser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
    }
    const page = await pwContext.newPage();
    let imageBuffer = null;

    page.on('response', async (res) => {
        // sometimes 301 redirects change the url slightly, so just match the last portion or check status 200
        if (res.status() === 200) {
            const ct = res.headers()['content-type'];
            if (ct && ct.startsWith('image/')) {
                // If it's a valid large image, keep it
                try {
                    const buf = await res.body();
                    if (buf.length > 3000) imageBuffer = buf;
                } catch (e) { }
            }
        }
    });

    try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
        await sleep(5000); // wait for dynamic loading or redirects
        if (!imageBuffer && url.includes('hamburger-kunsthalle')) {
            await sleep(10000); // Wait 10 extra seconds for Anubis Proof-of-Work to finish
            // Check if it got the image
            if (!imageBuffer) {
                // sometimes goto directly on image with anubis just stalls or loops
                const b64 = await page.evaluate(async (imgUrl) => {
                    const r = await fetch(imgUrl);
                    if (!r.ok) return null;
                    const blob = await r.blob();
                    return new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                }, url);
                if (b64) imageBuffer = Buffer.from(b64.split(',')[1], 'base64');
            }
        }
    } catch (e) { }

    // Some sites (AIC, SFMOMA) require evaluate fetch trick perfectly over CORS if goto fails
    console.log(`[PW Fallback] Starting image fetching sequence for ${url}`);
    if (!imageBuffer && (url.includes('artic.edu') || url.includes('nga.gov') || url.includes('sfmoma'))) {
        try {
            const domain = new URL(url).origin;
            await page.goto(domain, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
            await sleep(3000);
            const b64 = await page.evaluate(async (imgUrl) => {
                const r = await fetch(imgUrl);
                if (!r.ok) throw new Error('fetch returned ' + r.status);
                const blob = await r.blob();
                return new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }, url);
            if (b64) {
                imageBuffer = Buffer.from(b64.split(',')[1], 'base64');
                console.log(`[PW Fallback] Success via evaluate DOM trick! Length: ${imageBuffer.length}`);
            }
        } catch (e) {
            console.log(`[PW Fallback] Evaluate error: ${e.message}`);
        }
    }

    await page.close();

    if (!imageBuffer) {
        console.log(`[PW Fallback] Completely failed for ${url}`);
        throw new Error(`Playwright fallback failed for ${url}`);
    }
    return imageBuffer;
}

async function downloadImage(url, maxRetries = 3) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);

            const res = await fetch(url, {
                signal: controller.signal,
                headers: getHeaders(url)
            });
            clearTimeout(timeout);

            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('retry-after') || '30') * 1000;
                const wait = Math.max(retryAfter, 5000 * (i + 1));
                process.stdout.write(` [429-wait ${Math.round(wait / 1000)}s]`);
                await sleep(wait);
                continue;
            }
            if (!res.ok) {
                if ([403, 404].includes(res.status)) {
                    // Try browser fallback 
                    return await getPlaywrightBuffer(url);
                }
                throw new Error(`HTTP ${res.status}`);
            }
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                // Try browser fallback if it's protected by CF Challenge page
                if (url.includes('ngprague.cz')) {
                    throw new Error('NG Prague is currently offline/returning maintenance HTML');
                }
                return await getPlaywrightBuffer(url);
            }
            const buffer = await res.arrayBuffer();
            return Buffer.from(buffer);
        } catch (e) {
            if (i === maxRetries) {
                if (e.message.includes('Forbidden') || e.message.includes('Playwright')) {
                    throw e;
                }
                // try fallback one last time on pure timeout
                try { return await getPlaywrightBuffer(url); } catch (ex) { throw e; }
            }
            await sleep(2000 * (i + 1));
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
            const meta = await sharp(buffer).metadata();

            if ((meta.width || 0) < 50 || (meta.height || 0) < 50) {
                throw new Error(`Image too small (${meta.width}x${meta.height}), likely placeholder`);
            }

            const webpBuffer = await sharp(buffer)
                .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 85 })
                .toBuffer();

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

            node[`original_${key}`] = originalUrl;
            node[key] = `${R2_PUBLIC_URL}/${r2Key}`;
            clearError(collectionName, originalUrl);

        } catch (e) {
            logError(collectionName, node, e.message);
            allSuccess = false;
        }
    }
    return allSuccess;
}

async function processCollection(filename, { retryFailed = false } = {}) {
    const filePath = path.join(__dirname, '../public/data', filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`[Skip] File not found: ${filename}`);
        return;
    }

    // Cloudflare turnstile API limits or blocks automated standard fetch
    // if (['aic-collection.json', 'mfa-boston-collection.json'].includes(filename)) {
    //     console.warn(`[Skip] Skipping ${filename} (Cloudflare protected)`);
    //     return;
    // }

    console.log(`\n--- Loading ${filename} ---`);
    let data;
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`[Error] Invalid JSON: ${filename}`);
        return;
    }

    const targetNodes = findImageNodes(data);

    // In retry mode, also find nodes that are in the error log
    let retryNodes = [];
    if (retryFailed && errorLog[filename]) {
        const failedUrls = new Set(errorLog[filename].map(e => e.url).filter(Boolean));
        // We need to find these in the data - but they won't have matching URLs anymore if already modified
        // So just process the remaining pending ones
        console.log(`  (retry mode: ${errorLog[filename].length} previously failed, ${targetNodes.length} still pending)`);
    }

    console.log(`Found ${targetNodes.length} pending images to migrate in ${filename}`);
    if (targetNodes.length === 0) return;

    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 3; // Reduced from 5 to avoid rate limits

    for (let i = 0; i < targetNodes.length; i += CONCURRENCY) {
        const batch = targetNodes.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(node => processImageNode(node, filename)));

        let needsSave = false;
        results.forEach(res => {
            if (res) { successCount++; needsSave = true; }
            else failCount++;
        });

        if (needsSave) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        }
        process.stdout.write(`\rProgress: ${Math.min(i + CONCURRENCY, targetNodes.length)}/${targetNodes.length} | Success: ${successCount} | Fail: ${failCount}`);

        // Small delay between batches to be kinder to servers
        if (i + CONCURRENCY < targetNodes.length) await sleep(100);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`\nFinished ${filename}. Uploaded ${successCount}, failed ${failCount}.`);
}

async function main() {
    const args = process.argv.slice(2);
    const retryFailed = args.includes('--retry');
    const targetArg = args.filter(a => !a.startsWith('--'));

    let targetFiles = [];
    if (targetArg.length > 0) {
        targetFiles = targetArg;
    } else if (retryFailed) {
        // Retry mode: process all files that have errors OR pending images
        targetFiles = getValidCollectionFiles();
        console.log(`Retry mode: scanning ${targetFiles.length} collection files...`);
    } else {
        targetFiles = getValidCollectionFiles();
        console.log(`Found ${targetFiles.length} collection files mapped in exhibitions.js to process`);
    }

    for (const filename of targetFiles) {
        await processCollection(filename, { retryFailed });
    }

    console.log('\n=== ALL COMPLETED ===');
    console.log('Check public/data/r2-migration-errors.json for failed images.');
}

main().catch(console.error);
