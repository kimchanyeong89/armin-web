const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { pipeline } = require('node:stream');
const { promisify } = require('node:util');

const streamPipeline = promisify(pipeline);

const INDEX_URL = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/saam/index.txt';
const OUTPUT_FILE = path.join(__dirname, '../public/data/saam-paintings-full.json');

// Helper to download text content
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Request Failed. Status Code: ${res.statusCode} for ${url}`));
      }
      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => { resolve(rawData); });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// Helper to download file to a temporary path (streaming)
async function downloadToTemp(url, tempPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Request Failed. Status Code: ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(tempPath);
      pipeline(res, fileStream, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }).on('error', reject);
  });
}

async function processPartFile(url) {
  const tempPath = path.join(__dirname, `../temp_saam_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
  const paintings = [];

  try {
    await downloadToTemp(url, tempPath);

    const fileStream = fs.createReadStream(tempPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const doc = JSON.parse(line);

        // Filter: Must be EDANMDM (not finding aid) and SAAM
        if (doc.type !== 'edanmdm') continue;
        if (doc.unitCode !== 'SAAM') continue;

        const content = doc.content;
        if (!content) continue;

        // Filter: Must be a Painting or Drawing
        // Check indexedStructured.object_type
        const objectTypes = content.indexedStructured?.object_type || [];
        const isTarget = objectTypes.some(t => /painting|drawing/i.test(t));
        
        // Also check freetext if indexed is missing (fallback)
        let isFallback = false;
        if (!isTarget && content.freetext?.objectType) {
           isFallback = content.freetext.objectType.some(t => /painting|drawing/i.test(t.content || ''));
        }

        if (!isTarget && !isFallback) continue;

        // Extract Data
        const descriptive = content.descriptiveNonRepeating || {};
        
        // Must have an image
        const media = descriptive.online_media?.media || [];
        if (media.length === 0) continue;
        
        const primaryImage = media[0]; // content (url), thumbnail, etc.
        const imageUrl = primaryImage.content || primaryImage.thumbnail;
        
        if (!imageUrl) continue;

        const title = descriptive.title?.content || 'Untitled';
        const id = descriptive.record_ID || doc.id;
        const recordLink = descriptive.record_link || '';

        // Extract Artist
        // Usually in freetext.name with label "Artist"
        let artist = 'Unknown Artist';
        if (content.freetext?.name) {
          const artistEntry = content.freetext.name.find(n => n.label === 'Artist');
          if (artistEntry) {
            let val = artistEntry.content || '';
            // Clean up bio info: "Name, born Place..." or "Name, dates"
            // Strategy: Remove starting from ", born" or ", \d{4}-"
            val = val.replace(/,\s+born\b.*/i, '');
            val = val.replace(/,\s+died\b.*/i, '');
            val = val.replace(/,\s+active\b.*/i, '');
            val = val.replace(/,\s+\d{4}[-\u2013].*/, ''); // Date ranges
            // Sometimes it's just "Name, Nationality" -> Keep name only if nationality is commonly known?
            // "Sargent, John Singer" -> keep. "Smith, American" -> remove "American"?
            // Let's stick to removing bio-markers for now to avoid killing "Last, First" format if used.
            // Actually SAAM data often uses "First Last, born..." format.
            artist = val.trim();
          }
        }

        // Extract Date
        let date = '';
        if (content.freetext?.date) {
            const dateEntry = content.freetext.date.find(d => d.label === 'Date');
            if (dateEntry) date = dateEntry.content;
        }

        // Extract Dimensions
        let dimensions = '';
        if (content.freetext?.physicalDescription) {
            const dimEntry = content.freetext.physicalDescription.find(d => d.label === 'Dimensions');
            if (dimEntry) dimensions = dimEntry.content;
        }

        paintings.push({
          id,
          title,
          artist,
          date,
          dimensions,
          imageUrl,
          sourceUrl: recordLink,
          creditLine: content.freetext?.creditLine?.[0]?.content || '',
          medium: content.freetext?.physicalDescription?.find(d => d.label === 'Medium')?.content || '',
          category: objectTypes.some(t => /drawing/i.test(t)) ? 'Drawing' : 'Painting'
        });

      } catch (e) {
        // Ignore JSON parse errors for single lines
      }
    }
  } catch (err) {
    console.warn(`Error processing ${url}:`, err.message);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }

  return paintings;
}

async function main() {
  console.log('Fetching index file...');
  const indexContent = await fetchText(INDEX_URL);
  
  // The index file might have weird formatting (urls broken by newlines?) 
  // Based on the curl output: "https://... \n s3-..." 
  // Let's split by whitespace and reconstruct if they look like partial URLs, or just simpler:
  // The curl output displayed "https://smithsonian-open-access.\n s3..." which suggests wrapping.
  // But if I fetch it programmatically, it should be clean. 
  // We'll filter for lines ending in .txt
  
  const rawLines = indexContent.split(/\s+/).filter(Boolean);
  // Re-join if needed? The curl output was likely terminal wrapping. 
  // But if the file literally contains newlines, we might have issues. 
  // Let's assume standard whitespace separation (newlines or spaces) separates full URLs.
  // Actually, standard behavior for 'aws s3 ls' output or similar might be just paths.
  // But here these are full https URLs.
  
  const fileUrls = rawLines.filter(s => s.startsWith('http') && s.endsWith('.txt'));
  
  console.log(`Found ${fileUrls.length} part files.`);
  
  let allPaintings = [];
  
  // Process in limited concurrency
  const CONCURRENCY = 3;
  for (let i = 0; i < fileUrls.length; i += CONCURRENCY) {
    const chunk = fileUrls.slice(i, i + CONCURRENCY);
    console.log(`Processing batch ${i/CONCURRENCY + 1}/${Math.ceil(fileUrls.length/CONCURRENCY)}...`);
    
    const results = await Promise.all(chunk.map(url => processPartFile(url)));
    results.forEach(p => allPaintings.push(...p));
    
    console.log(`  > Found ${results.reduce((a,b) => a + b.length, 0)} paintings in this batch.`);
  }

  console.log(`\nTotal paintings found: ${allPaintings.length}`);
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPaintings, null, 2));
  console.log(`Create ${OUTPUT_FILE}`);
}

main().catch(console.error);
