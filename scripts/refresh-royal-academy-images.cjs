const fs = require('fs');
const path = require('path');
const https = require('https');

const INPUT = path.join(__dirname, '../public/data/royal-academy-collection.json');

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const items = Array.isArray(data.objects) ? data.objects : [];

const fetchOgImage = (url) => new Promise((resolve) => {
  https.get(url, (res) => {
    let html = '';
    res.on('data', (chunk) => { html += chunk; });
    res.on('end', () => {
      const match = html.match(/property="og:image" content="([^"]+)"/);
      resolve(match ? match[1] : null);
    });
  }).on('error', () => resolve(null));
});

const run = async () => {
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const concurrency = 5;
  let index = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      if (!item || !item.sourceUrl) {
        skipped++;
        continue;
      }

      const og = await fetchOgImage(item.sourceUrl);
      if (og) {
        if (item.image !== og) {
          item.image = og;
          updated++;
        } else {
          skipped++;
        }
      } else {
        failed++;
      }
    }
  });

  await Promise.all(workers);

  fs.writeFileSync(INPUT, JSON.stringify(data, null, 2));
  console.log(`Updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
