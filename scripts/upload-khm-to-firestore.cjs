#!/usr/bin/env node
// Upload KHM collection from JSON to Firestore
// Usage: GOOGLE_SERVICE_ACCOUNT=./firebase-service-account.json node scripts/upload-khm-to-firestore.cjs

const fs = require('fs');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT) {
  console.error('Set GOOGLE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)');
  process.exit(1);
}

const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_BUCKET || 'armin-web-app-d2e98.firebasestorage.app'
});

const db = admin.firestore();

async function uploadKHMCollection() {
  console.log('📥 Loading KHM collection from JSON...\n');
  
  const collectionPath = '/Users/kietzsche/armin-web-main/public/data/khm-collection.json';
  const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
  
  console.log(`Found ${data.totalObjects} artworks\n`);
  console.log('📤 Uploading to Firestore...\n');
  
  const exhibitionId = 'khm-collection';
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const artwork of data.objects) {
    try {
      // Create Firestore-compatible document
      const docData = {
        id: artwork.id,
        name: artwork.title,
        title: artwork.title,
        artist: artwork.artist || 'Unknown',
        year: artwork.year || null,
        date: artwork.dateStr || '',
        image: artwork.image || '',
        thumbnails: {},
        roomId: artwork.room || 'default',
        exhibitionId: exhibitionId,
        exhibitionTitle: 'Kunsthistorisches Museum Collection',
        exhibitionName: 'KHM Collection',
        sourceUrl: artwork.url || '',
        description: artwork.description || '',
        medium: artwork.medium || '',
        dimensions: artwork.dimensions || '',
        inventory: artwork.inventory || artwork.id,
        classification: artwork.classification || '',
        objectType: artwork.objectType || '',
        culture: artwork.culture || '',
        period: artwork.period || '',
        provenance: artwork.provenance || '',
        location: artwork.location || '',
        source: artwork.source || 'Kunsthistorisches Museum Vienna',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Skip if no image
      if (!docData.image) {
        console.log(`   ⏭️  Skipped ${artwork.id}: No image`);
        skipped++;
        continue;
      }
      
      // Upload to Firestore
      const docRef = db.collection('exhibition_artworks')
        .doc(exhibitionId)
        .collection('artworks')
        .doc(artwork.id);
      
      await docRef.set(docData, { merge: true });
      
      uploaded++;
      console.log(`   ✓ [${uploaded}/${data.totalObjects}] ${artwork.title.substring(0, 50)}...`);
      
    } catch (error) {
      console.error(`   ❌ Error uploading ${artwork.id}:`, error.message);
      errors++;
    }
  }
  
  console.log('\n════════════════════════════════════════════════════\n');
  console.log('✅ Upload Complete!\n');
  console.log(`   Uploaded: ${uploaded}`);
  console.log(`   Skipped:  ${skipped}`);
  console.log(`   Errors:   ${errors}`);
  console.log(`   Total:    ${data.totalObjects}`);
  console.log('\n════════════════════════════════════════════════════\n');
}

uploadKHMCollection()
  .then(() => {
    console.log('✅ All done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
