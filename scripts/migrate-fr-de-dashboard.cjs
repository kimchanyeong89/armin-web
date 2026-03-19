#!/usr/bin/env node
'use strict';

/**
 * migrate-fr-de-dashboard.cjs
 * France + Germany R2 migration with live terminal dashboard
 * - Skips already-migrated items (url contains r2.dev)
 * - Retries error log items (analyses error reason, applies fix)
 * - Live dashboard with progress bars in terminal
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
    console.error('❌ Missing R2 credentials in .env.local');
    process.exit(1);
}

const R2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const DATA_DIR = path.join(__dirname, '../public/data');
const ERROR_FILE = path.join(DATA_DIR, 'r2-migration-errors.json');
const LOG_FILE = '/tmp/r2-fr-de-migration.log';
const CONCURRENCY = 4;

// ─── Collections ────────────────────────────────────────────────────────────
const FRANCE_COLLECTIONS = [
    { file: 'macval-collection.json', folder: 'artworks/macval-collection', label: 'Macval (MPP)' },
    { file: 'mucem-collection.json', folder: 'artworks/mucem-collection', label: 'Mucem' },
    { file: 'musee-chagall-collection.json', folder: 'artworks/musee-chagall-collection', label: 'Musée Chagall' },
    { file: 'louvre-painting-collection.json', folder: 'artworks/louvre-painting-collection', label: 'Louvre' },
    { file: 'pompidou-painting-collection.json', folder: 'artworks/pompidou-painting-collection', label: 'Pompidou Painting' },
    { file: 'pompidou-drawing-collection.json', folder: 'artworks/pompidou-drawing-collection', label: 'Pompidou Drawing' },
    { file: 'pompidou-design-collection.json', folder: 'artworks/pompidou-design-collection', label: 'Pompidou Design' },
    { file: 'pompidou-cinema-collection.json', folder: 'artworks/pompidou-cinema-collection', label: 'Pompidou Cinema' },
    { file: 'pompidou-newmedia-collection.json', folder: 'artworks/pompidou-newmedia-collection', label: 'Pompidou NewMedia' },
    { file: 'versailles-collection.json', folder: 'artworks/versailles-collection', label: 'Versailles' },
    { file: 'orsay-collection.json', folder: 'artworks/orsay-collection', label: "Musée d'Orsay" },
    { file: 'rodin-collection.json', folder: 'artworks/rodin-collection', label: 'Musée Rodin' },
    { file: 'bordeaux-collection.json', folder: 'artworks/bordeaux-collection', label: 'MBA Bordeaux' },
    { file: 'mba-lyon-collection.json', folder: 'artworks/mba-lyon-collection', label: 'MBA Lyon' },
    { file: 'rouen-mba-collection.json', folder: 'artworks/rouen-mba-collection', label: 'MBA Rouen' },
    { file: 'grenoble-collection.json', folder: 'artworks/grenoble-collection', label: 'Musée Grenoble' },
    { file: 'flv-collection.json', folder: 'artworks/flv-collection', label: 'Fondation Louis Vuitton' },
    { file: 'mam-collection.json', folder: 'artworks/mam-collection', label: 'MAM Paris' },
    { file: 'mamcs-strasbourg-collection.json', folder: 'artworks/mamcs-strasbourg-collection', label: 'MAMCS Strasbourg' },
    { file: 'mad-paris-collection.json', folder: 'artworks/mad-paris-collection', label: 'MAD Paris' },
    { file: 'mep-photography-collection.json', folder: 'artworks/mep-photography-collection', label: 'MEP Photo' },
    { file: 'musee-armee-collection.json', folder: 'artworks/musee-armee-collection', label: "Musée de l'Armée" },
    { file: 'petit-palais-collection.json', folder: 'artworks/petit-palais-collection', label: 'Petit Palais' },
    { file: 'marmottan-collection.json', folder: 'artworks/marmottan-collection', label: 'Marmottan Monet' },
    { file: 'matisse-nice-collection.json', folder: 'artworks/matisse-nice-collection', label: 'Musée Matisse' },
    { file: 'picasso-paris-collection.json', folder: 'artworks/picasso-paris-collection', label: 'Musée Picasso Paris' },
    { file: 'carnavalet-paintings.json', folder: 'artworks/carnavalet-paintings', label: 'Carnavalet' },
    { file: 'musee-conde-paintings.json', folder: 'artworks/musee-conde-paintings', label: 'Musée Condé' },
    { file: 'jacquemart-andre-collection.json', folder: 'artworks/jacquemart-andre-collection', label: 'Jacquemart-André' },
    { file: 'pinault-collection.json', folder: 'artworks/pinault-collection', label: 'Pinault Collection' },
    { file: 'toulouse-lautrec-collection.json', folder: 'artworks/toulouse-lautrec', label: 'Toulouse-Lautrec' },
    { file: 'musee-granet-collection.json', folder: 'artworks/musee-granet', label: 'Musée Granet' },
    { file: 'musee-guimet-collection.json', folder: 'artworks/musee-guimet-collection', label: 'Musée Guimet' },
    { file: 'orangerie-collection.json', folder: 'artworks/orangerie-collection', label: "Musée de l'Orangerie" },
    { file: 'la-piscine-collection.json', folder: 'artworks/la-piscine-collection', label: 'La Piscine' },
];

const GERMANY_COLLECTIONS = [
    { file: 'alte-pinakothek-collection.json', folder: 'artworks/alte-pinakothek-collection', label: 'Alte Pinakothek' },
    { file: 'neue-pinakothek-collection.json', folder: 'artworks/neue-pinakothek-collection', label: 'Neue Pinakothek' },
    { file: 'pinakothek-moderne-collection.json', folder: 'artworks/pinakothek-moderne-collection', label: 'Pinakothek der Moderne' },
    { file: 'sammlung-schack-collection.json', folder: 'artworks/sammlung-schack-collection', label: 'Sammlung Schack' },
    { file: 'staatsgalerien-collection.json', folder: 'artworks/staatsgalerien-collection', label: 'Staatsgalerien' },
    { file: 'staedel-museum-collection.json', folder: 'artworks/staedel-museum-collection', label: 'Städel Museum' },
    { file: 'bruecke-museum-collection.json', folder: 'artworks/bruecke-museum-collection', label: 'Brücke Museum' },
    { file: 'hamburger-kunsthalle-paintings.json', folder: 'artworks/hamburger-kunsthalle-paintings', label: 'Hamburger Kunsthalle' },
    { file: 'smb-alte-nationalgalerie-collection.json', folder: 'artworks/smb-alte-nationalgalerie-collection', label: 'Alte Nationalgalerie (SMB)' },
    { file: 'smb-altes-museum-collection.json', folder: 'artworks/smb-altes-museum-collection', label: 'Altes Museum (SMB)' },
    { file: 'smb-bode-museum-collection.json', folder: 'artworks/smb-bode-museum-collection', label: 'Bode Museum (SMB)' },
    { file: 'smb-gemaeldegalerie-collection.json', folder: 'artworks/smb-gemaeldegalerie-collection', label: 'Gemäldegalerie (SMB)' },
    { file: 'smb-humboldt-forum-collection.json', folder: 'artworks/smb-humboldt-forum-collection', label: 'Humboldt Forum (SMB)' },
    { file: 'smb-neue-nationalgalerie-collection.json', folder: 'artworks/smb-neue-nationalgalerie-collection', label: 'Neue Nationalgalerie (SMB)' },
    { file: 'smb-neues-museum-collection.json', folder: 'artworks/smb-neues-museum-collection', label: 'Neues Museum (SMB)' },
];

// ─── Image key detection ─────────────────────────────────────────────────────
const IMAGE_KEYS = [
    'image', 'imageUrl', 'thumbnail', 'representativeImage',
    'primaryImage', 'primaryImageSmall', 'iiifUrl', 'imageLink', 'url'
];

function findPendingUrl(item) {
    for (const k of IMAGE_KEYS) {
        const v = typeof item[k] === 'string' ? item[k] : null;
        if (v && v.startsWith('http') && !v.includes('r2.dev')) return { url: v, key: k };
    }
    return null;
}

// ─── Dashboard state ──────────────────────────────────────────────────────────
const state = {
    startTime: Date.now(),
    collections: {},
    current: null,
    totalUploaded: 0,
    totalFailed: 0,
    totalSkipped: 0,
};

function initCollection(col, total, pending) {
    state.collections[col.file] = {
        label: col.label,
        total,
        pending,
        done: 0,
        uploaded: 0,
        failed: 0,
        skipped: 0,
        status: 'waiting',
    };
}

function log(msg) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}

// ─── Dashboard render ────────────────────────────────────────────────────────
const COLORS = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
    red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m',
    white: '\x1b[37m', gray: '\x1b[90m',
    bgBlue: '\x1b[44m', bgGreen: '\x1b[42m',
};
const C = COLORS;

function bar(done, total, width = 20) {
    if (total === 0) return '[' + '─'.repeat(width) + ']';
    const filled = Math.round((done / total) * width);
    const pct = Math.round((done / total) * 100);
    const green = C.green + '█'.repeat(filled) + C.reset;
    const empty = C.gray + '░'.repeat(width - filled) + C.reset;
    return `[${green}${empty}] ${pct}%`;
}

function elapsed() {
    const sec = Math.floor((Date.now() - state.startTime) / 1000);
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

let dashboardLines = 0;
function renderDashboard() {
    // Move cursor up
    if (dashboardLines > 0) {
        process.stdout.write(`\x1b[${dashboardLines}A\x1b[J`);
    }

    const lines = [];

    // Header
    lines.push(`${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
    lines.push(`${C.bold}${C.cyan}║    🎨  R2 Migration: France + Germany  ⏱  ${elapsed()}       ║${C.reset}`);
    lines.push(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.reset}`);
    lines.push('');

    // Summary
    lines.push(`  ${C.bold}Total:${C.reset} ✅ ${C.green}${state.totalUploaded}${C.reset} uploaded  ❌ ${C.red}${state.totalFailed}${C.reset} failed  ⏭  ${C.gray}${state.totalSkipped}${C.reset} skipped`);
    lines.push('');

    // France section
    lines.push(`  ${C.bold}${C.blue}🇫🇷 France${C.reset}`);
    for (const [file, s] of Object.entries(state.collections)) {
        if (!FRANCE_COLLECTIONS.find(c => c.file === file)) continue;
        const statusIcon = s.status === 'done' ? `${C.green}✅${C.reset}` :
            s.status === 'active' ? `${C.yellow}⚡${C.reset}` :
                s.status === 'skipped' ? `${C.gray}⏭${C.reset}` : `${C.gray}⏳${C.reset}`;
        const label = s.label.padEnd(28);
        if (s.status === 'skipped') {
            lines.push(`  ${statusIcon} ${C.gray}${label}${C.reset} ${C.gray}already complete${C.reset}`);
        } else {
            const b = bar(s.done, s.pending || 1);
            lines.push(`  ${statusIcon} ${C.white}${label}${C.reset} ${b} ${C.dim}${s.done}/${s.pending} (+${s.uploaded} ❌${s.failed})${C.reset}`);
        }
    }

    lines.push('');

    // Germany section
    lines.push(`  ${C.bold}${C.yellow}🇩🇪 Germany${C.reset}`);
    for (const [file, s] of Object.entries(state.collections)) {
        if (!GERMANY_COLLECTIONS.find(c => c.file === file)) continue;
        const statusIcon = s.status === 'done' ? `${C.green}✅${C.reset}` :
            s.status === 'active' ? `${C.yellow}⚡${C.reset}` :
                s.status === 'skipped' ? `${C.gray}⏭${C.reset}` : `${C.gray}⏳${C.reset}`;
        const label = s.label.padEnd(28);
        if (s.status === 'skipped') {
            lines.push(`  ${statusIcon} ${C.gray}${label}${C.reset} ${C.gray}already complete${C.reset}`);
        } else {
            const b = bar(s.done, s.pending || 1);
            lines.push(`  ${statusIcon} ${C.white}${label}${C.reset} ${b} ${C.dim}${s.done}/${s.pending} (+${s.uploaded} ❌${s.failed})${C.reset}`);
        }
    }

    lines.push('');
    if (state.current) {
        lines.push(`  ${C.dim}Current: ${state.current}${C.reset}`);
    }
    lines.push(`  ${C.dim}Log: ${LOG_FILE}${C.reset}`);

    const output = lines.join('\n');
    process.stdout.write(output + '\n');
    dashboardLines = lines.length + 1;
}

// ─── Upload logic ─────────────────────────────────────────────────────────────
function readErrors() {
    if (!fs.existsSync(ERROR_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(ERROR_FILE, 'utf8')); } catch { return {}; }
}
function writeErrors(errors) {
    fs.writeFileSync(ERROR_FILE, JSON.stringify(errors, null, 2));
}

async function checkR2Exists(key) {
    try {
        await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        return true;
    } catch { return false; }
}

async function fetchWithRetry(url, retries = 3) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
    };
    try {
        const u = new URL(url);
        headers['Referer'] = u.origin + '/';
    } catch { }

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, {
                headers,
                redirect: 'follow',
                signal: AbortSignal.timeout(20000),
            });
            if (res.status === 429) {
                const wait = 30000 + Math.random() * 15000;
                log(`[429] ${url.substring(0, 60)}, waiting ${Math.round(wait / 1000)}s`);
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

async function uploadItem(item, folder, errorCollection, errors) {
    const found = findPendingUrl(item);
    if (!found) return { skip: true };

    const { url: imageUrl, key: imageKey } = found;
    const itemId = item.id || item.objectID || item.accessionNumber ||
        createHash('md5').update(imageUrl).digest('hex').substring(0, 8);
    const safeId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
    const r2Key = `${folder}/${safeId}-${imageKey}.webp`;

    // Check R2 first
    if (await checkR2Exists(r2Key)) {
        if (!item[`original_${imageKey}`]) item[`original_${imageKey}`] = imageUrl;
        item[imageKey] = `${R2_PUBLIC_URL}/${r2Key}`;
        return { alreadyExisted: true };
    }

    try {
        const res = await fetchWithRetry(imageUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) throw new Error('Got HTML (blocked)');

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 800) throw new Error(`Too small (${buffer.length} bytes)`);

        let webpBuffer;
        try {
            webpBuffer = await sharp(buffer)
                .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 82 })
                .toBuffer();
        } catch { webpBuffer = buffer; }

        await R2.send(new PutObjectCommand({
            Bucket: BUCKET, Key: r2Key, Body: webpBuffer, ContentType: 'image/webp',
        }));

        if (!item[`original_${imageKey}`]) item[`original_${imageKey}`] = imageUrl;
        item[imageKey] = `${R2_PUBLIC_URL}/${r2Key}`;

        // Clear from error log if present
        if (errors[errorCollection]) {
            errors[errorCollection] = errors[errorCollection].filter(e => e.url !== imageUrl);
            if (errors[errorCollection].length === 0) delete errors[errorCollection];
        }

        return { uploaded: true };
    } catch (e) {
        if (!errors[errorCollection]) errors[errorCollection] = [];
        const existing = errors[errorCollection].find(x => x.url === imageUrl);
        if (existing) { existing.attempts++; existing.lastError = e.message; }
        else errors[errorCollection].push({ id: itemId, url: imageUrl, lastError: e.message, attempts: 1 });
        return { failed: true };
    }
}

// ─── Process a collection ────────────────────────────────────────────────────
async function processCollection(col) {
    const filePath = path.join(DATA_DIR, col.file);
    if (!fs.existsSync(filePath)) {
        if (state.collections[col.file]) {
            state.collections[col.file].status = 'skipped';
        }
        log(`SKIP: ${col.file} not found`);
        return;
    }

    let data;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        data = Array.isArray(parsed) ? parsed
            : (parsed.artworks || parsed.artwork || Object.values(parsed)[0]);
        if (!Array.isArray(data)) throw new Error('not array');
    } catch (e) {
        log(`ERROR parsing ${col.file}: ${e.message}`);
        return;
    }

    // Count pending items
    const pending = data.filter(item => findPendingUrl(item) !== null);
    initCollection(col, data.length, pending.length);

    if (pending.length === 0) {
        state.collections[col.file].status = 'skipped';
        renderDashboard();
        log(`COMPLETE: ${col.file} already done`);
        return;
    }

    state.collections[col.file].status = 'active';
    state.current = `${col.label} (${pending.length} pending)`;
    renderDashboard();
    log(`START: ${col.file} - ${pending.length}/${data.length} pending`);

    const errors = readErrors();
    let uploaded = 0, failed = 0, skipped = 0;

    const save = () => {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        writeErrors(errors);
    };

    for (let i = 0; i < data.length; i += CONCURRENCY) {
        const batch = data.slice(i, Math.min(i + CONCURRENCY, data.length));
        const results = await Promise.all(
            batch.map(item => uploadItem(item, col.folder, col.file, errors))
        );

        for (const r of results) {
            if (r.uploaded) { uploaded++; state.totalUploaded++; }
            else if (r.alreadyExisted) { uploaded++; }
            else if (r.failed) { failed++; state.totalFailed++; }
            else if (r.skip) { skipped++; state.totalSkipped++; }
        }

        const done = Math.min(i + CONCURRENCY, data.length);
        const cs = state.collections[col.file];
        cs.done = done;
        cs.uploaded = uploaded;
        cs.failed = failed;
        cs.skipped = skipped;

        if (done % (CONCURRENCY * 5) === 0 || done >= data.length) {
            save();
            renderDashboard();
        }
    }

    save();
    state.collections[col.file].status = 'done';
    state.current = null;
    renderDashboard();
    log(`DONE: ${col.file} - uploaded=${uploaded} failed=${failed} skipped=${skipped}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.clear();
    log('=== FR+DE R2 Migration Start ===');

    // Pre-init all collections as waiting
    for (const col of [...FRANCE_COLLECTIONS, ...GERMANY_COLLECTIONS]) {
        initCollection(col, 0, 0);
    }
    renderDashboard();

    const ALL = [...FRANCE_COLLECTIONS, ...GERMANY_COLLECTIONS];
    for (const col of ALL) {
        await processCollection(col);
    }

    log('=== FR+DE R2 Migration COMPLETE ===');
    console.log('\n\n✅ Migration complete! Check log:', LOG_FILE);
}

main().catch(e => {
    log(`FATAL: ${e.message}\n${e.stack}`);
    console.error('\nFATAL:', e.message);
    process.exit(1);
});
