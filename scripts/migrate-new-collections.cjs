#!/usr/bin/env node
'use strict';

/**
 * migrate-new-collections.cjs
 * Migration 1: Upload NEW collections that were never processed in V1/V2
 * Uses atomic lock file to prevent duplicates with migration-retry.cjs
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { createHash } = require('crypto');
const sharp = require('sharp');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const BUCKET = 'armin-gallery-images';

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('Missing R2 credentials in .env.local');
    process.exit(1);
}

const R2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const DATA_DIR = path.join(__dirname, '../public/data');
const LOG_FILE = '/tmp/r2-migration-new.log';
const ERROR_FILE = path.join(__dirname, '../public/data/r2-migration-errors.json');
const LOCK_FILE = '/tmp/r2-migration-lock.json';
const CONCURRENCY = 3;

// NEW collections that were never in V1/V2
const NEW_COLLECTIONS = [
    // France
    { file: 'toulouse-lautrec-collection.json', folder: 'artworks/toulouse-lautrec' },
    { file: 'musee-granet-collection.json', folder: 'artworks/musee-granet' },
    { file: 'mamcs-strasbourg-drawings-collection.json', folder: 'artworks/mamcs-strasbourg' },
    { file: 'mamcs-strasbourg-paintings-collection.json', folder: 'artworks/mamcs-strasbourg' },
    { file: 'mamcs-strasbourg-photography-collection.json', folder: 'artworks/mamcs-strasbourg' },
    { file: 'mamcs-strasbourg-graphic-design-collection.json', folder: 'artworks/mamcs-strasbourg' },
    // Spain
    { file: 'caixaforum-collection.json', folder: 'artworks/caixaforum-collection' },
    // Russia
    { file: 'rusmuseum-collection.json', folder: 'artworks/rusmuseum-collection' },
    { file: 'hermitage-highlights.json', folder: 'artworks/hermitage-highlights' },
    { file: 'pushkin-paintings.json', folder: 'artworks/pushkin-paintings' },
    { file: 'kremlin-collection.json', folder: 'artworks/kremlin-collection' },
    { file: 'tretyakov-wikidata.json', folder: 'artworks/tretyakov-wikidata' },
    // Turkey
    { file: 'topkapi-collection.json', folder: 'artworks/topkapi-collection' },
    // Netherlands
    { file: 'mauritshuis-collection.json', folder: 'artworks/mauritshuis-collection' },
    { file: 'kroller-muller-film-video.json', folder: 'artworks/kroller-muller-film-video' },
    { file: 'kroller-muller-photography.json', folder: 'artworks/kroller-muller-photography' },
    // Poland
    { file: 'wawel-collection.json', folder: 'artworks/wawel-collection' },
    // USA
    { file: 'whitney-collection.json', folder: 'artworks/whitney-collection' },
    { file: 'huntington-collection.json', folder: 'artworks/huntington-collection' },
    { file: 'famsf-collections.json', folder: 'artworks/famsf-collections' },
];

const IMAGE_KEYS = ['image', 'imageUrl', 'thumbnail', 'representativeImage', 'primaryImage', 'primaryImageSmall', 'iiifUrl', 'imageLink', 'url'];

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function readErrors() {
    if (!fs.existsSync(ERROR_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(ERROR_FILE, 'utf8')); } catch { return {}; }
}
function writeErrors(errors) {
    fs.writeFileSync(ERROR_FILE, JSON.stringify(errors, null, 2));
}

function acquireLock(fileKey) {
    let lock = {};
    if (fs.existsSync(LOCK_FILE)) {
        try { lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); } catch { }
    }
    if (lock[fileKey]) return false; // Already locked by other migration
    lock[fileKey] = { pid: process.pid, script: 'new', time: Date.now() };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
    return true;
}
function releaseLock(fileKey) {
    if (!fs.existsSync(LOCK_FILE)) return;
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        delete lock[fileKey];
        fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
    } catch { }
}

async function checkR2Exists(key) {
    try {
        await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch { return false; }
}

async function fetchWithRetry(url, retries = 3) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': new URL(url).origin + '/',
        'Cache-Control': 'no-cache',
    };
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
            if (res.status === 429) {
                const wait = 60000 + Math.random() * 10000;
                log(`  [429] Rate limited on ${url}, waiting ${Math.round(wait / 1000)}s...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            return res;
        } catch (e) {
            if (i < retries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            else throw e;
        }
    }
}

async function uploadItem(item, folder, fileKey, errors, errorCollection) {
    const imageUrl = (() => {
        for (const k of IMAGE_KEYS) {
            const v = typeof item[k] === 'string' ? item[k] : null;
            if (v && v.startsWith('http') && !v.includes('r2.dev')) return v;
        }
        return null;
    })();

    if (!imageUrl) return { skip: true };

    const itemId = item.id || item.objectID || item.accessionNumber || createHash('md5').update(JSON.stringify(item)).digest('hex').substring(0, 8);
    const imageKey = IMAGE_KEYS.find(k => typeof item[k] === 'string' && item[k] === imageUrl);
    const r2Key = `${folder}/${String(itemId).replace(/\//g, '__').substring(0, 80)}-${imageKey}.webp`;

    // Check if already on R2
    if (await checkR2Exists(r2Key)) {
        // Update JSON to r2 URL if not already done
        if (item[imageKey] !== `${R2_PUBLIC_URL}/${r2Key}`) {
            item[imageKey] = `${R2_PUBLIC_URL}/${r2Key}`;
        }
        return { alreadyExisted: true };
    }

    try {
        const res = await fetchWithRetry(imageUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) throw new Error('Got HTML instead of image');

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 1000) throw new Error(`Image too small (${buffer.length} bytes)`);

        // Convert to WebP
        let webpBuffer;
        try {
            webpBuffer = await sharp(buffer).webp({ quality: 82 }).toBuffer();
        } catch {
            webpBuffer = buffer; // fallback to original
        }

        await R2.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: r2Key,
            Body: webpBuffer,
            ContentType: 'image/webp',
        }));

        const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;
        // Store original URL
        if (!item[`original_${imageKey}`]) item[`original_${imageKey}`] = imageUrl;
        item[imageKey] = r2Url;
        return { uploaded: true };
    } catch (e) {
        // Record error
        if (!errors[errorCollection]) errors[errorCollection] = [];
        errors[errorCollection].push({ id: itemId, url: imageUrl, lastError: e.message, attempts: 1 });
        return { failed: true, error: e.message };
    }
}

async function processCollection({ file, folder }) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
        log(`  SKIP: ${file} not found`);
        return;
    }

    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        data = Array.isArray(parsed) ? parsed : (parsed.artworks || parsed.artwork || Object.values(parsed)[0]);
        if (!Array.isArray(data)) { log(`  SKIP: ${file} no array`); return; }
    } catch (e) {
        log(`  ERROR parsing ${file}: ${e.message}`);
        return;
    }

    // Acquire lock
    if (!acquireLock(file)) {
        log(`  LOCKED: ${file} already processed by retry script, skipping`);
        return;
    }

    // Count pending
    const pending = data.filter(item => {
        for (const k of IMAGE_KEYS) {
            const v = typeof item[k] === 'string' ? item[k] : null;
            if (v && v.startsWith('http') && !v.includes('r2.dev')) return true;
        }
        return false;
    });

    if (pending.length === 0) {
        log(`\n--- ${file}: already complete, skipping ---`);
        releaseLock(file);
        return;
    }

    log(`\n--- Loading ${file} ---`);
    log(`Found ${pending.length} pending images to migrate`);

    const errors = readErrors();
    let success = 0, failed = 0, skipped = 0;
    let saveTimer = null;

    const saveData = () => {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        writeErrors(errors);
    };

    // Process in batches
    for (let i = 0; i < data.length; i += CONCURRENCY) {
        const batch = data.slice(i, Math.min(i + CONCURRENCY, data.length));
        const results = await Promise.all(batch.map(item => uploadItem(item, folder, file, errors, file)));
        for (const r of results) {
            if (r.uploaded) success++;
            else if (r.failed) failed++;
            else if (r.alreadyExisted) success++;
            else skipped++;
        }
        if ((i + CONCURRENCY) % 50 === 0 || i + CONCURRENCY >= data.length) {
            process.stdout.write(`\rProgress: ${Math.min(i + CONCURRENCY, data.length)}/${data.length} | Success: ${success} | Fail: ${failed}`);
            saveData();
        }
    }

    console.log('');
    log(`Finished ${file}. Uploaded ${success}, failed ${failed}, skipped ${skipped}.`);
    releaseLock(file);
}

async function main() {
    log('=== Migration 1: NEW Collections ===');
    log(`Processing ${NEW_COLLECTIONS.length} collections`);

    for (const col of NEW_COLLECTIONS) {
        await processCollection(col);
    }

    log('\n=== All NEW Collections COMPLETED ===');
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
