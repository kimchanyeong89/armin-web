const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { pipeline } = require('node:stream');
const { promisify } = require('node:util');

const streamPipeline = promisify(pipeline);

// Scanner for NASM
const MUSEUMS = [
  { 
    id: 'nasm', 
    name: 'National Air and Space Museum', 
    indexUrl: 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/nasm/index.txt',
    output: 'si-nasm.json',
    filterCategory: ['Painting', 'Drawing'] 
  }
];

// ... (keep functions)

async function processPartFile(url, targetMuseums) {
  // ...
  // Inside loop:
  // ...
        const museum = targetMuseums.find(m => m.id === unitCode);
        if (!museum) continue;

        const content = doc.content;
        const objectTypes = content.indexedStructured?.object_type || [];
        const freetextTypes = (content.freetext?.objectType || []).map(t => t.content);
        const allTypes = [...objectTypes, ...freetextTypes].join(' ').toLowerCase();

        // LOG EVERYTHING for NASM that looks vaguely like art
        if (/painting|drawing|art/i.test(allTypes)) {
             console.log('--- POTENTIAL HIT ---');
             console.log('ID:', doc.id);
             console.log('Types:', allTypes);
             const media = content.descriptiveNonRepeating?.online_media?.media || [];
             console.log('Has Media:', media.length > 0);
        }
  // ...
}

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

// Helper to download file to a temporary path
async function downloadToTemp(url, tempPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Failed ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(tempPath);
      pipeline(res, fileStream, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }).on('error', reject);
  });
}

function cleanArtistName(val) {
    if (!val) return 'Unknown Artist';
    
    // Remove prefixes like "Attributed to", "Possibly by", etc.
    val = val.replace(/^(?:attributed to|possibly by|after|follower of|circle of|studio of|school of|manner of|style of|copy after)\s+/i, '');

    // Remove text in parentheses if it contains 4 digits (likely years)
    // e.g. "Lü Ji (ca. 1420-ca. 1505)" -> "Lü Ji"
    val = val.replace(/\s*\([^)]*\d{4}[^)]*\)/g, '');

    // Handle comma-separated biographical info
    // Logic: Split by comma. If the last part looks like bio/date info, drop it.
    // e.g. "John Adams Elder, 3 Feb 1833 - 24 Feb 1895" -> "John Adams Elder"
    // e.g. "Rembrandt Peale, 22 Feb 1778 - 3 Oct 1860" -> "Rembrandt Peale"
    // e.g. "Artist Name, born 1900" -> "Artist Name"
    
    const parts = val.split(',');
    if (parts.length > 1) {
        const last = parts[parts.length - 1].trim();
        const isBio = (
            /\d{4}/.test(last) ||               // Contains a year
            /born|died|active/i.test(last) ||   // Bio keywords
            /\bb\.\s|\bd\.\s|\bfl\.\s|\bca\./i.test(last) || // Bio abbreviations
            /century/i.test(last) ||            // Century reference
            /first half|second half/i.test(last) ||
            /\d+\s+[A-Za-z]+/.test(last) ||     // Date pattern like "3 Feb"
            /[A-Za-z]+\s+\d+/.test(last)        // Date pattern like "Feb 3"
        );
        
        if (isBio) {
            parts.pop(); // Remove the last part
            val = parts.join(',').trim();
        }
    }
    
    // Remove specific known patterns not caught above
    val = val.replace(/,\s+born\b.*/i, '');
    val = val.replace(/,\s+died\b.*/i, '');
    val = val.replace(/,\s+active\b.*/i, '');
    val = val.replace(/,\s+\d{4}[-\u2013].*/, ''); 

    return val.trim() || 'Unknown Artist';
}

function extractYear(val) {
  if (!val) return null;
  // Match first occurrence of 4 digits that looks like a year (1000-2999)
  const m = val.match(/\b([1-2]\d{3})\b/);
  return m ? parseInt(m[1], 10) : null;
}

async function processPartFile(url, targetMuseums) {
  const tempPath = path.join(__dirname, `../temp_si_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
  const items = {}; // keyed by museum id -> array

  targetMuseums.forEach(m => items[m.id] = []);

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
        if (doc.type !== 'edanmdm') continue;
        
        // Match doc.unitCode (uppercase) with our museum list
        const unitCode = (doc.unitCode || '').toLowerCase();
        const museum = targetMuseums.find(m => m.id === unitCode);
        
        if (!museum) continue;

        const content = doc.content;
        if (!content) continue;

        const objectTypes = content.indexedStructured?.object_type || [];
        const freetextTypes = (content.freetext?.objectType || []).map(t => t.content);
        const allTypes = [...objectTypes, ...freetextTypes].join(' ').toLowerCase();

        if (/x-ray|painting|drawing|art/i.test(allTypes)) {
             console.log('--- POTENTIAL HIT ---');
             console.log('ID:', doc.id);
             console.log('Types:', allTypes);
             const media = content.descriptiveNonRepeating?.online_media?.media || [];
             console.log('Has Media:', media.length > 0);
             if (media.length > 0) process.exit(0); // Found one!
        }
        
        // Skip normal processing
        continue;

        /*
        // Check categories

        const objectTypes = content.indexedStructured?.object_type || [];
        const freetextTypes = (content.freetext?.objectType || []).map(t => t.content);
        
        const allTypes = [...objectTypes, ...freetextTypes].join(' ').toLowerCase();
        
        let matchedCategory = null;

        // Custom filter logic
        if (museum.id === 'npg') {
             // For NPG, include Photographs
            if (/painting|drawing|photograph/i.test(allTypes)) {
                let potentialCat = 'Painting';
                if (/drawing/i.test(allTypes)) potentialCat = 'Drawing';
                else if (/photograph/i.test(allTypes)) potentialCat = 'Photograph';

                if (potentialCat === 'Photograph') {
                    // Filter photos by date: 1890-2026
                    const dateStr = (content.freetext?.date || []).find(d => d.label === 'Date')?.content || '';
                    const year = extractYear(dateStr);
                    if (year && year >= 1890 && year <= 2026) {
                        matchedCategory = 'Photograph';
                    }
                } else {
                    matchedCategory = potentialCat;
                }
            }
        } else {
            // For others (Asian Art), stick to Painting/Drawing only
            if (/painting|drawing/i.test(allTypes)) {
                matchedCategory = /drawing/i.test(allTypes) ? 'Drawing' : 'Painting';
            }
        }

        if (!matchedCategory) continue;

        // Extract Data
        const descriptive = content.descriptiveNonRepeating || {};
        const media = descriptive.online_media?.media || [];
        
        if (media.length === 0) continue;
        
        const primaryImage = media[0];
        const imageUrl = primaryImage.content || primaryImage.thumbnail;
        if (!imageUrl) continue;

        const title = descriptive.title?.content || 'Untitled';
        const id = descriptive.record_ID || doc.id;
        const recordLink = descriptive.record_link || '';

        let artist = 'Unknown Artist';
        if (content.freetext?.name) {
          const artistEntry = content.freetext.name.find(n => n.label === 'Artist' || n.label === 'Creator' || n.label === 'Architect' || n.label === 'Designer');
          if (artistEntry) artist = cleanArtistName(artistEntry.content);
        }

        const date = (content.freetext?.date || []).find(d => d.label === 'Date')?.content || '';
        const dimensions = (content.freetext?.physicalDescription || []).find(d => d.label === 'Dimensions')?.content || '';
        const medium = (content.freetext?.physicalDescription || []).find(d => d.label === 'Medium')?.content || '';
        const creditLine = (content.freetext?.creditLine || []).find(c => c.label === 'Credit Line')?.content || '';

        items[museum.id].push({
          id,
          title,
          artist,
          date,
          dimensions,
          imageUrl,
          sourceUrl: recordLink,
          creditLine,
          medium,
          category: matchedCategory
        });

      } catch (e) { }
    }
  } catch (err) {
    console.warn(`Error processing ${url}:`, err.message);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }

  return items;
}

async function processMuseum(museum) {
    console.log(`\nStarting ${museum.name} (${museum.id})...`);
    console.log(`Fetching index from ${museum.indexUrl}...`);
    
    const indexContent = await fetchText(museum.indexUrl);
    const fileUrls = indexContent.split(/\s+/).filter(s => s.startsWith('http') && s.endsWith('.txt'));
    
    console.log(`Found ${fileUrls.length} part files.`);
    
    let allItems = [];
    const CONCURRENCY = 4;
    
    for (let i = 0; i < fileUrls.length; i += CONCURRENCY) {
        const chunk = fileUrls.slice(i, i + CONCURRENCY);
        process.stdout.write(`Processing batch ${Math.ceil((i+1)/CONCURRENCY)}/${Math.ceil(fileUrls.length/CONCURRENCY)}... \r`);
        
        const results = await Promise.all(chunk.map(url => processPartFile(url, [museum])));
        
        results.forEach(res => {
            if (res[museum.id]) allItems.push(...res[museum.id]);
        });
    }
    
    console.log(`\nTotal items for ${museum.name}: ${allItems.length}`);
    const outPath = path.join(__dirname, `../public/data/${museum.output}`);
    fs.writeFileSync(outPath, JSON.stringify(allItems, null, 2));
    console.log(`Saved to ${outPath}`);
}

async function main() {
    for (const m of MUSEUMS) {
        await processMuseum(m);
    }
}

main().catch(console.error);
