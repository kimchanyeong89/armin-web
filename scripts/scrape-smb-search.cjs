/**
 * SMB Elasticsearch Search API Scraper
 * Uses the search API at api.smb.museum/search/ (same as website)
 * 
 * Museums: Humboldt Forum, Altes Museum, Neues Museum
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SEARCH_API = 'https://api.smb.museum/search/';
const IMAGE_BASE_URL = 'https://recherche.smb.museum/images';
const BATCH_SIZE = 100;
const DELAY_MS = 500;

const MUSEUMS = {
  humboldt: {
    id: 'smb-humboldt-forum',
    name: 'Humboldt Forum',
    locationQuery: '(Humboldt AND Forum)',
    queryField: 'location',
    outputFile: 'smb-humboldt-forum-collection.json'
  },
  altes: {
    id: 'smb-altes-museum',
    name: 'Altes Museum',
    locationQuery: '(Altes AND Museum)',
    queryField: 'location',
    outputFile: 'smb-altes-museum-collection.json'
  },
  neues: {
    id: 'smb-neues-museum',
    name: 'Neues Museum',
    locationQuery: '(Neues AND Museum)',
    queryField: 'location',
    outputFile: 'smb-neues-museum-collection.json'
  },
  gemaeldegalerie: {
    id: 'smb-gemaeldegalerie',
    name: 'Gemäldegalerie',
    locationQuery: 'Kulturforum',
    queryField: 'location',
    outputFile: 'smb-gemaeldegalerie-collection.json'
  },
  'alte-nationalgalerie': {
    id: 'smb-alte-nationalgalerie',
    name: 'Alte Nationalgalerie',
    locationQuery: '(Alte AND Nationalgalerie)',
    queryField: 'compilation',
    outputFile: 'smb-alte-nationalgalerie-collection.json'
  },
  'neue-nationalgalerie': {
    id: 'smb-neue-nationalgalerie',
    name: 'Neue Nationalgalerie',
    locationQuery: '(Neue AND Nationalgalerie)',
    queryField: 'compilation',
    outputFile: 'smb-neue-nationalgalerie-collection.json'
  },
  'bode': {
    id: 'smb-bode-museum',
    name: 'Bode-Museum',
    locationQuery: 'Bode-Museum',
    queryField: 'compilation',
    outputFile: 'smb-bode-museum-collection.json'
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchRequest(locationQuery, limit, offset, queryField = 'location') {
  return new Promise((resolve, reject) => {
    const url = `${SEARCH_API}?lang=de&limit=${limit}&offset=${offset}`;
    const body = JSON.stringify({
      q_advanced: [
        { field: 'attachments', operator: 'AND', q: 'true' },
        { field: queryField, operator: 'AND', q: locationQuery }
      ]
    });

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}

function buildImageUrl(assetId, size = '1400x1400') {
  if (!assetId) return '';
  return `${IMAGE_BASE_URL}/${assetId}_${size}.jpg`;
}

function buildThumbnailUrl(assetId) {
  if (!assetId) return '';
  return `${IMAGE_BASE_URL}/${assetId}_800x800.jpg`;
}

function transformObject(obj, museumConfig) {
  const assets = obj.assets || [];
  const primaryImageId = assets[0];
  
  // Parse dating
  const dating = obj.dating || [];
  const dateRange = obj.dateRange || '';
  let year = '';
  if (dating.length > 0) {
    year = dating[0];
  } else if (dateRange) {
    const match = dateRange.match(/\d{4}/);
    if (match) year = match[0];
  }

  // Parse dimensions
  const dims = obj.dimensionsAndWeight || [];
  const dimensions = dims.join('; ');

  // Parse materials
  const mats = obj.materialAndTechnique || [];
  const medium = mats.join('; ');

  // Parse artist from involvedParties
  const involvedParties = obj.involvedParties || [];
  let artist = '';
  for (const party of involvedParties) {
    // Format: "Ausführung: Bartholomeus van Bassen (um 1590 - 1652), Maler*in"
    // or "Künstler*in: Name"
    const match = party.match(/(?:Ausführung|Künstler\*in|Maler\*in|Entwurf):\s*([^(,]+)/i);
    if (match) {
      const name = match[1].trim();
      if (name && !artist) {
        artist = name;
      } else if (name && artist && !artist.includes(name)) {
        artist += '; ' + name;
      }
    }
  }
  // Fallback: take first involvedParty if still empty
  if (!artist && involvedParties.length > 0) {
    const firstParty = involvedParties[0];
    const colonIndex = firstParty.indexOf(':');
    if (colonIndex > -1) {
      const afterColon = firstParty.substring(colonIndex + 1).trim();
      const parenIndex = afterColon.indexOf('(');
      artist = parenIndex > -1 ? afterColon.substring(0, parenIndex).trim() : afterColon.split(',')[0].trim();
    } else {
      artist = firstParty.split('(')[0].trim();
    }
  }

  return {
    id: `${museumConfig.id}-${obj.id}`,
    smbId: obj.id,
    title: obj.title || obj.technicalTerm || `Object ${obj.id}`,
    artist: artist,
    date: year,
    medium: medium,
    type: obj.technicalTerm || '',
    dimensions: dimensions,
    imageUrl: buildImageUrl(primaryImageId),
    thumbnailUrl: buildThumbnailUrl(primaryImageId),
    images: assets.map(assetId => ({
      url: buildImageUrl(assetId),
      thumbnail: buildThumbnailUrl(assetId),
      assetId: assetId
    })),
    collection: obj.collection || '',
    collectionKey: obj.collectionKey || '',
    exhibitionSpace: obj.exhibitionSpace || '',
    location: obj.location || '',
    description: obj.description || '',
    geographicalReferences: obj.geographicalReferences || [],
    identNumber: obj.identNumber || '',
    permalink: obj.permalink || '',
    sourceUrl: obj.permalink || `https://id.smb.museum/object/${obj.id}`,
    museum: museumConfig.name,
    museumId: museumConfig.id
  };
}

async function scrapeMuseum(museumKey) {
  const config = MUSEUMS[museumKey];
  if (!config) {
    console.error(`Unknown museum: ${museumKey}`);
    process.exit(1);
  }

  const queryField = config.queryField || 'location';
  console.log(`\n=== Scraping ${config.name} ===`);
  console.log(`Query: ${queryField} = ${config.locationQuery}`);

  // Get total count
  const countResult = await searchRequest(config.locationQuery, 1, 0, queryField);
  const total = countResult.total || 0;
  console.log(`Total objects with images: ${total}`);

  if (total === 0) {
    console.log('No objects found!');
    return;
  }

  const allObjects = [];
  let offset = 0;

  while (offset < total) {
    const limit = Math.min(BATCH_SIZE, total - offset);
    console.log(`Fetching ${offset + 1}-${offset + limit} of ${total}...`);

    try {
      const result = await searchRequest(config.locationQuery, limit, offset, queryField);
      const objects = result.objects || [];

      for (const obj of objects) {
        const transformed = transformObject(obj, config);
        if (transformed.imageUrl) {
          allObjects.push(transformed);
        }
      }

      offset += objects.length;

      // Save checkpoint every 200 items
      if (allObjects.length % 200 === 0) {
        const outputPath = path.join(__dirname, '..', 'public', 'data', config.outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(allObjects, null, 2));
        console.log(`  Checkpoint saved: ${allObjects.length} objects`);
      }

      await sleep(DELAY_MS);
    } catch (error) {
      console.error(`Error at offset ${offset}:`, error.message);
      await sleep(2000);
      // Retry once
      try {
        const result = await searchRequest(config.locationQuery, limit, offset);
        const objects = result.objects || [];
        for (const obj of objects) {
          const transformed = transformObject(obj, config);
          if (transformed.imageUrl) {
            allObjects.push(transformed);
          }
        }
        offset += objects.length;
      } catch (retryError) {
        console.error(`Retry failed, skipping batch:`, retryError.message);
        offset += limit;
      }
    }
  }

  // Save final result
  const outputPath = path.join(__dirname, '..', 'public', 'data', config.outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(allObjects, null, 2));
  
  console.log(`\n=== ${config.name} Complete ===`);
  console.log(`Total saved: ${allObjects.length} objects`);
  console.log(`Output: ${outputPath}`);

  return allObjects;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scrape-smb-search.cjs <museum>');
    console.log('Museums: humboldt, altes, neues, all');
    process.exit(1);
  }

  const museum = args[0].toLowerCase();

  if (museum === 'all') {
    for (const key of Object.keys(MUSEUMS)) {
      await scrapeMuseum(key);
    }
  } else if (MUSEUMS[museum]) {
    await scrapeMuseum(museum);
  } else {
    console.error(`Unknown museum: ${museum}`);
    console.log('Available: humboldt, altes, neues, all');
    process.exit(1);
  }

  console.log('\nDone!');
}

main().catch(console.error);

// Add Gemäldegalerie to MUSEUMS (append at runtime)
