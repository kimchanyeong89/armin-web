#!/usr/bin/env node
// Read a scraped JSON (from scripts/scrape-ng-room2.cjs) and upload docs to Firestore
// Usage:
//   node scripts/upload-ng-room2-from-json.cjs <jsonPath> <exhibitionTitle> <roomId>
// Env:
//   GOOGLE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS (path to service account)

const fs = require('fs');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT to a service account JSON path');
  process.exit(1);
}

const p = process.argv[2] || 'scripts/output/ng-room2.json';
const exhibitionTitle = process.argv[3] || 'European Paintings';
const roomId = process.argv[4] || '2';

const saPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function inferYear(dateStr){
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : null;
}

async function main(){
  if (!fs.existsSync(p)) { console.error('Missing JSON:', p); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const items = data.items || [];
  let count = 0;
  for (const it of items){
    const id = it.id;
    const doc = {
      id,
      name: it.name || id,
      artist: it.artist || '',
      year: inferYear(it.date) || null,
      date: it.date || null,
      dimension: it.dimension || null,
      image: it.image || null,
      roomId: roomId,
      exhibitionTitle,
      sourceUrl: it.sourceUrl || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!doc.image || !doc.name){ console.warn('Skipping (missing image or name):', id); continue; }
    await db.collection('artworks').doc(id).set(doc, { merge: true });
    count += 1;
    console.log('Saved', id);
  }
  console.log('Uploaded', count, 'artworks to Firestore for room', roomId);
}

main().catch(err => { console.error(err); process.exit(1); });
