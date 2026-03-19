// Fix Walker image URLs: Special:FilePath → direct Wikimedia thumb URLs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '../public/data/walker-art-gallery-collection.json');

function buildThumbUrl(commonsFilePath, width = 600) {
  // commonsFilePath: "http://commons.wikimedia.org/wiki/Special:FilePath/ENCODED_NAME"
  const encodedName = commonsFilePath.split('/').pop();
  let decodedName = decodeURIComponent(encodedName).replace(/ /g, '_');
  
  // Remove any leading "File:" prefix if present
  if (decodedName.startsWith('File:')) decodedName = decodedName.slice(5);
  
  // Wikimedia Commons thumbnail URL uses MD5 of the normalized filename
  const md5 = crypto.createHash('md5').update(decodedName).digest('hex');
  const dir1 = md5[0];
  const dir2 = md5[0] + md5[1];
  
  // Re-encode for URL (spaces → underscores already done above)
  const encodedForUrl = encodeURIComponent(decodedName).replace(/%20/g, '_');
  
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir1}/${dir2}/${encodedForUrl}/${width}px-${encodedForUrl}`;
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let fixed = 0;
let skipped = 0;

data.objects = data.objects.map(obj => {
  if (!obj.commonsFile) { skipped++; return obj; }
  const thumbUrl = buildThumbUrl(obj.commonsFile, 600);
  fixed++;
  return { ...obj, image: thumbUrl };
});

// Show samples
console.log('Fixed:', fixed, 'Skipped:', skipped);
console.log('Sample URLs:');
data.objects.slice(0, 3).forEach(o => console.log(' ', o.title, '\n  ', o.image));

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log('\nSaved.');
