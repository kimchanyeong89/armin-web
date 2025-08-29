#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = '/Users/kietzsche/Downloads/armin-web-firebase-adminsdk-fbsvc-ee83756740.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'armin-web'
});

const db = admin.firestore();

const room2Data = [
  {
    "id": "room2-1",
    "name": "Workshop of Sandro Botticelli",
    "artist": "Workshop of Sandro Botticelli | The Virgin and Child with a Pomegranate | NG2906 | National Gallery, London",
    "image": "https://www.nationalgallery.org.uk/media/40peqyrn/n-1034-00-000082-xl-hd.jpg?rxy=0.46,0.65747126436781611&width=800&height=800&v=1dbcbe97b688ef0&bgcolor=fff0&format=webp",
    "roomId": "2",
    "exhibitionTitle": "European Paintings",
    "exhibitionId": "ng-1",
    "sourceUrl": "https://www.nationalgallery.org.uk/paintings/NG2906",
    "createdAt": "2025-08-29T02:58:07.063Z"
  },
  {
    "id": "room2-2",
    "name": "Italian, North",
    "artist": "Italian, North | The Madonna and Child | NG2907 | National Gallery, London",
    "image": "https://www.nationalgallery.org.uk/media/a0vll0x3/n-1062-00-000013-web-hd.jpg?rxy=0.635,0.42350332594235035&width=800&height=800&v=1dbcbe9f5a0b490&bgcolor=fff0&format=webp",
    "roomId": "2",
    "exhibitionTitle": "European Paintings",
    "exhibitionId": "ng-1",
    "sourceUrl": "https://www.nationalgallery.org.uk/paintings/NG2907",
    "createdAt": "2025-08-29T02:58:07.065Z"
  }
];

async function upload() {
  console.log('Uploading Room 2 artworks to Firestore...');
  for (const item of room2Data) {
    await db.collection('artworks').doc(item.id).set(item, { merge: true });
    console.log('Saved:', item.id);
  }
  console.log('All Room 2 artworks uploaded successfully!');
}

upload().catch(console.error);
