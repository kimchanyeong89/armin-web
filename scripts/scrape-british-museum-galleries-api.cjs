const fs = require('fs');
const path = require('path');
const https = require('https');

(async () => {
  const outPath = path.join(process.cwd(), 'public', 'data', 'british-museum-galleries.json');
  const base = 'https://www.britishmuseum.org';
  const apiBase = 'https://www.britishmuseum.org/api/v2';

  // Known gallery rooms with their search terms
  const rooms = [
    { id: '4', title: 'Egyptian Sculpture', search: 'room 4' },
    { id: '6', title: 'Assyrian Reliefs', search: 'room 6' },
    { id: '7', title: 'The Rodin Sculpture', search: 'room 7' },
    { id: '33', title: 'Greek and Roman Sculpture', search: 'room 33' },
    { id: '10', title: 'Living and Dying', search: 'room 10' },
    { id: '12', title: 'Enlightenment', search: 'room 12' },
    { id: '14', title: 'Clocks and Watches', search: 'room 14' },
    { id: '18', title: 'German Expressionism', search: 'room 18' },
    { id: '20', title: 'British Landscapes', search: 'room 20' },
    { id: '24', title: 'Impressionism', search: 'room 24' },
    { id: '25', title: 'Post-Impressionism', search: 'room 25' },
    { id: '26', title: 'Twentieth Century Art', search: 'room 26' },
    { id: '27', title: 'Contemporary Art', search: 'room 27' },
    { id: '40', title: 'Sutton Hoo and Europe', search: 'room 40' },
    { id: '41', title: 'Gupta Empire', search: 'room 41' },
    { id: '50', title: 'Early America', search: 'room 50' },
    { id: '52', title: 'Africa, Americas and Oceania', search: 'room 52' },
    // Add more rooms as needed
  ];

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  function parseYear(s) {
    if (!s) return 0;
    const m = String(s).match(/(\d{3,4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  const resultRooms = [];
  for (const room of rooms) {
    try {
      console.log(`Fetching objects for Room ${room.id}: ${room.title}`);
      const searchUrl = `${apiBase}/object?search=${encodeURIComponent(room.search)}&limit=50`;
      const data = await fetchJson(searchUrl);
      const items = (data.objects || []).map(obj => ({
        id: obj.objectNumber || obj.id || Math.random().toString(36).slice(2),
        name: obj.title || obj.object || 'Object',
        artist: obj.artist || '',
        year: parseYear(obj.date),
        image: obj.primaryImageSmall || obj.primaryImage || undefined,
        url: obj.url || `${base}/collection/object/${obj.objectNumber}`
      })).filter(it => it.image); // Only items with images
      if (items.length > 0) {
        resultRooms.push({
          id: room.id,
          title: `Room ${room.id}: ${room.title}`,
          url: `${base}/collection/galleries/room-${room.id}-${room.title.toLowerCase().replace(/\s+/g, '-')}`,
          items
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch room ${room.id}: ${e.message}`);
    }
  }

  const payload = {
    description: 'British Museum galleries — objects by room (via API)',
    source: `${base}/collection/galleries`,
    scrapedAt: new Date().toISOString(),
    rooms: resultRooms
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${outPath} with ${resultRooms.length} rooms.`);
})();