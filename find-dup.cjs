const fs = require('fs');

function findItem(str) {
  const files = fs.readdirSync('public/data').filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
      if (Array.isArray(data) === false) continue;
      for (const item of data) {
        if (typeof item.title === 'string' && item.title.includes(str)) {
          console.log(`Found in: ${f}`);
          console.log({ id: item.id, title: item.title, artist: item.artist, museum: item.museumLabel || item.museum });
        }
      }
    } catch(e) {}
  }
}

console.log("Searching for Kop van een vrouw...");
findItem('Kop van een vrouw');

console.log("\nSearching for Vue du viaduc...");
findItem('Vue du viaduc');

console.log("\nSearching for La femme en rouge...");
findItem('La femme en rouge');
