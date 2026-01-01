const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/data/wallace-collection.json', 'utf8'));

// 잘못된 층 이름 방 삭제
const badNames = ['Ground Floor', 'Lower Ground Floor'];
data.rooms = data.rooms.filter(r => !badNames.includes(r.originalName));

// ID 재정렬
data.rooms.forEach((room, idx) => {
  room.id = 'room-' + (idx + 1);
  room.name = 'Room ' + (idx + 1);
});

data.totalRooms = data.rooms.length;
data.totalArtworks = data.rooms.reduce((sum, r) => sum + r.artworks.length, 0);
data.artworksWithImages = data.totalArtworks;

fs.writeFileSync('public/data/wallace-collection.json', JSON.stringify(data, null, 2));
console.log('✅ 잘못된 방 삭제. 총', data.rooms.length, '개 방,', data.totalArtworks, '개 작품');
