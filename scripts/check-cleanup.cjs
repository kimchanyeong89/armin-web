const data = require('../public/data/royal-academy-collection.json');
const items = data.objects;

// 문제 항목들 확인
console.log('🔍 문제 항목들 확인:\n');

// #58 - Cast of composite capital
const item58 = items.find(d => d.title && d.title.includes('Cast of composite'));
console.log('#58 Cast of composite capital:');
console.log('  제목:', item58?.title);
console.log('  작가:', item58?.artist);
console.log('');

// #108 - Petition of female students
const item108 = items.find(d => d.title && d.title.includes('Petition of female'));
console.log('#108 Petition of female students:');
console.log('  제목:', item108?.title);
console.log('  작가:', item108?.artist);
console.log('');

// #110 - A Shilling well laid out
const item110 = items.find(d => d.title && d.title.includes('Shilling well'));
console.log('#110 A Shilling well laid out:');
console.log('  제목:', item110?.title);
console.log('  작가:', item110?.artist);
console.log('');

// #111 - Exhibition Room, Somerset House
const item111 = items.find(d => d.title && d.title.includes('Somerset House'));
console.log('#111 Exhibition Room, Somerset House:');
console.log('  제목:', item111?.title);
console.log('  작가:', item111?.artist);
console.log('');

// #119 - From Artists at Home
const item119 = items.find(d => d.title && d.title.includes('Artists at Home'));
console.log('#119 From Artists at Home:');
console.log('  제목:', item119?.title);
console.log('  작가:', item119?.artist);
console.log('');

// #121 - New Buildings of London University
const item121 = items.find(d => d.title && d.title.includes('London University'));
console.log('#121 New Buildings of London University:');
console.log('  제목:', item121?.title);
console.log('  작가:', item121?.artist);
console.log('');

// #168 - Royal Academy Poster for The Great Japan
const item168 = items.find(d => d.title && d.title.includes('Great Japan'));
console.log('#168 Royal Academy Poster for The Great Japan:');
console.log('  제목:', item168?.title);
console.log('  작가:', item168?.artist);
console.log('');

// Design by / Photographed by 패턴 확인
console.log('\n📄 "Design by" 또는 "Photographed by" 패턴 남은 항목:');
const designByItems = items.filter(d => 
  d.artist && (/^Design\s+by/i.test(d.artist) || /^Photographed\s+by/i.test(d.artist))
);
designByItems.forEach(d => console.log('  -', d.artist));
console.log('총:', designByItems.length);

// 월만 있는 작가
console.log('\n📄 월 이름만 있는 작가:');
const monthOnlyArtists = items.filter(d => {
  if (!d.artist || d.artist === 'Unknown') return false;
  return /^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(d.artist.trim());
});
monthOnlyArtists.forEach(d => console.log('  -', d.artist, '|', d.title));
console.log('총:', monthOnlyArtists.length);

// pl. 패턴 확인
console.log('\n📄 pl. 패턴 남은 제목:');
const plItems = items.filter(d => d.title && /pl\.\s*\[?\d+\]?/i.test(d.title));
plItems.forEach(d => console.log('  -', d.title));
console.log('총:', plItems.length);
