#!/usr/bin/env node
/**
 * manifest.json으로부터 thumb / lq / variants 메타데이터를 Firestore artworks 문서에 병합합니다.
 *
 * 사용법:
 *   GOOGLE_SERVICE_ACCOUNT=./service-account.json FIREBASE_PROJECT=xxxx \
 *   node scripts/apply-artwork-variants.cjs public/generated/manifest.json
 */

const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT to point at a service account JSON file.');
  process.exit(1);
}

const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT;
if (!projectId) {
  console.error('Cannot determine projectId. Set FIREBASE_PROJECT env or ensure service account includes project_id.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const manifestPath = path.resolve(process.argv[2] || 'public/generated/manifest.json');
const collectionName = process.argv[3] || 'artworks';
const baseUrl = (process.argv[4] || process.env.VARIANTS_BASE_URL || '').trim();

if (!fs.existsSync(manifestPath)) {
  console.error('Manifest not found:', manifestPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest) || manifest.length === 0) {
  console.warn('Manifest is empty. Nothing to update.');
  process.exit(0);
}

const limit = pLimit(6);

const withBase = (url) => {
  if (!url) return url;
  if (/^https?:/i.test(url)) return url;
  if (!baseUrl) return url;
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const trimmedUrl = url.startsWith('/') ? url.slice(1) : url;
  return `${trimmedBase}/${trimmedUrl}`;
};

const normalizeVariants = (variants = {}) => {
  const out = {};
  for (const key of ['avif', 'webp', 'jpg']) {
    if (!variants[key]) continue;
    out[key] = {};
    for (const width of Object.keys(variants[key])) {
      out[key][width] = withBase(variants[key][width]);
    }
  }
  return out;
};

async function applyEntry(entry) {
  const docId = entry.docId || entry.id;
  if (!docId) {
    console.warn('Skipping entry without id/docId:', entry);
    return;
  }
  const payload = {};
  if (entry.thumb) payload.thumb = withBase(entry.thumb);
  if (entry.lq) payload.lq = withBase(entry.lq);
  if (entry.variants) payload.variants = normalizeVariants(entry.variants);
  if (entry.original) payload.imageLocal = withBase(entry.original);

  if (!Object.keys(payload).length) {
    console.warn('No payload fields for', docId);
    return;
  }

  await db.collection(collectionName).doc(docId).set(payload, { merge: true });
  console.log('Updated', docId);
}

(async () => {
  let updated = 0;
  await Promise.all(manifest.map((entry) => limit(async () => {
    await applyEntry(entry);
    updated += 1;
  })));
  console.log('Done. Updated', updated, 'documents.');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
