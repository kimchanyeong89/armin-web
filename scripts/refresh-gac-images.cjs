const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '../public/data');

const isJsonFile = (f) => f.endsWith('.json');
const shouldSkip = (f) => f.startsWith('search-index') || f.startsWith('search-manifest') || f.includes('.backup');

const GAC_COOKIE = process.env.GAC_COOKIE || '';

const fetchOgImage = (url, depth = 0) => new Promise((resolve) => {
  if (!url || depth > 5) return resolve(null);

  const req = https.request(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
      ...(GAC_COOKIE ? { 'Cookie': GAC_COOKIE } : {})
    }
  }, (res) => {
    const status = res.statusCode || 0;
    const location = res.headers.location;

    if (status >= 300 && status < 400 && location) {
      const nextUrl = new URL(location, url).toString();
      res.resume();
      return resolve(fetchOgImage(nextUrl, depth + 1));
    }

    let html = '';
    res.on('data', (chunk) => { html += chunk; });
    res.on('end', () => {
      const match = html.match(/property="og:image" content="([^"]+)"/);
      resolve(match ? match[1] : null);
    });
  });

  req.on('error', () => resolve(null));
  req.end();
});

const extractItems = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.objects)) return data.objects;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.artworks)) return data.artworks;
  if (Array.isArray(data.rooms)) return data.rooms.flatMap((room) => room.artworks || room.items || []);
  return null;
};

const isGacItem = (item) => {
  const src = String(item?.sourceUrl || item?.url || '');
  return src.includes('artsandculture.google.com');
};

const run = async () => {
  const files = fs.readdirSync(DATA_DIR).filter(isJsonFile).filter((f) => !shouldSkip(f));

  let totalUpdated = 0;
  let totalFailed = 0;
  let totalFiles = 0;
  const failures = [];

  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch {
      continue;
    }

    const items = extractItems(json);
    if (!items || items.length === 0) continue;

    const targets = items.filter((item) => isGacItem(item));
    if (targets.length === 0) continue;

    totalFiles++;
    let updated = 0;
    let failed = 0;

    const concurrency = 4;
    let index = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (index < targets.length) {
        const i = index++;
        const item = targets[i];
        const src = item.sourceUrl || item.url;
        if (!src) continue;

        const og = await fetchOgImage(src);
        if (og) {
          if (item.image !== og) {
            item.image = og;
            updated++;
          }
        } else {
          failed++;
          failures.push({
            file,
            id: item.id,
            title: item.title || item.name || 'Untitled',
            sourceUrl: src
          });
        }
      }
    });

    await Promise.all(workers);

    if (updated > 0) {
      fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
    }

    totalUpdated += updated;
    totalFailed += failed;
    console.log(`${file}: updated ${updated}, failed ${failed}`);
  }

    const failureReportPath = path.join(DATA_DIR, 'gac-image-refresh-failures.json');
    fs.writeFileSync(failureReportPath, JSON.stringify({
      t: new Date().toISOString(),
      totalFiles,
      updated: totalUpdated,
      failed: totalFailed,
      failures
    }, null, 2));

    console.log(`\nDone. Files scanned: ${totalFiles}, images updated: ${totalUpdated}, failed: ${totalFailed}`);
    console.log(`Failure report: ${failureReportPath} (${failures.length} items)`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
