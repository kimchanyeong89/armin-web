const fs = require('fs');
const path = require('path');

async function main() {
  const dataPath = path.join(__dirname, '../public/data/marmottan-collection.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let changed = 0;
  for (const obj of data.objects) {
    if (obj.title && obj.title.match(/^\d{4}\s*[;\-]\s*\d{4}$/)) {
      console.log(`Fixing: ${obj.artist} | ${obj.title} | ${obj.year}`);
      const realTitle = obj.year;
      obj.title = realTitle;
      obj.year = '';

      if (obj.detailUrl) {
        try {
          const res = await fetch(obj.detailUrl);
          const html = await res.text();
          
          // E.g. <title>AU BAL (1875) - Musée Marmottan Monet</title>
          const titleMatch = html.match(/<title>\s*(.*?)\s*<\/title>/);
          if (titleMatch) {
             const pageTitle = titleMatch[1];
             // Sometimes it looks like "AU BAL (1875) -"
             const yearMatch = pageTitle.match(/\((\d{4})\)/);
             if (yearMatch) {
                obj.year = yearMatch[1];
             } else {
                // If it's not in parens, look for any 1xxx or 18xx
                const yMatch = pageTitle.match(/\b(1\d{3}|20\d{2})\b/);
                if (yMatch) obj.year = yMatch[1];
             }
          }
          console.log(`-> New Title: "${obj.title}", New Year: "${obj.year}"`);
          changed++;
        } catch(e) {
          console.error(e.message);
        }
      }
    }
  }

  if (changed > 0) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`Fixed ${changed} items. Saved to ${dataPath}`);
  }
}
main();