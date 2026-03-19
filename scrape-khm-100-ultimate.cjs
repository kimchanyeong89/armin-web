const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM100Final() {
  console.log('🎨 KHM Museum - Final Push to 100 Artworks\n');
  console.log('Strategy: Multiple cHash URLs + Detail Enhancement\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // URLs that are known to work (discovered from successful requests)
  const workingUrls = [
    // Original working URL
    {
      url: `${baseUrl}/en/artworks/search?page=1&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&cHash=11277c9cb58e1eef7193f541418b1370`,
      name: 'Page 1 (original)'
    },
    {
      url: `${baseUrl}/en/artworks/search?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=2&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=604bcf797dee889b38ebae87ccf2e716`,
      name: 'Page 2 (with date filter)'
    },
    // Try variations with different view and show parameters
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&page=1&show=48`,
      name: 'Page 1 show=48'
    },
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&page=1&show=96`,
      name: 'Page 1 show=96'
    },
    // Try different classification filters
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&facet_classification=48&page=1`,
      name: 'Paintings (facet 48)'
    },
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&facet_classification=49&page=1`,
      name: 'Decorative Arts (facet 49)'
    },
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&facet_classification=50&page=1`,
      name: 'Antiquities (facet 50)'
    },
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&facet_classification=51&page=1`,
      name: 'Musical Instruments (facet 51)'
    },
    {
      url: `${baseUrl}/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&facet_classification=52&page=1`,
      name: 'Sculptures (facet 52)'
    },
  ];
  
  console.log(`📂 Testing ${workingUrls.length} different URLs\n`);
  
  for (const [index, urlConfig] of workingUrls.entries()) {
    if (results.length >= 100) {
      console.log(`\n🎯 Reached 100 items!\n`);
      break;
    }
    
    console.log(`[${index + 1}/${workingUrls.length}] ${urlConfig.name}`);
    
    try {
      const response = await axios.post(
        urlConfig.url,
        {},
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'HX-Request': 'true',
          },
          timeout: 15000
        }
      );
      
      const $ = cheerio.load(response.data);
      const items = $('.grid-item .object-gallery-item');
      
      console.log(`   Found ${items.length} items`);
      
      if (items.length === 0) {
        console.log(`   ⚠️  Skipping`);
        continue;
      }
      
      let newCount = 0;
      const existingIds = new Set(results.map(r => r.id));
      
      items.each((i, el) => {
        if (results.length >= 100) return false;
        
        const item = $(el);
        const link = item.find('a.detail').first();
        const href = link.attr('href');
        
        if (!href) return;
        
        const objectId = link.attr('data-id');
        
        if (objectId && existingIds.has(objectId)) return;
        
        const fullUrl = href.startsWith('http') ? href : baseUrl + href;
        const img = item.find('img').first();
        const imageSrc = img.attr('src');
        const imageAlt = img.attr('alt');
        
        const caption = item.find('.object-caption p');
        const spans = caption.find('span');
        
        const title = spans.eq(0).text().trim() || imageAlt || 'Untitled';
        const culture = spans.eq(1).find('small').text().trim();
        const date = spans.eq(2).find('small').text().trim();
        
        results.push({
          id: objectId || `khm_${results.length + 1}`,
          url: fullUrl,
          title: title,
          artist: culture || '',
          culture: culture || '',
          date: date || '',
          imageUrl: imageSrc && imageSrc.startsWith('/') ? baseUrl + imageSrc : imageSrc
        });
        
        newCount++;
        existingIds.add(objectId);
      });
      
      if (newCount > 0) {
        console.log(`   ✅ Added ${newCount} new items (Total: ${results.length}/100)`);
      } else {
        console.log(`   ⚠️  All were duplicates`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1200));
      
    } catch (error) {
      console.log(`   ❌ ${error.message}`);
    }
  }
  
  // If still not 100, pad with detail page scraping from different sections
  if (results.length < 100) {
    console.log(`\n📋 Currently have ${results.length}/100 items`);
    console.log(`🔍 Searching for ${100 - results.length} more artworks...\n`);
    
    // Try browsing specific object detail pages by incrementing IDs
    const baseIds = results.filter(r => r.id && !isNaN(r.id)).map(r => parseInt(r.id));
    if (baseIds.length > 0) {
      const minId = Math.min(...baseIds);
      const maxId = Math.max(...baseIds);
      
      console.log(`   ID range found: ${minId} - ${maxId}`);
      console.log(`   Trying to find nearby artworks...\n`);
      
      // Try IDs around the found range
      const idsToTry = [];
      for (let id = maxId + 1; id <= maxId + 100 && idsToTry.length < 60; id++) {
        idsToTry.push(id);
      }
      for (let id = minId - 50; id < minId && idsToTry.length < 100; id++) {
        if (id > 0) idsToTry.push(id);
      }
      
      const existingIds = new Set(results.map(r => r.id));
      
      for (const id of idsToTry) {
        if (results.length >= 100) break;
        if (existingIds.has(id.toString())) continue;
        
        try {
          // Try to access artwork by ID
          const testUrl = `${baseUrl}/en/artworks/object/${id}`;
          
          const response = await axios.get(testUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000,
            maxRedirects: 5
          });
          
          if (response.status === 200) {
            const $ = cheerio.load(response.data);
            
            // Check if it's a valid artwork page
            const title = $('.object-title, h1').first().text().trim();
            
            if (title && title.length > 3 && !title.toLowerCase().includes('error')) {
              const img = $('.object-image img, [itemprop="image"]').first().attr('src');
              const culture = $('.object-data dt:contains("Culture"), .metadata dt:contains("Kultur")').next('dd').text().trim();
              const date = $('.object-data dt:contains("Date"), .metadata dt:contains("Datierung")').next('dd').text().trim();
              
              results.push({
                id: id.toString(),
                url: response.request.res.responseUrl || testUrl,
                title: title,
                artist: culture || '',
                culture: culture || '',
                date: date || '',
                imageUrl: img && img.startsWith('/') ? baseUrl + img : img || ''
              });
              
              console.log(`   ✓ Found ID ${id}: ${title.substring(0, 40)}... (Total: ${results.length})`);
              existingIds.add(id.toString());
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 400));
          
        } catch (error) {
          // Silent fail for 404s
          if (results.length % 20 === 0 && results.length < 100) {
            console.log(`   ... searching (${results.length}/100)`);
          }
        }
      }
    }
  }
  
  console.log(`\n✅ Collection phase complete: ${results.length} artworks\n`);
  
  // Enhance all artworks with detail page metadata
  console.log(`📋 Phase 2: Enhancing ALL ${Math.min(results.length, 100)} artworks with full metadata\n`);
  
  const enhanced = [];
  const limit = Math.min(results.length, 100);
  
  for (let index = 0; index < limit; index++) {
    const artwork = results[index];
    console.log(`[${index + 1}/${limit}] ${artwork.title.substring(0, 50)}...`);
    
    try {
      const response = await axios.get(artwork.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      // Comprehensive metadata extraction
      const metadata = {};
      
      // Extract dt/dd pairs
      $('dt').each((i, el) => {
        const key = $(el).text().trim().toLowerCase().replace(/[:]/g, '');
        const value = $(el).next('dd').text().trim();
        if (key && value) metadata[key] = value;
      });
      
      // Extract labeled fields
      $('.field, .metadata-field, .object-data-field').each((i, el) => {
        const label = $(el).find('.label, .field-label, dt, .key').first().text().trim().toLowerCase();
        const value = $(el).find('.value, .field-value, dd, .val').first().text().trim();
        if (label && value) metadata[label] = value;
      });
      
      // Description - try multiple selectors
      let description = '';
      ['.object-description', '.description', '[itemprop="description"]', '.text-content', '.detail-text p', '.object-text'].forEach(selector => {
        const desc = $(selector).text().trim();
        if (desc && desc.length > description.length) description = desc;
      });
      
      // Better image
      let highResImage = artwork.imageUrl;
      const imgSelectors = ['.object-image img', '.detail-image img', '[itemprop="image"]', '.zoom-image', 'img[data-src]'];
      for (const selector of imgSelectors) {
        const src = $(selector).first().attr('src') || $(selector).first().attr('data-src');
        if (src && src.length > 10) {
          highResImage = src.startsWith('http') ? src : baseUrl + src;
          break;
        }
      }
      
      // Extract specific metadata fields
      const medium = metadata.material || metadata.medium || metadata.technik || metadata.technique || 
                    metadata.materialien || metadata.materials || '';
      const dimensions = metadata.dimensions || metadata.maße || metadata.size || metadata.größe || 
                        metadata.measurements || metadata.abmessungen || '';
      const objectType = metadata['object type'] || metadata.objekttyp || metadata.objektart || 
                        metadata.category || metadata.kategorie || '';
      const inventory = metadata['inventory number'] || metadata.inventarnummer || metadata['inv. no.'] || 
                       metadata['inv.-nr.'] || metadata.objektnummer || artwork.id || '';
      const period = metadata.period || metadata.periode || metadata.epoche || metadata.epoch || '';
      const provenance = metadata.provenance || metadata.provenienz || metadata.herkunft || '';
      const creditLine = metadata['credit line'] || metadata.credit || metadata.erwerbung || '';
      const location = metadata.location || metadata.standort || metadata.display || metadata.ausstellung || '';
      
      // Highlight determination
      const isHighlight = $('.highlight-badge, .featured, [class*="highlight"]').length > 0 ||
                         description.toLowerCase().includes('masterpiece') ||
                         description.toLowerCase().includes('meisterwerk');
      
      const enhancedArtwork = {
        id: artwork.id,
        url: artwork.url,
        title: artwork.title,
        artist: artwork.artist || metadata.artist || metadata.künstler || '',
        culture: artwork.culture || metadata.culture || metadata.kultur || '',
        date: artwork.date || metadata.date || metadata.datierung || metadata.dating || '',
        period: period,
        medium: medium,
        dimensions: dimensions,
        inventory: inventory,
        imageUrl: highResImage,
        classification: determineClassification(artwork.title, artwork.culture, objectType),
        objectType: objectType || determineObjectType(artwork.title),
        category: artwork.culture || objectType || '',
        isHighlight: isHighlight,
        description: description.substring(0, 1500),
        provenance: provenance,
        creditLine: creditLine,
        location: location,
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: index + 1
      };
      
      enhanced.push(enhancedArtwork);
      
      // Report enhancements
      const enhancements = [];
      if (medium) enhancements.push('medium');
      if (dimensions) enhancements.push('dimensions');
      if (description) enhancements.push('description');
      if (objectType) enhancements.push('type');
      if (provenance) enhancements.push('provenance');
      
      if (enhancements.length > 0) {
        console.log(`   ✓ Enhanced: ${enhancements.join(', ')}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 600));
      
    } catch (error) {
      console.log(`   ⚠️  Error: ${error.message.substring(0, 60)}`);
      
      // Add basic data even if detail fetch fails
      enhanced.push({
        ...artwork,
        medium: '',
        dimensions: '',
        description: '',
        inventory: artwork.id || '',
        classification: determineClassification(artwork.title, artwork.culture, ''),
        objectType: determineObjectType(artwork.title),
        category: artwork.culture || '',
        isHighlight: false,
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: index + 1
      });
    }
  }
  
  // Save
  const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
  
  console.log(`\n\n✅ SUCCESS! Saved ${enhanced.length} artworks with complete metadata!`);
  console.log(`📁 File: khm-test-100.json\n`);
  
  // Comprehensive statistics
  printFinalStats(enhanced);
}

function determineClassification(title, culture, objectType) {
  const t = (title || '').toLowerCase();
  const c = (culture || '').toLowerCase();
  const o = (objectType || '').toLowerCase();
  
  if (t.includes('gemälde') || t.includes('painting') || o.includes('painting') || o.includes('gemälde')) return 'Painting';
  if (t.includes('skulptur') || t.includes('statue') || t.includes('büste') || t.includes('relief') || o.includes('sculpture')) return 'Sculpture';
  if (c.includes('römisch') || c.includes('griechisch') || c.includes('hellenistisch') || c.includes('ägyptisch') || c.includes('etruskisch')) return 'Antiquities';
  if (t.includes('kameo') || t.includes('gemme') || t.includes('cameo')) return 'Gem/Cameo';
  if (t.includes('instrument') || t.includes('violine') || t.includes('klavier') || t.includes('gambe') || 
      t.includes('cembalo') || t.includes('gitarre') || t.includes('flöte') || t.includes('orgel')) return 'Musical Instrument';
  if (t.includes('fibel') || t.includes('medaillon') || t.includes('kapsel') || t.includes('krug') || 
      t.includes('pokal') || t.includes('becken') || t.includes('uhr') || t.includes('dose')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title) {
  const t = (title || '').toLowerCase();
  const types = {
    'kameo': 'Cameo', 'gemme': 'Gem', 'stele': 'Stele', 'relief': 'Relief',
    'statue': 'Statue', 'büste': 'Bust', 'kopf': 'Head', 'torso': 'Torso',
    'fibel': 'Fibula', 'sarkophag': 'Sarcophagus', 'urne': 'Urn',
    'violine': 'Violin', 'viola': 'Viola', 'violoncello': 'Cello', 'gambe': 'Viol',
    'cembalo': 'Harpsichord', 'klavier': 'Piano', 'flügel': 'Piano',
    'flöte': 'Flute', 'trompete': 'Trumpet', 'posaune': 'Trombone',
    'gitarre': 'Guitar', 'harfe': 'Harp', 'orgel': 'Organ',
    'pokal': 'Cup', 'becher': 'Beaker', 'krug': 'Jug', 'becken': 'Bowl',
    'uhr': 'Clock', 'dose': 'Box', 'schale': 'Dish',
    'gemälde': 'Painting', 'porträt': 'Portrait'
  };
  
  for (const [key, type] of Object.entries(types)) {
    if (t.includes(key)) return type;
  }
  return 'Artwork';
}

function printFinalStats(artworks) {
  const total = artworks.length;
  
  console.log('═══════════════════════════════════════════════════');
  console.log('📊 FINAL DATA QUALITY REPORT');
  console.log('═══════════════════════════════════════════════════\n');
  
  console.log(`Total Artworks: ${total}`);
  console.log(`\nData Completeness:`);
  console.log(`   ✓ Images: ${artworks.filter(a => a.imageUrl).length}/${total} (${Math.round(artworks.filter(a => a.imageUrl).length/total*100)}%)`);
  console.log(`   ✓ Culture: ${artworks.filter(a => a.culture).length}/${total} (${Math.round(artworks.filter(a => a.culture).length/total*100)}%)`);
  console.log(`   ✓ Dates: ${artworks.filter(a => a.date).length}/${total} (${Math.round(artworks.filter(a => a.date).length/total*100)}%)`);
  console.log(`   ✓ Medium: ${artworks.filter(a => a.medium).length}/${total} (${Math.round(artworks.filter(a => a.medium).length/total*100)}%)`);
  console.log(`   ✓ Dimensions: ${artworks.filter(a => a.dimensions).length}/${total} (${Math.round(artworks.filter(a => a.dimensions).length/total*100)}%)`);
  console.log(`   ✓ Descriptions: ${artworks.filter(a => a.description).length}/${total} (${Math.round(artworks.filter(a => a.description).length/total*100)}%)`);
  console.log(`   ✓ Object Types: ${artworks.filter(a => a.objectType && a.objectType !== 'Artwork').length}/${total} (${Math.round(artworks.filter(a => a.objectType && a.objectType !== 'Artwork').length/total*100)}%)`);
  console.log(`   ✓ Highlights: ${artworks.filter(a => a.isHighlight).length}`);
  
  // Classifications
  const classifications = {};
  artworks.forEach(a => classifications[a.classification] = (classifications[a.classification] || 0) + 1);
  
  console.log(`\n🏛️  Classification Breakdown:`);
  Object.entries(classifications).sort((a,b) => b[1]-a[1]).forEach(([cls, count]) => {
    const pct = Math.round(count/total*100);
    console.log(`   ${cls}: ${count} (${pct}%)`);
  });
  
  // Object types
  const types = {};
  artworks.forEach(a => types[a.objectType] = (types[a.objectType] || 0) + 1);
  
  console.log(`\n🎨 Object Types (top 15):`);
  Object.entries(types).sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  // Sample entries
  console.log(`\n📋 Sample Entries (diverse selection):`);
  const samples = [];
  for (const cls of Object.keys(classifications)) {
    const item = artworks.find(a => a.classification === cls);
    if (item && !samples.includes(item)) samples.push(item);
  }
  
  samples.slice(0, 5).forEach((art, i) => {
    console.log(`\n${i + 1}. ${art.title}`);
    console.log(`   Classification: ${art.classification}`);
    console.log(`   Type: ${art.objectType}`);
    console.log(`   Culture: ${art.culture || 'Unknown'}`);
    console.log(`   Date: ${art.date || 'N/A'}`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log(`   Dimensions: ${art.dimensions || 'N/A'}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
    if (art.description) {
      console.log(`   Description: ${art.description.substring(0, 100)}...`);
    }
  });
  
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log('✅ SCRAPING COMPLETE!');
  console.log('═══════════════════════════════════════════════════\n');
}

scrapeKHM100Final().catch(console.error);
