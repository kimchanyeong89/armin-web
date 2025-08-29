#!/usr/bin/env node
// Cleanup Room 2 in Firestore to match a scraped JSON list exactly
// Usage:
//   node scripts/cleanup-ng-room2.cjs <jsonPath> <exhibitionTitle> <roomId>
// Env:
//   GOOGLE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS (path to service account)

const fs = require('fs');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT to a service account JSON path');
  process.exit(1);
}

const jsonPath = process.argv[2] || 'scripts/output/ng-room2.json';
const exhibitionTitle = process.argv[3] || 'European Paintings';
const roomId = process.argv[4] || '2';

const saPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main(){
  if (!fs.existsSync(jsonPath)) {
    console.error('Missing JSON:', jsonPath);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const keep = new Set((data.items || []).map(it => it.id));

  const q = db.collection('artworks')
    .where('exhibitionTitle', '==', exhibitionTitle)
    .where('roomId', '==', roomId);
  const snap = await q.get();

  let del = 0;
  const batch = db.batch();
  snap.forEach(doc => {
    const id = doc.id;
    if (!keep.has(id)) {
      batch.delete(doc.ref);
      del += 1;
    }
  });
  if (del > 0) await batch.commit();
  console.log('Cleanup complete. Deleted', del, 'docs not present in', jsonPath);
}

main().catch(err => { console.error(err); process.exit(1); });
