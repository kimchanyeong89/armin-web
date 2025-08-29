#!/usr/bin/env node
// Inspect Firestore artworks counts per room for a given exhibition
// Usage: node scripts/inspect-artworks.cjs "European Paintings"
const fs = require('fs');
const admin = require('firebase-admin');
const exhibition = process.argv[2] || 'European Paintings';
const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT;
if (!saPath || !fs.existsSync(saPath)) {
  console.error('Service account JSON not found. Set GOOGLE_APPLICATION_CREDENTIALS to the file path.');
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
(async () => {
  try {
    const q = db.collection('artworks').where('exhibitionTitle', '==', exhibition);
    const snap = await q.get();
    console.log(`Found ${snap.size} artworks for exhibition '${exhibition}'`);
    const counts = {};
    let i = 0;
    snap.forEach(doc => {
      i++;
      const d = doc.data();
      const room = String(d.roomId || 'default');
      counts[room] = (counts[room] || 0) + 1;
      if (i <= 6) {
        console.log('SAMPLE:', doc.id, { roomId: d.roomId, name: d.name, image: d.image ? (d.image.length > 80 ? d.image.slice(0,80)+'...' : d.image) : null });
      }
    });
    console.log('Counts per room (top 20):');
    Object.entries(counts).sort((a,b)=> (parseInt(a[0])||0) - (parseInt(b[0])||0)).slice(0,20).forEach(([r,c])=>console.log(r, c));
    process.exit(0);
  } catch (e) {
    console.error('Error querying Firestore:', e);
    process.exit(1);
  }
})();
