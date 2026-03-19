#!/usr/bin/env node
/**
 * Enrich Versailles collection with Joconde API metadata.
 * Downloads all 6487 Versailles records from the Joconde DB (M5077)
 * and matches them by inventory number to update title/artist/year/medium.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const JOCONDE_CACHE = '/tmp/joconde-versailles-v2.json';
const VERSAILLES_FILE = path.join(__dirname, '../public/data/versailles-collection.json');
const DELAY_MS = 1500; // 1.5 seconds between requests

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('parse error: ' + data.slice(0, 100))); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
  });
}

async function downloadJoconde() {
  if (fs.existsSync(JOCONDE_CACHE)) {
    console.log('📁 Using cached Joconde data from', JOCONDE_CACHE);
    return JSON.parse(fs.readFileSync(JOCONDE_CACHE, 'utf8'));
  }

  console.log('📡 Downloading Joconde records for Versailles (M5077)...');
  const allRecords = [];
  let offset = 0;
  let total = null;
  const LIMIT = 100;

  while (true) {
    const url = `https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/base-joconde-extrait/records?where=code_museofile%3D%22M5077%22&limit=${LIMIT}&offset=${offset}&select=numero_inventaire,auteur,titre,periode_de_creation,domaine,materiaux_techniques,description`;
    let data;
    try {
      data = await fetchJSON(url);
    } catch(e) {
      console.error(`  Error at offset ${offset}: ${e.message}. Retrying in 5s...`);
      await sleep(5000);
      continue;
    }

    if (total === null) {
      total = data.total_count || 0;
      console.log(`  Total records: ${total}, pages: ${Math.ceil(total/LIMIT)}`);
    }

    const batch = data.results || [];
    if (!batch.length) break;
    allRecords.push(...batch);
    offset += batch.length;
    process.stdout.write(`  Progress: ${allRecords.length}/${total}\r`);

    if (offset >= total) break;
    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Downloaded ${allRecords.length} Joconde records`);
  fs.writeFileSync(JOCONDE_CACHE, JSON.stringify(allRecords));
  return allRecords;
}

function normalizeInvNum(s) {
  // Normalize inventory numbers: trim, uppercase, collapse spaces
  return (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function buildLookup(records) {
  // Build a map from each inventory number component to its record
  // Joconde numero_inventaire can have multiple values separated by semicolons or spaces
  const lookup = new Map();
  for (const rec of records) {
    const raw = rec.numero_inventaire || '';
    // Split by semicolons
    const parts = raw.split(';').map(p => p.trim()).filter(Boolean);
    for (const p of parts) {
      const key = normalizeInvNum(p);
      if (key) lookup.set(key, rec);
      // Also try without space: "MV 5046" → "MV5046"
      const keyNoSpace = key.replace(/\s/g, '');
      if (keyNoSpace !== key) lookup.set(keyNoSpace, rec);
    }
  }
  return lookup;
}

function extractYear(period) {
  if (!period) return 0;
  const m = period.match(/\b(\d{4})\b/);
  if (m) return parseInt(m[1], 10);
  // Handle "18e siècle" → 1750 approx
  const c = period.match(/(\d+)e\s*si[eè]cle/);
  if (c) return (parseInt(c[1], 10) - 1) * 100 + 50;
  return 0;
}

function cleanArtist(auteurStr) {
  if (!auteurStr) return '';
  // Joconde auteur: "NOM Prénom;NOM2 Prénom2 (d'après);..." → take first
  const first = auteurStr.split(';')[0].trim();
  // "LECOMTE Hippolyte" → "Hippolyte Lecomte"
  const parts = first.split(' ');
  if (parts.length >= 2 && parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
    // Looks like LASTNAME Firstname
    const last = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
    const rest = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    return `${rest} ${last}`.trim();
  }
  return first;
}

function cleanMedium(matTech) {
  if (!matTech) return '';
  if (Array.isArray(matTech)) return matTech.join(', ');
  return matTech;
}

async function main() {
  const records = await downloadJoconde();
  console.log('\n🔍 Building lookup map...');
  const lookup = buildLookup(records);
  console.log(`  Lookup entries: ${lookup.size}`);

  console.log('\n📖 Loading Versailles collection...');
  const versailles = JSON.parse(fs.readFileSync(VERSAILLES_FILE, 'utf8'));
  const items = versailles.objects || versailles.artworks || [];
  console.log(`  Items: ${items.length}`);

  let matched = 0;
  let unmatched = 0;

  for (const item of items) {
    const invNum = normalizeInvNum(item.inventoryNumber || '');
    const invNoSpace = invNum.replace(/\s/g, '');

    let rec = lookup.get(invNum) || lookup.get(invNoSpace);

    // Try prefix variations: "MV 5046" → "MV 5046" direct, or "MV5046"
    if (!rec && invNum) {
      // Try trimming leading zeros: MV 5046 → MV  5046
      const spacedVariants = [
        invNum,
        invNum.replace(/(\D+)(\d+)/, '$1 $2'), // Ensure space between prefix and number
        invNum.replace(/\s+/, ''),
      ];
      for (const v of spacedVariants) {
        if (lookup.has(v)) { rec = lookup.get(v); break; }
      }
    }

    if (rec) {
      matched++;
      const oldTitle = item.title;
      item.title = rec.titre || item.title;
      item.artist = cleanArtist(rec.auteur);
      item.year = extractYear(rec.periode_de_creation);
      item.date = rec.periode_de_creation || '';
      item.medium = cleanMedium(rec.materiaux_techniques);
      if (rec.description) item.description = rec.description;
      // Keep generic as fallback
      if (!item.title || item.title === 'Palace of Versailles Artwork') {
        item.title = oldTitle;
      }
    } else {
      unmatched++;
    }
  }

  console.log(`\n✅ Matched: ${matched}/${items.length}`);
  console.log(`   Unmatched: ${unmatched}/${items.length}`);

  fs.writeFileSync(VERSAILLES_FILE, JSON.stringify(versailles, null, 2));
  console.log(`\n💾 Saved enriched Versailles collection.`);

  // Show sample of matched items
  const enriched = items.filter(i => i.title !== 'Palace of Versailles Artwork' && i.artist);
  console.log(`\n📊 Sample enriched items (${enriched.length} total):`);
  enriched.slice(0, 5).forEach(i => console.log(`  ${i.inventoryNumber}: "${i.title}" by ${i.artist} (${i.year || i.date})`));
}

main().catch(err => { console.error(err); process.exit(1); });
