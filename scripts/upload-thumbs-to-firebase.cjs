#!/usr/bin/env node
// Upload local thumbnails and create Firestore docs that reference remote original image URLs.
// Usage: node scripts/upload-thumbs-to-firebase.cjs <roomDir> <exhibitionId> <roomId>

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT (path to service account JSON)');
  process.exit(1);
}

const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: process.env.FIREBASE_BUCKET });
const bucket = admin.storage().bucket();
const db = admin.firestore();

async function uploadFile(localPath, destPath, contentType){
  const options = { destination: destPath, public: true, metadata: { cacheControl: 'public, max-age=31536000, immutable' } };
  if (contentType) options.metadata.contentType = contentType;
  await bucket.upload(localPath, options);
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destPath)}`;
}

function guessContentType(p){
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function main(){
  const dir = process.argv[2];
  const exhibitionId = process.argv[3] || 'ng-1';
  const roomId = process.argv[4] || '1';
  if (!dir) { console.error('Usage: node scripts/upload-thumbs-to-firebase.cjs <roomDir> <exhibitionId> <roomId>'); process.exit(1); }
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) { console.error('Missing index.json in', dir); process.exit(1); }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  const items = index.items || [];
  for (const it of items){
    const id = it.id;
    const name = it.title || id;
    let thumbUrl = null;
    if (it.thumbPath && fs.existsSync(it.thumbPath)){
      const contentType = guessContentType(it.thumbPath);
      const dest = `paintings/${exhibitionId}/thumbs/${id}${path.extname(it.thumbPath)}`;
      console.log('Uploading thumb', id);
      thumbUrl = await uploadFile(it.thumbPath, dest, contentType);
    }
    const docRef = db.collection('artworks').doc(id);
    await docRef.set({
      id,
      name,
      artist: '',
      year: null,
      image: it.remoteImageUrl || it.itemUrl,
      thumbnails: thumbUrl ? { small: thumbUrl } : {},
      roomId: roomId,
      exhibitionTitle: exhibitionId,
      exhibitionId,
      sourceUrl: it.itemUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('Created doc', id);
  }
  console.log('All done');
}

main().catch(err => { console.error(err); process.exit(1); });
