/**
 * Fix Carnavalet image URLs: replace expired/restricted ?ID=XXXXX params with ?ID=447000
 * This universally valid param allows thumbnails to load without session authentication.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  '../public/data/carnavalet-paintings.json',
  '../public/data/carnavalet-prints.json',
];

function fixUrl(url) {
  if (!url || !url.includes('grandpalaisrmn.fr')) return url;
  // Replace ?ID=anything or ?eJy... with ?ID=447000
  return url.replace(/\?(?:ID=[^&\s]+|eJ[A-Za-z0-9+/_~-]+)/, '?ID=447000');
}

for (const file of FILES) {
  const filePath = path.join(__dirname, file);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const objects = data.objects || [];
  let fixed = 0;
  for (const obj of objects) {
    const original = obj.image;
    const newUrl = fixUrl(original);
    if (newUrl !== original) {
      obj.image = newUrl;
      fixed++;
    }
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Fixed ${fixed}/${objects.length} image URLs in ${path.basename(file)}`);
}
console.log('Done.');
