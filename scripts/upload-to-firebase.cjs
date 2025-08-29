#!/usr/bin/env node
// Upload local images to Firebase Storage and create Firestore artwork documents
// Usage: node scripts/upload-to-firebase.cjs ./downloads exhibitionId roomId

const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');
const sharp = require('sharp');
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

const limit = pLimit(5);

async function uploadBuffer(buffer, destPath, contentType){
  const file = bucket.file(destPath);
  await file.save(buffer, { contentType, public: true, metadata: { cacheControl: 'public, max-age=31536000, immutable' } });
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destPath)}`;
}

async function uploadFile(localPath, destPath){
  await bucket.upload(localPath, { destination: destPath, public: true, metadata: { cacheControl: 'public, max-age=31536000, immutable' } });
  return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destPath)}`;
}

async function processOne(filePath, exhibitionId, roomId){
  const id = path.basename(filePath, path.extname(filePath));
  const masterKey = `paintings/${exhibitionId}/masters/${id}${path.extname(filePath)}`;
  const thumbKey = `paintings/${exhibitionId}/thumbs/${id}-640.webp`;

  // create thumb
  const thumbBuf = await sharp(filePath).resize(1200).webp({ quality: 80 }).toBuffer();
  const thumbUrl = await uploadBuffer(thumbBuf, thumbKey, 'image/webp');

  // upload master
  const masterUrl = await uploadFile(filePath, masterKey);

  const docRef = db.collection('artworks').doc(id);
  await docRef.set({
    id,
    name: id,
    artist: '',
    year: null,
    image: masterUrl,
    thumbnails: { '640': thumbUrl },
    roomId: roomId,
    exhibitionTitle: exhibitionId,
    exhibitionId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('Uploaded', id);
}

async function main(){
  const dir = process.argv[2];
  const exhibitionId = process.argv[3] || 'ng-1';
  const roomId = process.argv[4] || '1';
  if (!dir) { console.error('Usage: node scripts/upload-to-firebase.cjs <dir> [exhibitionId] [roomId]'); process.exit(1); }
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).map(f => path.join(dir, f));
  if (!files.length) { console.error('No image files in', dir); process.exit(1); }
  await Promise.all(files.map(f => limit(() => processOne(f, exhibitionId, roomId))));
  console.log('All done');
}

main().catch(err => { console.error(err); process.exit(1); });
