const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseTitle(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) return { title: '', artist: '', year: null };
  
  const parts = titleMatch[1].split('|').map(p => p.trim());
  let artworkTitle = parts[0] || '';
  artworkTitle = artworkTitle.replace(/\s*[—–-]\s*Dulwich Picture Gallery$/i, '').trim();
  
  let artist = '';
  if (parts.length >= 2 && !parts[1].includes('Dulwich Picture Gallery')) {
    artist = parts[1].trim();
  }
  
  // If no artist in title, try to extract from HTML body
  if (!artist) {
    // Look for artist name in description that mentions "artist Name (year-year)"
    const descArtist = html.match(/by (?:the )?(?:[A-Za-z]+ )?artist ([A-Z][a-z]+(?:\s+(?:van\s+)?[A-Za-z]+)*)\s*\(/i);
    if (descArtist) {
      artist = descArtist[1].trim();
    }
  }
  
  const descMatch = html.match(/name="description"\s+content="[^"]*?(\b1[0-9]{3}\b|\b20[0-2][0-9]\b)[^"]*?"/i);
  let year = null;
  if (descMatch) {
    const possibleYear = parseInt(descMatch[1]);
    if (possibleYear >= 1200 && possibleYear <= 2025) year = possibleYear;
  }
  
  return { title: artworkTitle, artist, year };
}

function extractRoom(html) {
  const roomMatch = html.match(/<p class="c-callout-box__room">in Room (\d+)<\/p>/i);
  return roomMatch ? 'Room ' + roomMatch[1] : null;
}

async function test() {
  const urls = [
    'https://www.dulwichpicturegallery.org.uk/explore/explore-the-collection/the-triumph-of-david/',
    'https://www.dulwichpicturegallery.org.uk/explore/explore-the-collection/girl-at-a-window/',
    'https://www.dulwichpicturegallery.org.uk/explore/explore-the-collection/a-young-man/'
  ];
  
  for (const url of urls) {
    const html = await httpsGet(url);
    const { title, artist, year } = parseTitle(html);
    const room = extractRoom(html);
    console.log({ title, artist, year, room });
  }
}

test();
