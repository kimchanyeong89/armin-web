/**
 * SMB (Staatliche Museen zu Berlin) GraphQL Scraper
 * Museums: Humboldt Forum, Altes Museum, Neues Museum
 * Uses official GraphQL API at api.smb.museum
 * 
 * CC0/CC BY-SA licenses - Open Access
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const GRAPHQL_ENDPOINT = 'https://api.smb.museum/v1/graphql';
const IMAGE_BASE_URL = 'https://recherche.smb.museum/images';
const BATCH_SIZE = 50; // For pagination and checkpoint saves
const DELAY_MS = 500; // Delay between API calls

// Museum configurations
const MUSEUMS = {
  humboldt: {
    id: 'smb-humboldt-forum',
    name: 'Humboldt Forum',
    locationFilter: '%Humboldt%',
    outputFile: 'smb-humboldt-forum-collection.json',
    progressFile: 'smb-humboldt-progress.json'
  },
  altes: {
    id: 'smb-altes-museum',
    name: 'Altes Museum',
    locationFilter: '%Altes Museum%',
    outputFile: 'smb-altes-museum-collection.json',
    progressFile: 'smb-altes-progress.json'
  },
  neues: {
    id: 'smb-neues-museum',
    name: 'Neues Museum',
    locationFilter: '%Neues Museum%',
    outputFile: 'smb-neues-museum-collection.json',
    progressFile: 'smb-neues-progress.json'
  }
};

// GraphQL query for fetching objects
const OBJECTS_QUERY = `
  query GetObjects($locationFilter: String!, $limit: Int!, $offset: Int!) {
    smb_objects(
      where: { location: { name: { _ilike: $locationFilter } } }
      limit: $limit
      offset: $offset
      order_by: { id: asc }
    ) {
      id
      collectionKey
      exhibition_space
      compilation
      location { name }
      attributes { attribute_key value }
      attachments { 
        attachment 
        name 
        primary 
        credits 
        media_type 
        license { key } 
      }
      involved_parties { 
        person { name date_range date_of_birth date_of_death } 
        role_voc { name } 
      }
      materials_and_techniques { 
        details 
        type_voc { name } 
        specific_type_voc { name } 
      }
      geographical_references { 
        details 
        place_voc { name } 
        type_voc { name } 
      }
      cultural_references {
        name_voc { name }
        type_voc { name }
        denomination_voc { name }
      }
    }
  }
`;

const COUNT_QUERY = `
  query GetCount($locationFilter: String!) {
    smb_objects_aggregate(where: { location: { name: { _ilike: $locationFilter } } }) {
      aggregate { count }
    }
  }
`;

// Helper function to make GraphQL request
async function graphqlRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'api.smb.museum',
      port: 443,
      path: '/v1/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.errors) {
            reject(new Error(JSON.stringify(result.errors)));
          } else {
            resolve(result.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Parse attributes to extract specific fields
function parseAttributes(attributes) {
  const result = {
    title: '',
    titles: [],
    inventoryNumber: '',
    date: '',
    dateFrom: '',
    dateTo: '',
    dimensions: [],
    dimensionsText: '',
    materials: [],
    materialsText: '',
    techniques: [],
    techniquesText: '',
    category: '',
    technicalTerm: '',
    description: '',
    acquisitionNotes: [],
    normalLocation: ''
  };

  for (const attr of attributes) {
    const key = attr.attribute_key;
    const value = attr.value;

    if (key === 'ObjObjectTitleGrp.TitleTxt') {
      if (!result.title) result.title = value;
      result.titles.push(value);
    } else if (key === 'ObjObjectNumberGrp.NumberVrt') {
      result.inventoryNumber = value;
    } else if (key === 'ObjDateGrp.PreviewVrt' || key === 'ObjDateGrp.DateTxt') {
      if (!result.date) result.date = value;
    } else if (key === 'ObjDateGrp.DateFromTxt') {
      result.dateFrom = value;
    } else if (key === 'ObjDateGrp.DateToTxt') {
      result.dateTo = value;
    } else if (key === 'ObjDimAllGrp.PreviewVrt') {
      result.dimensions.push(value);
    } else if (key === 'ObjMaterialTechniqueGrp.ExportClb') {
      result.materialsText = value;
    } else if (key === 'ObjMaterialTechniqueGrp.MaterialVoc') {
      if (!result.materials.includes(value)) result.materials.push(value);
    } else if (key === 'ObjTechnicalTermClb') {
      result.technicalTerm = value;
    } else if (key === 'ObjCategoryVoc') {
      result.category = value;
    } else if (key === 'ObjTextOnlineGrp.TextClb') {
      result.description = value;
    } else if (key === 'ObjAcquisitionNotesGrp.MemoClb') {
      result.acquisitionNotes.push(value);
    } else if (key === 'ObjNormalLocationVrt') {
      result.normalLocation = value;
    }
  }

  // Combine dimensions
  result.dimensionsText = result.dimensions.join('; ');

  return result;
}

// Parse artist information
function parseArtist(involvedParties) {
  const artists = [];
  
  for (const party of involvedParties) {
    if (party.person && party.person.name) {
      const role = party.role_voc?.name || '';
      // Clean artist name - remove commas/periods between first and last name
      let name = party.person.name.trim();
      // Handle "LastName, FirstName" format -> "FirstName LastName"
      if (name.includes(',')) {
        const parts = name.split(',').map(s => s.trim());
        if (parts.length === 2 && parts[1].length > 0) {
          name = `${parts[1]} ${parts[0]}`;
        }
      }
      // Remove periods from name
      name = name.replace(/\./g, '');
      
      artists.push({
        name,
        role,
        dateRange: party.person.date_range || '',
        birthDate: party.person.date_of_birth || '',
        deathDate: party.person.date_of_death || ''
      });
    }
  }
  
  return artists;
}

// Build image URL
function buildImageUrl(attachment) {
  if (!attachment) return '';
  // Attachment format: "88/886987.jpg" -> extract image ID and use 2500x2500 format
  // Correct URL: https://recherche.smb.museum/images/886987_2500x2500.jpg
  const match = attachment.match(/(\d+)\.jpg$/);
  if (match) {
    return `${IMAGE_BASE_URL}/${match[1]}_2500x2500.jpg`;
  }
  // Fallback to original format
  return `${IMAGE_BASE_URL}/${attachment}`;
}

// Transform raw API object to our format
function transformObject(obj, museumConfig) {
  const parsed = parseAttributes(obj.attributes || []);
  const artists = parseArtist(obj.involved_parties || []);
  
  // Primary image
  const primaryAttachment = obj.attachments?.find(a => a.primary) || obj.attachments?.[0];
  const imageUrl = primaryAttachment ? buildImageUrl(primaryAttachment.attachment) : '';
  
  // All images
  const allImages = (obj.attachments || [])
    .filter(a => a.media_type === 'IMAGE')
    .map(a => ({
      url: buildImageUrl(a.attachment),
      credits: a.credits || '',
      license: a.license?.key || '',
      primary: a.primary || false
    }));

  // Get geographical references
  const geoRefs = (obj.geographical_references || [])
    .filter(g => g.place_voc?.name)
    .map(g => ({
      place: g.place_voc?.name || '',
      type: g.type_voc?.name || '',
      details: g.details || ''
    }));

  // Get materials and techniques
  const materials = (obj.materials_and_techniques || [])
    .map(m => ({
      type: m.type_voc?.name || '',
      specificType: m.specific_type_voc?.name || '',
      details: m.details || ''
    }));

  // Cultural references
  const culturalRefs = (obj.cultural_references || [])
    .filter(c => c.name_voc?.name || c.type_voc?.name || c.denomination_voc?.name)
    .map(c => ({
      name: c.name_voc?.name || '',
      type: c.type_voc?.name || '',
      denomination: c.denomination_voc?.name || ''
    }));

  // Required 6 fields
  const result = {
    // Internal ID
    id: `${museumConfig.id}-${obj.id}`,
    smbId: obj.id,
    
    // Required field 1: Title
    title: parsed.title || parsed.technicalTerm || `Object ${obj.id}`,
    
    // Required field 2: Artist (full name, no comma/period between first and last)
    artist: artists.length > 0 ? artists[0].name : '',
    artistRole: artists.length > 0 ? artists[0].role : '',
    
    // Required field 3: Date/Year
    date: parsed.date || '',
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    
    // Required field 4: Medium/Material
    medium: parsed.materialsText || parsed.materials.join('; ') || '',
    
    // Required field 5: Type/Category
    type: parsed.technicalTerm || parsed.category || '',
    
    // Required field 6: Dimensions
    dimensions: parsed.dimensionsText || '',
    
    // Image
    imageUrl,
    
    // Additional fields for semantic search
    inventoryNumber: parsed.inventoryNumber,
    description: parsed.description,
    collection: obj.collectionKey || '',
    exhibitionSpace: obj.exhibition_space || '',
    location: obj.location?.name || '',
    compilation: obj.compilation || '',
    
    // All artists with roles
    artists,
    
    // All images
    images: allImages,
    
    // Geographical references
    geographicalReferences: geoRefs,
    
    // Materials and techniques detail
    materialsAndTechniques: materials,
    
    // Cultural references
    culturalReferences: culturalRefs,
    
    // Acquisition notes
    acquisitionNotes: parsed.acquisitionNotes,
    
    // Additional titles
    alternateTitles: parsed.titles.filter(t => t !== parsed.title),
    
    // License
    license: primaryAttachment?.license?.key || '',
    credits: primaryAttachment?.credits || '',
    
    // Source URL
    sourceUrl: `https://recherche.smb.museum/detail/${obj.id}`,
    
    // Museum info
    museum: museumConfig.name,
    museumId: museumConfig.id
  };

  return result;
}

// Save progress
function saveProgress(progressFile, data) {
  fs.writeFileSync(progressFile, JSON.stringify(data, null, 2));
}

// Load progress
function loadProgress(progressFile) {
  try {
    if (fs.existsSync(progressFile)) {
      return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    }
  } catch (e) {}
  return { offset: 0, artworks: [] };
}

// Save final output
function saveOutput(outputFile, artworks) {
  fs.writeFileSync(outputFile, JSON.stringify(artworks, null, 2));
  console.log(`\n✓ Saved ${artworks.length} artworks to ${outputFile}`);
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main scrape function for a museum
async function scrapeMuseum(museumKey, testMode = false, testLimit = 45) {
  const museum = MUSEUMS[museumKey];
  if (!museum) {
    throw new Error(`Unknown museum: ${museumKey}`);
  }

  const progressFile = path.join(__dirname, '../downloads', museum.progressFile);
  const outputFile = path.join(__dirname, '../public/data', museum.outputFile);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping: ${museum.name}`);
  console.log(`${'='.repeat(60)}`);

  // Get total count
  const countData = await graphqlRequest(COUNT_QUERY, { locationFilter: museum.locationFilter });
  const totalCount = countData.smb_objects_aggregate.aggregate.count;
  console.log(`Total objects: ${totalCount}`);

  if (testMode) {
    console.log(`Test mode: Fetching ${testLimit} items only`);
  }

  // Load progress
  let progress = testMode ? { offset: 0, artworks: [] } : loadProgress(progressFile);
  const limit = testMode ? testLimit : totalCount;

  while (progress.offset < limit) {
    const batchSize = Math.min(BATCH_SIZE, limit - progress.offset);
    
    console.log(`\nFetching objects ${progress.offset + 1} - ${progress.offset + batchSize}...`);
    
    try {
      const data = await graphqlRequest(OBJECTS_QUERY, {
        locationFilter: museum.locationFilter,
        limit: batchSize,
        offset: progress.offset
      });

      const objects = data.smb_objects || [];
      console.log(`  Received ${objects.length} objects`);

      for (const obj of objects) {
        const artwork = transformObject(obj, museum);
        progress.artworks.push(artwork);
        
        // Log progress
        if (progress.artworks.length % 10 === 0) {
          console.log(`  Processed ${progress.artworks.length} artworks...`);
        }
      }

      progress.offset += objects.length;

      // Save checkpoint every 50 items (not in test mode)
      if (!testMode && progress.artworks.length % BATCH_SIZE === 0) {
        console.log(`  💾 Checkpoint: Saving progress at ${progress.artworks.length} artworks...`);
        saveProgress(progressFile, progress);
      }

      // Delay between requests
      await delay(DELAY_MS);

    } catch (error) {
      console.error(`  Error fetching batch:`, error.message);
      // Save progress on error
      if (!testMode) {
        saveProgress(progressFile, progress);
      }
      throw error;
    }
  }

  // Final save
  if (!testMode) {
    saveProgress(progressFile, progress);
  }
  saveOutput(outputFile, progress.artworks);

  return progress.artworks;
}

// Get statistics about scraped data
function getStats(artworks) {
  const stats = {
    total: artworks.length,
    withTitle: artworks.filter(a => a.title && a.title !== `Object ${a.smbId}`).length,
    withArtist: artworks.filter(a => a.artist).length,
    withDate: artworks.filter(a => a.date).length,
    withMedium: artworks.filter(a => a.medium).length,
    withType: artworks.filter(a => a.type).length,
    withDimensions: artworks.filter(a => a.dimensions).length,
    withImage: artworks.filter(a => a.imageUrl).length,
    withDescription: artworks.filter(a => a.description).length,
    byLicense: {},
    byCollection: {}
  };

  for (const a of artworks) {
    if (a.license) {
      stats.byLicense[a.license] = (stats.byLicense[a.license] || 0) + 1;
    }
    if (a.collection) {
      stats.byCollection[a.collection] = (stats.byCollection[a.collection] || 0) + 1;
    }
  }

  return stats;
}

// Print statistics
function printStats(museumName, artworks) {
  const stats = getStats(artworks);
  
  console.log(`\n📊 Statistics for ${museumName}:`);
  console.log(`  Total artworks: ${stats.total}`);
  console.log(`  With title: ${stats.withTitle} (${(stats.withTitle/stats.total*100).toFixed(1)}%)`);
  console.log(`  With artist: ${stats.withArtist} (${(stats.withArtist/stats.total*100).toFixed(1)}%)`);
  console.log(`  With date: ${stats.withDate} (${(stats.withDate/stats.total*100).toFixed(1)}%)`);
  console.log(`  With medium: ${stats.withMedium} (${(stats.withMedium/stats.total*100).toFixed(1)}%)`);
  console.log(`  With type: ${stats.withType} (${(stats.withType/stats.total*100).toFixed(1)}%)`);
  console.log(`  With dimensions: ${stats.withDimensions} (${(stats.withDimensions/stats.total*100).toFixed(1)}%)`);
  console.log(`  With image: ${stats.withImage} (${(stats.withImage/stats.total*100).toFixed(1)}%)`);
  console.log(`  With description: ${stats.withDescription} (${(stats.withDescription/stats.total*100).toFixed(1)}%)`);
  
  console.log(`\n  By license:`);
  for (const [license, count] of Object.entries(stats.byLicense)) {
    console.log(`    ${license}: ${count}`);
  }
  
  console.log(`\n  By collection:`);
  for (const [collection, count] of Object.entries(stats.byCollection)) {
    console.log(`    ${collection}: ${count}`);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const museumKey = args[1];

  if (command === 'test') {
    // Test mode: scrape limited items from each museum
    console.log('🧪 TEST MODE: Scraping 45 items from each museum...\n');
    
    const results = {};
    for (const key of ['humboldt', 'altes', 'neues']) {
      try {
        const artworks = await scrapeMuseum(key, true, 45);
        results[key] = artworks;
        printStats(MUSEUMS[key].name, artworks);
      } catch (error) {
        console.error(`Error scraping ${key}:`, error.message);
      }
    }
    
    // Save combined test results
    const testOutputFile = path.join(__dirname, '../public/data/smb-test-collection.json');
    const allArtworks = Object.values(results).flat();
    fs.writeFileSync(testOutputFile, JSON.stringify(allArtworks, null, 2));
    console.log(`\n✓ Saved ${allArtworks.length} test artworks to ${testOutputFile}`);
    
  } else if (command === 'full' && museumKey) {
    // Full scrape for specific museum
    console.log(`🚀 FULL SCRAPE: ${MUSEUMS[museumKey]?.name || museumKey}\n`);
    
    if (!MUSEUMS[museumKey]) {
      console.error('Invalid museum key. Use: humboldt, altes, or neues');
      process.exit(1);
    }
    
    const artworks = await scrapeMuseum(museumKey, false);
    printStats(MUSEUMS[museumKey].name, artworks);
    
  } else if (command === 'all') {
    // Full scrape for all museums sequentially
    console.log('🚀 FULL SCRAPE: All museums\n');
    
    for (const key of ['humboldt', 'altes', 'neues']) {
      try {
        const artworks = await scrapeMuseum(key, false);
        printStats(MUSEUMS[key].name, artworks);
      } catch (error) {
        console.error(`Error scraping ${key}:`, error.message);
      }
    }
    
  } else if (command === 'count') {
    // Just get counts
    console.log('📊 Getting object counts...\n');
    
    for (const [key, museum] of Object.entries(MUSEUMS)) {
      const countData = await graphqlRequest(COUNT_QUERY, { locationFilter: museum.locationFilter });
      const count = countData.smb_objects_aggregate.aggregate.count;
      console.log(`  ${museum.name}: ${count} objects`);
    }
    
  } else {
    console.log('SMB Museums GraphQL Scraper');
    console.log('Usage:');
    console.log('  node scrape-smb-museums.cjs test              - Test scrape (45 items per museum)');
    console.log('  node scrape-smb-museums.cjs full humboldt     - Full scrape Humboldt Forum');
    console.log('  node scrape-smb-museums.cjs full altes        - Full scrape Altes Museum');
    console.log('  node scrape-smb-museums.cjs full neues        - Full scrape Neues Museum');
    console.log('  node scrape-smb-museums.cjs all               - Full scrape all museums');
    console.log('  node scrape-smb-museums.cjs count             - Get object counts');
  }
}

main().catch(console.error);

module.exports = { scrapeMuseum, MUSEUMS, graphqlRequest, transformObject };
