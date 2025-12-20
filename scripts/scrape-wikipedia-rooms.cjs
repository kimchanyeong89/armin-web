const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

(async () => {
  const outPath = path.join(process.cwd(), 'public', 'data', 'british-museum-galleries.json');
  const base = 'https://www.britishmuseum.org';

  // Get rooms from main British Museum Wikipedia page
  const mainUrl = 'https://en.wikipedia.org/wiki/British_Museum';
  const { data: mainData } = await axios.get(mainUrl);
  const $main = cheerio.load(mainData);

  const roomPages = [];
  // Find all links that mention "Room" in text or href
  $main('a').each((i, el) => {
    const href = $main(el).attr('href');
    const text = $main(el).text().trim();
    if (href && (text.includes('Room') || href.includes('Room')) && href.startsWith('/wiki/')) {
      const match = text.match(/Room\s+(\d+[A-Z]?)/) || href.match(/Room[_-](\d+[A-Z]?)/);
      if (match) {
        const id = match[1];
        if (!roomPages.find(r => r.id === id)) {
          roomPages.push({
            id,
            title: text.replace(/^Room\s+\d+[A-Z]?:\s*/, ''),
            wiki: `https://en.wikipedia.org${href}`
          });
        }
      }
    }
  });

  console.log(`Found ${roomPages.length} room pages from main page:`, roomPages.map(r => r.id));

  function parseYear(s) {
    if (!s) return 0;
    const m = String(s).match(/(\d{3,4})/);
    return m ? parseInt(m[1], 10) : 0;
  }

  const resultRooms = [];
  for (const room of roomPages.slice(0, 20)) { // Limit to 20 for testing
    try {
      console.log(`Fetching from Wikipedia: ${room.wiki}`);
      const { data, status } = await axios.get(room.wiki, { validateStatus: () => true });
      if (status !== 200) {
        console.log(`Room ${room.id} page not found (status ${status})`);
        continue;
      }
      const $ = cheerio.load(data);

      const items = [];
      // Find tables with artworks (wikitable)
      $('table.wikitable tr').each((i, el) => {
        const tds = $(el).find('td');
        if (tds.length >= 3) {
          const img = $(tds[0]).find('img').attr('src');
          const name = $(tds[1]).text().trim();
          const artist = $(tds[2]).text().trim();
          const year = parseYear($(tds[3]).text().trim());
          const link = $(tds[1]).find('a').attr('href');
          let bmUrl = '';
          if (link && link.includes('britishmuseum.org')) {
            bmUrl = link.startsWith('http') ? link : `https://en.wikipedia.org${link}`;
          } else {
            // Try to find BM link in the cell
            const bmLink = $(tds[1]).find('a[href*="britishmuseum.org"]').attr('href');
            if (bmLink) bmUrl = bmLink.startsWith('http') ? bmLink : `https://en.wikipedia.org${bmLink}`;
          }
          if (name && img) {
            items.push({
              id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
              name,
              artist,
              year,
              image: img.startsWith('//') ? `https:${img}` : img,
              url: bmUrl || `https://en.wikipedia.org/wiki/${name.replace(/\s+/g, '_')}`
            });
          }
        }
      });

      console.log(`Room ${room.id}: found ${items.length} items`);

      if (items.length > 0) {
        resultRooms.push({
          id: room.id,
          title: `Room ${room.id}: ${room.title}`,
          url: `${base}/collection/galleries/room-${room.id}`,
          items: items.slice(0, 50) // Limit to 50 per room
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch room ${room.id}: ${e.message}`);
    }
  }

  const payload = {
    description: 'British Museum galleries — objects by room (from Wikipedia)',
    source: 'https://en.wikipedia.org/wiki/British_Museum',
    scrapedAt: new Date().toISOString(),
    rooms: resultRooms
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${outPath} with ${resultRooms.length} rooms.`);
})();