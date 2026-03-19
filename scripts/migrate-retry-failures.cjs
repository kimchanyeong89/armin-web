#!/usr/bin/env node
'use strict';

/**
 * migrate-retry-failures.cjs
 * Migration 2: Retry previously failed items from V1 and V2 logs
 * Uses lock file to prevent duplicates with migrate-new-collections.cjs
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
const LOG_FILE = '/tmp/r2-migration-retry2.log';
const ERROR_FILE = path.join(__dirname, '../public/data/r2-migration-errors.json');
const LOCK_FILE = '/tmp/r2-migration-lock.json';
const CONCURRENCY = 4;

// Partial collections from V1/V2 that still have original URLs remaining
// These are ones where V1 ran but some images failed
const RETRY_COLLECTIONS = [
    // Partial V1 completions (still have orig URLs)
    { file: 'wawel-collection.json', folder: 'artworks/wawel-collection' },
    { file: 'smb-humboldt-forum-collection.json', folder: 'artworks/smb-humboldt-forum-collection' },
    { file: 'smb-neues-museum-collection.json', folder: 'artworks/smb-neues-museum-collection' },
    { file: 'smb-gemaeldegalerie-collection.json', folder: 'artworks/smb-gemaeldegalerie-collection' },
    { file: 'smb-alte-nationalgalerie-collection.json', folder: 'artworks/smb-alte-nationalgalerie-collection' },
    { file: 'smb-bode-museum-collection.json', folder: 'artworks/smb-bode-museum-collection' },
    { file: 'staedel-museum-collection.json', folder: 'artworks/staedel-museum-collection' },
    { file: 'bruecke-museum-collection.json', folder: 'artworks/bruecke-museum-collection' },
    { file: 'vangogh-museum-collection.json', folder: 'artworks/vangogh-museum-collection' },
    { file: 'stedelijk-collection.json', folder: 'artworks/stedelijk-collection' },
    { file: 'castello-di-rivoli-collection.json', folder: 'artworks/castello-di-rivoli-collection' },
    { file: 'flv-collection.json', folder: 'artworks/flv-collection' },
    { file: 'reina-sofia-collection.json', folder: 'artworks/reina-sofia-collection' },
    { file: 'belvedere-collection.json', folder: 'artworks/belvedere-collection' },
    { file: 'leopold-museum-collection.json', folder: 'artworks/leopold-museum-collection' },
    { file: 'budapest-museum-collection.json', folder: 'artworks/budapest-museum-collection' },
    { file: 'sfmoma-collection.json', folder: 'artworks/sfmoma-collection' },
    { file: 'cleveland-museum-collection.json', folder: 'artworks/cleveland-museum-collection' },
    { file: 'dia-collection.json', folder: 'artworks/dia-collection' },
    { file: 'high-museum-collection.json', folder: 'artworks/high-museum-collection' },
    { file: 'lacma-collection.json', folder: 'artworks/lacma-collection' },
    { file: 'philadelphia-museum-collection.json', folder: 'artworks/philadelphia-museum-collection' },
    { file: 'crystal-bridges-gac.json', folder: 'artworks/crystal-bridges-gac' },
    { file: 'masp-collection.json', folder: 'artworks/masp-collection' },
    { file: 'rijksmuseum-paintings-collection.json', folder: 'artworks/rijksmuseum-paintings-collection' },
    { file: 'rijksmuseum-drawings-collection.json', folder: 'artworks/rijksmuseum-drawings-collection' },
    { file: 'rijksmuseum-prints-collection.json', folder: 'artworks/rijksmuseum-prints-collection' },
    { file: 'rijksmuseum-photography-collection.json', folder: 'artworks/rijksmuseum-photography-collection' },
    { file: 'rijksmuseum-prints2-collection.json', folder: 'artworks/rijksmuseum-prints2-collection' },
    { file: 'nationale-taiwan-museum-collection.json', folder: 'artworks/nationale-taiwan-museum-collection' },
    { file: 'm-plus-collection.json', folder: 'artworks/m-plus-collection' },
    { file: 'taipei-fine-arts-museum-collection.json', folder: 'artworks/taipei-fine-arts-museum-collection' },
    { file: 'namoc-collection.json', folder: 'artworks/namoc-collection' },
    { file: 'china-art-museum-collection.json', folder: 'artworks/china-art-museum-collection' },
    { file: 'national-portrait-gallery-london-collection.json', folder: 'artworks/national-portrait-gallery-london-collection' },
    // UK collections with partial R2
    { file: 'tate-modern-collection.json', folder: 'artworks/tate-modern-collection' },
    { file: 'courtauld-gallery-collection.json', folder: 'artworks/courtauld-gallery-collection' },
    { file: 'sng-modern-collection.json', folder: 'artworks/sng-modern-collection' },
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
    if (lock[fileKey]) {
        const info = lock[fileKey];
        // If same PID, it's us, ok. If other PID, skip.
        if (info.pid !== process.pid) return false;
    }
    lock[fileKey] = { pid: process.pid, script: 'retry', time: Date.now() };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
    return true;
}
function releaseLock(fileKey) {
    if (!fs.existsSync(LOCK_FILE)) return;
    try {
        const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        if (lock[fileKey] && lock[fileKey].pid === process.pid) {
            delete lock[fileKey];
            fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2));
        }
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': (() => { try { return new URL(url).origin + '/'; } catch { return 'https://google.com'; } })(),
        'Cache-Control': 'no-cache',
    };
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
            if (res.status === 429) {
                const wait = 60000 + Math.random() * 10000;
                log(`  [429] ${url.substring(0, 60)}, wait ${Math.round(wait / 1000)}s`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            return res;
        } catch (e) {
            if (i < retries) await new Promise(r => setTimeout(r, 3000 * (i + 1)));
            else throw e;
        }
    }
}

async function uploadItem(item, folder, errors, errorCollection) {
    const imageUrl = (() => {
        for (const k of IMAGE_KEYS) {
            const v = typeof item[k] === 'string' ? item[k] : null;
            if (v && v.startsWith('http') && !v.includes('r2.dev')) return v;
        }
        return null;
    })();

    if (!imageUrl) return { skip: true };

    const imageKey = IMAGE_KEYS.find(k => typeof item[k] === 'string' && item[k] === imageUrl);
    const itemId = item.id || item.objectID || item.accessionNumber || createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
    const r2Key = `${folder}/${String(itemId).replace(/\//g, '__').substring(0, 80)}-${imageKey}.webp`;

    // Check R2 first (avoid re-upload)
    if (await checkR2Exists(r2Key)) {
        const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;
        if (!item[`original_${imageKey}`]) item[`original_${imageKey}`] = imageUrl;
        item[imageKey] = r2Url;
        return { alreadyExisted: true };
    }

    try {
        const res = await fetchWithRetry(imageUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) throw new Error('Got HTML instead of image');

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 500) throw new Error(`Too small (${buffer.length} bytes)`);

        let webpBuffer;
        try { webpBuffer = await sharp(buffer).webp({ quality: 82 }).toBuffer(); }
        catch { webpBuffer = buffer; }

        await R2.send(new PutObjectCommand({
            Bucket: BUCKET, Key: r2Key, Body: webpBuffer, ContentType: 'image/webp',
        }));

        const r2Url = `${R2_PUBLIC_URL}/${r2Key}`;
        if (!item[`original_${imageKey}`]) item[`original_${imageKey}`] = imageUrl;
        item[imageKey] = r2Url;
        return { uploaded: true };
    } catch (e) {
        if (!errors[errorCollection]) errors[errorCollection] = [];
        errors[errorCollection].push({ id: itemId, url: imageUrl, lastError: e.message, attempts: 1 });
        return { failed: true };
    }
}

async function processCollection({ file, folder }) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return; // silently skip

    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        data = Array.isArray(parsed) ? parsed : (parsed.artworks || parsed.artwork || (typeof parsed === 'object' ? Object.values(parsed)[0] : null));
        if (!Array.isArray(data) || data.length === 0) return;
    } catch { return; }

    // Count pending (orig URLs only, not r2)
    const pending = data.filter(item => {
        for (const k of IMAGE_KEYS) {
            const v = typeof item[k] === 'string' ? item[k] : null;
            if (v && v.startsWith('http') && !v.includes('r2.dev')) return true;
        }
        return false;
    });

    if (pending.length === 0) {
        log(`--- ${file}: 0 pending, already complete ---`);
        return;
    }

    // Acquire lock - skip if new-collections script is handling this file
    if (!acquireLock(file)) {
        log(`--- ${file}: LOCKED by migrate-new-collections, skipping ---`);
        return;
    }

    log(`\n--- Retry: ${file} ---`);
    log(`  Pending: ${pending.length}/${data.length}`);

    const errors = readErrors();
    // Clear previous errors for this file (we're retrying)
    errors[file] = [];

    let success = 0, failed = 0;

    const saveData = () => {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        const cleaned = { ...errors };
        if (cleaned[file] && cleaned[file].length === 0) delete cleaned[file];
        writeErrors(cleaned);
    };

    for (let i = 0; i < data.length; i += CONCURRENCY) {
        const batch = data.slice(i, Math.min(i + CONCURRENCY, data.length));
        const results = await Promise.all(batch.map(item => uploadItem(item, folder, errors, file)));
        for (const r of results) {
            if (r.uploaded || r.alreadyExisted) success++;
            else if (r.failed) failed++;
        }
        const done = Math.min(i + CONCURRENCY, data.length);
        if (done % 100 === 0 || done >= data.length) {
            process.stdout.write(`\r  ${file}: ${done}/${data.length} | OK: ${success} | Fail: ${failed}`);
            saveData();
        }
    }

    console.log('');
    log(`  Done: success=${success} failed=${failed}`);
    releaseLock(file);
}

async function main() {
    log('=== Migration 2: Retry Partial/Failed Collections ===');
    for (const col of RETRY_COLLECTIONS) {
        await processCollection(col);
    }
    log('\n=== RETRY Migration COMPLETED ===');
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
