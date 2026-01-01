#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/data');
const inputFile = path.join(DATA_DIR, 'mucem-collection.json');

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// 분류별로 분리
const prints = data.objects.filter(o => o.medium === 'Print');
const drawings = data.objects.filter(o => o.medium === 'Drawing');
const paintings = data.objects.filter(o => o.medium === 'Painting' || o.medium === 'Photography');

console.log('Print:', prints.length);
console.log('Drawing:', drawings.length);
console.log('Painting/Photography:', paintings.length);
console.log('Total:', data.objects.length);

// 판화 파일 저장
if (prints.length > 0) {
  const printsData = {
    collection: 'Mucem - Prints',
    museum: 'Mucem, Marseille',
    scrapedAt: data.scrapedAt,
    totalItems: prints.length,
    objects: prints.map((p, i) => ({ ...p, id: `mucem-prints-${i + 1}` }))
  };
  fs.writeFileSync(path.join(DATA_DIR, 'mucem-prints.json'), JSON.stringify(printsData, null, 2));
  console.log('Saved mucem-prints.json');
}

// 드로잉 파일 저장
if (drawings.length > 0) {
  const drawingsData = {
    collection: 'Mucem - Drawings',
    museum: 'Mucem, Marseille',
    scrapedAt: data.scrapedAt,
    totalItems: drawings.length,
    objects: drawings.map((d, i) => ({ ...d, id: `mucem-drawings-${i + 1}` }))
  };
  fs.writeFileSync(path.join(DATA_DIR, 'mucem-drawings.json'), JSON.stringify(drawingsData, null, 2));
  console.log('Saved mucem-drawings.json');
}

// 회화/사진 파일 저장 (기존 mucem-collection.json으로)
if (paintings.length > 0) {
  const paintingsData = {
    collection: 'Mucem - Paintings',
    museum: 'Mucem, Marseille',
    scrapedAt: data.scrapedAt,
    totalItems: paintings.length,
    objects: paintings.map((p, i) => ({ ...p, id: `mucem-paintings-${i + 1}` }))
  };
  fs.writeFileSync(path.join(DATA_DIR, 'mucem-paintings.json'), JSON.stringify(paintingsData, null, 2));
  console.log('Saved mucem-paintings.json');
}

console.log('Done! Split into separate files.');
