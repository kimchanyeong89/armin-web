#!/usr/bin/env node
// Enrich Wales museum-wales-paintings.json with detail page metadata
// Extracts: artist, artistDates, medium, height, width, accessionNumber, year
// Uses concurrent HTTP requests (no Playwright needed - server-rendered HTML)

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../public/data/museum-wales-paintings.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/wales-enrich-progress.json');
const CONCURRENCY = 6;
const DELAY_MS = 300; // polite delay between batches

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Connection': 'keep-alive',
      }
    }, (res) => {
      // Handle redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        resolve(get(res.headers.location));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseDetailPage(body) {
  const result = {};
  
  // Artist: <div class="creation_name"><a ...>NAME</a></div>
  const artistMatch = body.match(/<div[^>]*class="[^"]*creation_name[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/i);
  if (artistMatch) {
    // Format "JOHN, Augustus" → "Augustus John" (proper title case)
    const raw = artistMatch[1].trim();
    const toTitle = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const parts = raw.split(',').map(p => p.trim());
    if (parts.length === 2) {
      // parts[0] = surname (e.g. "JOHN"), parts[1] = forename (e.g. "Augustus")
      const surname = parts[0].split(' ').map(toTitle).join(' ');
      const forename = parts[1].split(' ').map(toTitle).join(' ');
      result.artist = `${forename} ${surname}`;
      result.artistRaw = raw;
    } else {
      result.artist = raw.split(' ').map(toTitle).join(' ');
      result.artistRaw = raw;
    }
  }
  
  // Artist life dates: <div class="bibliography">1878-1961</div>
  const bioMatch = body.match(/<div[^>]*class="[^"]*bibliography[^"]*"[^>]*>([^<]+)<\/div>/i);
  if (bioMatch) {
    result.artistDates = bioMatch[1].trim();
    // Try to extract birth year as artwork era (fallback if no artwork date)
    const yearMatch = bioMatch[1].match(/(\d{4})/);
    if (yearMatch) result.artistBirthYear = yearMatch[1];
  }
  
  // Artwork date: look for object_dates section (may be empty <!-- date --> comment)
  const dateSection = body.match(/<div[^>]*class="[^"]*object_dates[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (dateSection) {
    const dateVal = dateSection[1].replace(/<[^>]+>/g, '').trim();
    if (dateVal) result.year = dateVal;
  }
  // Also check h4>Date followed by object_field_value
  const h4DateMatch = body.match(/<h4[^>]*>\s*Date\s*<\/h4>\s*<div[^>]*class="[^"]*object_field_value[^"]*"[^>]*>([^<]+)<\/div>/i);
  if (h4DateMatch) {
    const v = h4DateMatch[1].trim();
    if (v) result.year = v;
  }
  
  // Medium (first technique): <div class="technique">Chalk on paper</div>
  const techMatches = [...body.matchAll(/<div[^>]*class="[^"]*\btechnique\b[^"]*"[^>]*>([^<]+)<\/div>/gi)];
  if (techMatches.length > 0) {
    // Filter out classification-type techniques, prefer material/process ones
    const allTechs = techMatches.map(m => m[1].trim()).filter(t => t.length > 0);
    // The first technique is usually the actual medium (e.g., "Chalk on paper", "Oil on canvas")
    // Skip ones that look like classification categories
    const realTechs = allTechs.filter(t => 
      !t.toLowerCase().includes('fine art') && 
      !t.toLowerCase().includes('works on paper') &&
      !t.toLowerCase().includes('drawings and watercolour') &&
      !t.match(/^\d+/) &&
      t.length < 80
    );
    if (realTechs.length > 0) result.medium = realTechs[0];
    else if (allTechs.length > 0) result.medium = allTechs[0];
  }
  
  // Measurements: <div class="measurement"><strong>Height (cm):</strong> 56.6</div>
  const measMatches = [...body.matchAll(/<div[^>]*class="[^"]*\bmeasurement\b[^"]*"[^>]*>\s*<strong>\s*([^<]+)<\/strong>\s*([^<]+)<\/div>/gi)];
  const dims = {};
  for (const m of measMatches) {
    const label = m[1].toLowerCase().trim();
    const val = m[2].trim();
    if (label.includes('height')) dims.height = parseFloat(val) || val;
    else if (label.includes('width')) dims.width = parseFloat(val) || val;
    else if (label.includes('depth')) dims.depth = parseFloat(val) || val;
  }
  if (dims.height || dims.width) {
    // Store as human-readable string (ExhibitionModal uses item.dimensions as string)
    const parts = [];
    if (dims.height) parts.push(`H: ${dims.height} cm`);
    if (dims.width) parts.push(`W: ${dims.width} cm`);
    if (dims.depth) parts.push(`D: ${dims.depth} cm`);
    result.dimensions = parts.join(', ');
    result.height = dims.height;
    result.width = dims.width;
  }
  
  // Accession number: <h4>Item Number</h4> followed by <div class="object_field_value">NMW A XXXXX</div>
  const accMatch = body.match(/<h4[^>]*>\s*Item Number\s*<\/h4>\s*<div[^>]*class="[^"]*object_field_value[^"]*"[^>]*>([^<]+)<\/div>/i);
  if (accMatch) result.accessionNumber = accMatch[1].trim();
  
  return result;
}

async function enrichItem(item) {
  if (!item.sourceUrl) return item;
  try {
    const r = await get(item.sourceUrl);
    if (r.status !== 200) return item;
    const metadata = parseDetailPage(r.body);
    return { ...item, ...metadata };
  } catch(e) {
    // Return unchanged on error
    return item;
  }
}

async function processBatch(items) {
  return Promise.all(items.map(item => enrichItem(item)));
}

(async () => {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let objects = data.objects;
  const total = objects.length;
  
  // Load progress
  let startIdx = 0;
  let enriched = [];
  if (fs.existsSync(PROGRESS_FILE)) {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    enriched = prog.enriched || [];
    startIdx = enriched.length;
    console.log(`Resuming from index ${startIdx} (${enriched.length} done)`);
  }
  
  // Items remaining
  const remaining = objects.slice(startIdx);
  
  console.log(`Enriching ${remaining.length} of ${total} items (CONCURRENCY=${CONCURRENCY})...`);
  console.log('Estimated time: ' + Math.round(remaining.length / CONCURRENCY * DELAY_MS / 60000) + ' minutes\n');
  
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const results = await processBatch(batch);
    enriched.push(...results);
    
    const done = startIdx + enriched.length - (enriched.length - results.length);
    const pct = Math.round((startIdx + i + batch.length) / total * 100);
    
    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= remaining.length) {
      const withArtist = enriched.filter(o=>o.artist).length;
      const withMedium = enriched.filter(o=>o.medium).length;
      const withDims = enriched.filter(o=>o.dimensions).length;
      console.log(`[${pct}%] ${startIdx + enriched.length}/${total} done | artist:${withArtist} medium:${withMedium} dims:${withDims}`);
      
      // Save progress
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ enriched, startIdx: 0 }));
      
      // Also update the data file with what we have so far
      data.objects = enriched.concat(objects.slice(startIdx + enriched.length));
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    }
    
    await sleep(DELAY_MS);
  }
  
  // Final save
  data.objects = enriched;
  data.enrichedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  const withArtist = enriched.filter(o=>o.artist).length;
  const withMedium = enriched.filter(o=>o.medium).length;
  const withDims = enriched.filter(o=>o.dimensions).length;
  const withYear = enriched.filter(o=>o.year).length;
  
  console.log('\n=== DONE ===');
  console.log(`Total: ${enriched.length}`);
  console.log(`Artist: ${withArtist} (${Math.round(withArtist/enriched.length*100)}%)`);
  console.log(`Medium: ${withMedium} (${Math.round(withMedium/enriched.length*100)}%)`);
  console.log(`Dimensions: ${withDims} (${Math.round(withDims/enriched.length*100)}%)`);
  console.log(`Year: ${withYear} (${Math.round(withYear/enriched.length*100)}%)`);
  
  // Delete progress file
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
