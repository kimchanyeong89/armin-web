#!/usr/bin/env node
// Upload Room 2 artworks to Firestore

const admin = require('firebase-admin');
const fs = require('fs');

// Service account JSON path
const serviceAccountPath = '/Users/kietzsche/Downloads/armin-web-firebase-adminsdk-fbsvc-ee83756740.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'armin-web'
});

const db = admin.firestore();

const room2Data = [
  {
    id: 'the-raising-of-lazarus',
    name: 'The Raising of Lazarus',
    artist: 'Sebastiano del Piombo, incorporating designs by Michelangelo',
    image: 'https://www.nationalgallery.org.uk/media/0cdn2di4/n-0001-00-000075-fs-hd.jpg?rxy=0.33406593406593404,0.3946932006633499&width=800&height=800&v=1dbcbd3b3d3c5e0&bgcolor=fff0&format=webp',
    date: '2017',
    dimension: '',
    roomId: '2',
    exhibitionTitle: 'European Paintings',
    exhibitionId: 'ng-1',
    sourceUrl: 'https://www.nationalgallery.org.uk/paintings/sebastiano-del-piombo-the-raising-of-lazarus',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'the-manchester-madonna',
    name: 'The Manchester Madonna',
    artist: 'Michelangelo',
    image: 'https://www.nationalgallery.org.uk/media/pedam551/n-0809-00-000130-xl-hd.jpg?rxy=0.62555066079295152,0.19381107491856678&width=800&height=800&v=1dbcbe548601f90&bgcolor=fff0&format=webp',
    date: '2017',
    dimension: '',
    roomId: '2',
    exhibitionTitle: 'European Paintings',
    exhibitionId: 'ng-1',
    sourceUrl: 'https://www.nationalgallery.org.uk/paintings/michelangelo-the-manchester-madonna',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'leda-and-the-swan',
    name: 'Leda and the Swan',
    artist: 'Paolo Veronese',
    image: 'https://www.nationalgallery.org.uk/media/cqqfqhcq/n-1868-00-000014-web-hd.jpg?rxy=0.60992907801418439,0.20187793427230047&width=800&height=800&v=1dbcbf17ccb0b80&bgcolor=fff0&format=webp',
    date: '',
    dimension: '',
    roomId: '2',
    exhibitionTitle: 'European Paintings',
    exhibitionId: 'ng-1',
    sourceUrl: 'https://www.nationalgallery.org.uk/paintings/paolo-veronese-leda-and-the-swan',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'the-dream-of-human-life',
    name: 'The Dream of Human Life',
    artist: 'Domenico Fetti',
    image: 'https://www.nationalgallery.org.uk/media/h1fj1a00/n-0008-00-000014-web-hd.jpg?rxy=0.54065934065934063,0.41068139963167588&width=800&height=800&v=1dbcbd3ff42d6b0&bgcolor=fff0&format=webp',
    date: '',
    dimension: '',
    roomId: '2',
    exhibitionTitle: 'European Paintings',
    exhibitionId: 'ng-1',
    sourceUrl: 'https://www.nationalgallery.org.uk/paintings/domenico-fetti-the-dream-of-human-life',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'the-holy-family-il-silenzio',
    name: 'The Holy Family (Il Silenzio)',
    artist: 'Vincenzo Catena',
    image: 'https://www.nationalgallery.org.uk/media/wamip5bi/n-1227-00-000029-fs-hd.jpg?rxy=0.79166666666666663,0.23861171366594361&width=800&height=800&v=1dbcbece438a700&bgcolor=fff0&format=webp',
    date: '',
    dimension: '',
    roomId: '2',
    exhibitionTitle: 'European Paintings',
    exhibitionId: 'ng-1',
    sourceUrl: 'https://www.nationalgallery.org.uk/paintings/vincenzo-catena-the-holy-family-il-silenzio',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
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

upload().catch(err => {
  console.error('Error uploading:', err);
  process.exit(1);
});
