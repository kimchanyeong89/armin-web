const fs = require('fs');
const https = require('https');

function getHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = 'https://www.vangoghmuseum.nl' + loc;
        return getHtml(loc).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

async function fix() {
  const file = 'public/data/vangogh-museum-collection.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let fixed = 0;
  
  // Use Promise.all with concurrency limit
  const limit = 20;
  let active = 0;
  let index = 0;
  
  const processNext = async () => {
    if (index >= data.length) return;
    const i = index++;
    const art = data[i];
    
    // Check if broken
    if (art.title === art.id || String(art.title).match(/^[A-Za-z0-9]+$/)) {
      if (art.imageUrl && art.imageUrl.length > 5 && art.url) {
        try {
          const html = await getHtml(art.url);
          const titleMatch = html.match(/<title>(.*?) - Van Gogh Museum<\/title>/i) || html.match(/<title>(.*?)<\/title>/i);
          if (titleMatch) {
            const rawTitle = titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
            art.title = rawTitle;
            if (art.artist && art.artist !== 'Vincent van Gogh') {
              if (art.artist.length > 30) art.artist = 'Unknown';
            }
            fixed++;
            console.log(`Fixed ${art.id}: ${art.title}`);
          } else {
             console.log(`Title not found for ${art.id}`);
          }
        } catch (e) {
          console.error(`Failed ${art.id}`, e.message);
        }
      }
    }
    await processNext();
  };

  const workers = Array.from({length: limit}, processNext);
  await Promise.all(workers);

  console.log('Fixed', fixed, 'items');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

fix();
