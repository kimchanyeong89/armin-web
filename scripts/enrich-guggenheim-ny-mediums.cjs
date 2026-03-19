const fs = require('fs');
const path = require('path');
const https = require('https');
const cheerio = require('cheerio');

const INPUT_FILE = path.join(__dirname, '../public/data/guggenheim-ny-collection.json');

const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
const SLEEP_MS = Number(process.env.SLEEP_MS || 150);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, (res) => {
      const { statusCode } = res;
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (statusCode && statusCode >= 200 && statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${statusCode} for ${url}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function decodeEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseOgAlt(html) {
  if (!html) return { medium: '', dimensions: '' };
  const $ = cheerio.load(html);
  const alt = $('meta[property="og:image:alt"]').attr('content') || '';
  if (!alt) return { medium: '', dimensions: '' };

  // Pattern is typically: "Artist, Title, Date. Medium, Dimensions"
  const firstDotSpace = alt.indexOf('. ');
  const tail = firstDotSpace >= 0 ? alt.slice(firstDotSpace + 2).trim() : '';
  if (!tail) return { medium: '', dimensions: '' };

  const parts = decodeEntities(tail).split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { medium: tail, dimensions: '' };

  const medium = parts[0];
  const dimensions = parts.slice(1).join(', ').trim();
  return { medium, dimensions };
}

function classifyCategoryFromMedium(medium, existingCategory) {
  const base = (existingCategory || '').trim() || 'Artwork';
  const text = (medium || '').toLowerCase();
  if (!text) return base;

  if (/(film|video|single-channel|projection|color sound)/.test(text)) return 'Film/Video';
  if (/installation/.test(text)) return 'Installation';
  if (/internet|website|browser/.test(text)) return 'Internet Art';

  if (/photograph|photography|gelatin silver|chromogenic|c-?print|inkjet print|archival pigment print/.test(text)) return 'Photography';

  if (/sculptur|sculpture|bronze|marble|steel|iron|aluminum|aluminium|wood|plaster|ceramic|ceramics|porcelain|stone|glass|plexiglass|found object|assemblage/.test(text)) {
    return 'Sculpture';
  }

  if (/drawing|gouache|watercolor|watercolour|ink on paper|etching|lithograph|screen\s?print|serigraph|serigraf|monotype|woodcut|engraving|pencil|charcoal|pastel|crayon/.test(text)) {
    return 'Work on Paper';
  }
  // Generic "print" matches "Inkjet print", so we should check for photography first.
  if (/print\b/.test(text) && !/inkjet|c-?print|photographic/.test(text)) {
      return 'Work on Paper';
  }
  if (/\bon paper\b/.test(text) && !/newspaper/.test(text)) {
    return 'Work on Paper';
  }

  if (/(oil|acrylic|tempera|enamel|paint)/.test(text) && /(canvas|board|panel|linen|masonite)\b/.test(text)) {
    return 'Painting';
  }
  if (/mixed media/.test(text) && /(canvas|board|panel|linen)\b/.test(text)) {
    return 'Painting';
  }
  if (/oil on/.test(text)) return 'Painting';

  return base;
}

async function processOne(obj, idx, total) {
  // Always clean existing text fields
  ['title', 'artist'].forEach(field => {
    if (obj[field]) obj[field] = decodeEntities(obj[field]);
  });

  const url = obj.sourceUrl || `https://www.guggenheim.org/artwork/${obj.id}`;
  if (!url) return { updated: false, skipped: true };

  try {
    const html = await fetchHtml(url);
    const { medium, dimensions } = parseOgAlt(html);
    if (!medium && !dimensions) {
      process.stdout.write(`- ${idx + 1}/${total} ${obj.id}: no og:image:alt\n`);
      return { updated: false, skipped: true };
    }

    const next = { ...obj };
    if (medium) next.medium = medium;
    if (dimensions) next.dimensions = dimensions;

    const newCategory = classifyCategoryFromMedium(next.medium, next.category);
    next.category = newCategory;

    // Update categories[] list: prioritize newCategory, drop plain 'Artwork' when we have a better label
    const existingCats = Array.isArray(obj.categories) ? obj.categories : [];
    const set = new Set(existingCats.map((c) => String(c || '').trim()).filter(Boolean));
    if (newCategory && newCategory !== 'Artwork') {
      set.delete('Artwork');
    }
    if (newCategory) set.add(newCategory);
    next.categories = Array.from(set);

    Object.assign(obj, next);
    process.stdout.write(`+ ${idx + 1}/${total} ${obj.id}: ${next.medium || ''} [${next.category}]\n`);
    return { updated: true, skipped: false };
  } catch (e) {
    process.stderr.write(`! ${idx + 1}/${total} ${obj.id}: ${url} -> ${e && e.message}\n`);
    return { updated: false, skipped: false, error: true };
  } finally {
    await sleep(SLEEP_MS);
  }
}

async function run() {
  const raw = fs.readFileSync(INPUT_FILE, 'utf8');
  const data = JSON.parse(raw);
  const objects = Array.isArray(data.objects) ? data.objects : [];

  const total = objects.length;
  console.log(`Loaded ${total} Guggenheim NY artworks`);

  let index = 0;
  let active = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  await new Promise((resolve) => {
    const launchNext = () => {
      if (index >= total && active === 0) {
        resolve();
        return;
      }
      while (active < CONCURRENCY && index < total) {
        const i = index++;
        const obj = objects[i];
        active += 1;
        processOne(obj, i, total)
          .then((res) => {
            if (res.updated) updatedCount += 1;
            if (res.skipped) skippedCount += 1;
            if (res.error) errorCount += 1;
          })
          .catch((e) => {
            errorCount += 1;
            process.stderr.write(`Unexpected error at ${i + 1}/${total}: ${e && e.message}\n`);
          })
          .finally(() => {
            active -= 1;
            launchNext();
          });
      }
    };
    launchNext();
  });

  fs.writeFileSync(INPUT_FILE, JSON.stringify(data, null, 2));
  console.log(`\nDone. updated=${updatedCount}, skippedNoAlt=${skippedCount}, errors=${errorCount}`);
}

if (require.main === module) {
  run().catch((e) => {
    console.error('Fatal error in enrich-guggenheim-ny-mediums:', e);
    process.exit(1);
  });
}
