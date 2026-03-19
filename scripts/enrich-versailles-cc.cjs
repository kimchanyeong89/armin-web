/**
 * Enrich Versailles collection using CC API (showtype=record)
 * - Loads versailles-collection.json
 * - For each item without metadata, queries the CC API for title/artist/date/etc.
 * - Saves back with enriched data
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs');
const path = require('path');

const COLLECTION_PATH = path.join(__dirname, '../public/data/versailles-collection.json');
const CHECKPOINT_PATH = '/tmp/versailles-enrich-checkpoint.json';

const delay = ms => new Promise(r => setTimeout(r, ms));

function httpPost(pathStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const opts = {
      hostname: 'collections.chateauversailles.fr',
      port: 443, path: pathStr, method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://collections.chateauversailles.fr/',
        'X-Requested-With': 'XMLHttpRequest',
      }
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(postData); req.end();
  });
}

function cleanHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRecordHtml(html) {
  const text = cleanHtml(html);
  const result = {};
  
  // Parse field: value patterns from the record view
  // Format: "Désignation  :  statue N° d'inventaire : MV 5046 Auteur : ... Date de création : 1866..."
  const fieldPatterns = [
    { key: 'title', patterns: ['Désignation :', 'Titre :', 'Titre ou désignation :'] },
    { key: 'inventoryNumber', patterns: ["N° d'inventaire :"] },
    { key: 'artist', patterns: ['Auteur :', 'Auteur', 'Artiste :'] },
    { key: 'date', patterns: ['Date de création :'] },
    { key: 'medium', patterns: ['Matière et technique :', 'Technique :'] },
    { key: 'department', patterns: ['Domaine :'] },
    { key: 'location', patterns: ['Emplacement :'] },
    { key: 'dimensions', patterns: ['Dimensions :'] },
    { key: 'description', patterns: ['Description :'] },
  ];
  
  for (const { key, patterns } of fieldPatterns) {
    for (const pattern of patterns) {
      const idx = text.indexOf(pattern);
      if (idx !== -1) {
        // Extract value after the pattern until the next known field label
        const after = text.substring(idx + pattern.length).trim();
        // Cut at next label (uppercase with :) or newline indicator
        const endPatterns = ["N° d'inventaire :", 'Auteur :', 'Date de création :', 'Matière', 'Domaine :', 'Emplacement :', 'Dimensions :', 'Désignation :', 'Titre :', 'RETOUR', 'Précédente', 'Suivante', 'résultat'];
        let endIdx = after.length;
        for (const ep of endPatterns) {
          const ei = after.indexOf(ep);
          if (ei > 0 && ei < endIdx) endIdx = ei;
        }
        const value = after.substring(0, endIdx).trim();
        if (value && value.length > 0 && value.length < 500) {
          result[key] = value;
          break;
        }
      }
    }
  }
  
  return result;
}

async function getBaseSpec() {
  // Check cached
  if (fs.existsSync('/tmp/versailles-base-spec.json')) {
    return JSON.parse(fs.readFileSync('/tmp/versailles-base-spec.json', 'utf-8'));
  }
  
  // Re-capture
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0', ignoreHTTPSErrors: true });
  const page = await context.newPage();
  let captured = null;
  page.on('request', req => {
    if (req.url().includes('asmx/search')) {
      try { captured = JSON.parse(req.postData() || '{}'); } catch(e) {}
    }
  });
  await page.goto('https://collections.chateauversailles.fr/', { waitUntil: 'networkidle', timeout: 40000 });
  await delay(2000);
  await browser.close();
  if (captured) fs.writeFileSync('/tmp/versailles-base-spec.json', JSON.stringify(captured, null, 2));
  return captured;
}

async function fetchItemMeta(invNum, baseSpec, authToken) {
  const svs = JSON.parse(JSON.stringify(baseSpec.searchValues));
  for (const sv of svs) {
    if (sv.id === 3 || sv.tag === 'Object number') {
      sv.value = invNum;
      break;
    }
  }
  const spec = { ...baseSpec, first: 1, numPerPage: 1, showtype: 'record', searchValues: svs };
  const r = await httpPost('/cc/ccConnector.asmx/search', { authToken, searchSpec: spec });
  
  if (r.status !== 200) return null;
  
  try {
    const d = JSON.parse(r.body);
    const inner = d.d;
    if (!inner || inner.resultCount === 0) return null;
    return parseRecordHtml(inner.result || '');
  } catch(e) {
    return null;
  }
}

async function main() {
  const BATCH_SIZE = 5;
  const DELAY_MS = 300;
  
  console.log('Loading collection...');
  const collData = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf-8'));
  const objects = collData.objects;
  
  console.log('Total items:', objects.length);
  
  const noMeta = objects.filter(o => !o.title || o.title === 'Palace of Versailles Artwork' || o.title === '');
  console.log('Items without metadata:', noMeta.length);
  
  // Load checkpoint
  let checkpoint = {};
  if (fs.existsSync(CHECKPOINT_PATH)) {
    checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
    console.log('Loaded checkpoint with', Object.keys(checkpoint).length, 'cached results');
  }
  
  // Get base spec
  console.log('Getting base spec...');
  const baseData = await getBaseSpec();
  if (!baseData) { console.error('Cannot get base spec'); return; }
  
  const authToken = baseData.authToken || '';
  const baseSpec = baseData.searchSpec;
  console.log('Using authToken:', JSON.stringify(authToken));
  
  let enriched = 0;
  let no_access = 0;
  let processed = 0;
  
  for (let i = 0; i < noMeta.length; i++) {
    const item = noMeta[i];
    const invNum = item.inventoryNumber;
    
    if (!invNum || invNum === '') continue;
    
    // Skip if cached as "no access"
    if (checkpoint[invNum] === 'no_access') {
      no_access++;
      continue;
    }
    
    // Skip if already successfully cached
    if (checkpoint[invNum] && typeof checkpoint[invNum] === 'object' && checkpoint[invNum].title) {
      // Apply from cache
      const meta = checkpoint[invNum];
      const objIdx = objects.findIndex(o => o.inventoryNumber === invNum);
      if (objIdx !== -1) {
        if (meta.title) objects[objIdx].title = meta.title;
        if (meta.artist) objects[objIdx].artist = meta.artist;
        if (meta.date) objects[objIdx].date = meta.date;
        if (meta.medium) objects[objIdx].medium = meta.medium;
        if (meta.department) objects[objIdx].department = meta.department;
      }
      enriched++;
      continue;
    }
    
    processed++;
    if (processed % 50 === 0) {
      console.log(`[${processed}/${noMeta.length}] enriched: ${enriched}, no_access: ${no_access}`);
      // Save checkpoint
      fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
      // Save partial results
      fs.writeFileSync(COLLECTION_PATH, JSON.stringify(collData, null, 2));
    }
    
    try {
      const meta = await fetchItemMeta(invNum, baseSpec, authToken);
      
      if (meta && meta.title && meta.title !== '' && meta.title !== 'Palace of Versailles Artwork') {
        // Apply metadata
        const objIdx = objects.findIndex(o => o.inventoryNumber === invNum);
        if (objIdx !== -1) {
          if (meta.title) objects[objIdx].title = meta.title;
          if (meta.artist) objects[objIdx].artist = meta.artist;
          if (meta.date) objects[objIdx].date = meta.date;
          if (meta.medium) objects[objIdx].medium = meta.medium;
          if (meta.department) objects[objIdx].department = meta.department;
          enriched++;
        }
        checkpoint[invNum] = meta;
      } else {
        // No metadata available
        checkpoint[invNum] = 'no_access';
        no_access++;
      }
    } catch(e) {
      console.error(`Error for ${invNum}:`, e.message);
      checkpoint[invNum] = 'error';
    }
    
    // Rate limiting
    if (i % BATCH_SIZE === 0) await delay(DELAY_MS);
  }
  
  // Final save
  console.log('\n=== Final Results ===');
  console.log('Enriched:', enriched);
  console.log('No access:', no_access);
  console.log('Total processed:', processed);
  
  fs.writeFileSync(COLLECTION_PATH, JSON.stringify(collData, null, 2));
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
  
  console.log('Saved to', COLLECTION_PATH);
  
  // Summary
  const nowHasMeta = collData.objects.filter(o => o.title && o.title !== 'Palace of Versailles Artwork' && o.title !== '').length;
  console.log('Items with metadata after enrichment:', nowHasMeta, '/', collData.objects.length);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
