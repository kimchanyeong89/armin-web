const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function completeKHM100() {
  console.log('🎨 KHM Museum - Final 100 Artworks Completion\n');
  console.log('Loading existing 48 artworks and expanding to 100...\n');
  
  const inputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  let existing = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  console.log(`✅ Loaded ${existing.length} existing artworks\n`);
  
  const baseUrl = 'https://www.khm.at';
  const allResults = [...existing];
  const existingIds = new Set(existing.map(a => a.id));
  
  // Strategy 1: Try more working cHash URLs
  console.log('📂 Strategy 1: Trying additional API pages with cHash\n');
  
  const additionalUrls = [
    // Try the working page 2 URL again but with different parameters
    `${baseUrl}/en/artworks/search?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=1&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=604bcf797dee889b38ebae87ccf2e716`,
    `${baseUrl}/en/artworks/search?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=3&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=604bcf797dee889b38ebae87ccf2e716`,
    // Try without listOnly
    `${baseUrl}/en/artworks/search?page=3&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&cHash=11277c9cb58e1eef7193f541418b1370`,
    `${baseUrl}/en/artworks/search?page=4&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&cHash=11277c9cb58e1eef7193f541418b1370`,
  ];
  
  for (const url of additionalUrls) {
    if (allResults.length >= 100) break;
    
    console.log(`   Trying URL...`);
    
    try {
      const response = await axios.post(url, {}, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'text/html,*/*',
          'HX-Request': 'true',
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      const items = $('.grid-item .object-gallery-item');
      
      if (items.length > 0) {
        let newCount = 0;
        
        items.each((i, el) => {
          if (allResults.length >= 100) return false;
          
          const item = $(el);
          const link = item.find('a.detail').first();
          const objectId = link.attr('data-id');
          
          if (objectId && existingIds.has(objectId)) return;
          
          const href = link.attr('href');
          const fullUrl = href?.startsWith('http') ? href : baseUrl + href;
          const img = item.find('img').first();
          const caption = item.find('.object-caption p');
          const spans = caption.find('span');
          
          const title = spans.eq(0).text().trim() || img.attr('alt') || 'Untitled';
          const culture = spans.eq(1).find('small').text().trim();
          const date = spans.eq(2).find('small').text().trim();
          const imageSrc = img.attr('src');
          
          allResults.push({
            id: objectId,
            url: fullUrl,
            title: title,
            artist: culture,
            culture: culture,
            date: date,
            imageUrl: imageSrc?.startsWith('/') ? baseUrl + imageSrc : imageSrc
          });
          
          existingIds.add(objectId);
          newCount++;
        });
        
        if (newCount > 0) {
          console.log(`   ✅ Added ${newCount} items (Total: ${allResults.length}/100)`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ ${error.message.substring(0, 60)}`);
    }
  }
  
  // Strategy 2: Sequential ID search based on existing IDs
  if (allResults.length < 100) {
    console.log(`\n📂 Strategy 2: Sequential ID discovery\n`);
    console.log(`   Current count: ${allResults.length}/100`);
    console.log(`   Need: ${100 - allResults.length} more artworks\n`);
    
    // Get ID ranges from existing artworks
    const numericIds = allResults
      .map(a => parseInt(a.id))
      .filter(id => !isNaN(id))
      .sort((a, b) => a - b);
    
    if (numericIds.length > 0) {
      const minId = numericIds[0];
      const maxId = numericIds[numericIds.length - 1];
      
      console.log(`   ID range: ${minId} - ${maxId}`);
      console.log(`   Searching for artworks in nearby ranges...\n`);
      
      // Try IDs immediately after maxId
      const idsToTry = [];
      for (let id = maxId + 1; id <= maxId + 60; id++) {
        idsToTry.push(id);
      }
      // Try filling gaps in the middle
      for (let id = minId; id <= maxId; id++) {
        if (!existingIds.has(id.toString())) {
          idsToTry.push(id);
        }
      }
      
      for (const id of idsToTry) {
        if (allResults.length >= 100) break;
        
        // Try common URL patterns for artworks
        const urlPatterns = [
          `${baseUrl}/en/artworks/object-${id}`,
          `${baseUrl}/en/artworks/${id}`,
        ];
        
        for (const testUrl of urlPatterns) {
          try {
            const response = await axios.get(testUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              timeout: 5000,
              maxRedirects: 5
            });
            
            if (response.status === 200 && response.data.includes('object')) {
              const $ = cheerio.load(response.data);
              
              const title = $('h1, .object-title').first().text().trim();
              
              if (title && title.length > 3 && !title.toLowerCase().includes('error')) {
                const img = $('.object-image img, [itemprop="image"]').first().attr('src');
                const culture = $('.object-data dt:contains("Culture"), .metadata dt').next('dd').first().text().trim();
                const date = $('.object-data dt:contains("Date"), .metadata dt').eq(1).next('dd').text().trim();
                
                allResults.push({
                  id: id.toString(),
                  url: response.request.res.responseUrl || testUrl,
                  title: title,
                  artist: culture,
                  culture: culture,
                  date: date,
                  imageUrl: img && img.startsWith('/') ? baseUrl + img : img || ''
                });
                
                existingIds.add(id.toString());
                console.log(`   ✓ ID ${id}: ${title.substring(0, 40)}... (${allResults.length}/100)`);
                break;
              }
            }
          } catch (error) {
            // Silent fail
          }
        }
        
        if (allResults.length % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
  }
  
  console.log(`\n✅ Collection phase: ${allResults.length} artworks\n`);
  
  // Now enhance ALL artworks with detailed metadata
  console.log(`📋 Enhancing ALL ${Math.min(allResults.length, 100)} artworks with complete metadata\n`);
  
  const enhanced = [];
  const limit = Math.min(allResults.length, 100);
  
  for (let i = 0; i < limit; i++) {
    const artwork = allResults[i];
    
    console.log(`[${i + 1}/${limit}] ${artwork.title.substring(0, 50)}...`);
    
    try {
      const response = await axios.get(artwork.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 12000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract comprehensive metadata
      const meta = {};
      
      $('dt').each((idx, el) => {
        const key = $(el).text().trim().toLowerCase().replace(/[:]/g, '');
        const value = $(el).next('dd').text().trim();
        if (key && value) meta[key] = value;
      });
      
      // Description
      let desc = '';
      ['.object-description', '.description', '[itemprop="description"]', '.detail-text'].forEach(sel => {
        const text = $(sel).text().trim();
        if (text && text.length > desc.length) desc = text;
      });
      
      // Image
      let img = artwork.imageUrl;
      const imgEl = $('.object-image img, [itemprop="image"]').first();
      const imgSrc = imgEl.attr('src') || imgEl.attr('data-src');
      if (imgSrc && imgSrc.length > 10) {
        img = imgSrc.startsWith('http') ? imgSrc : baseUrl + imgSrc;
      }
      
      enhanced.push({
        id: artwork.id || `khm_${i + 1}`,
        url: artwork.url,
        title: artwork.title,
        artist: artwork.artist || meta.artist || meta.künstler || '',
        culture: artwork.culture || meta.culture || meta.kultur || '',
        date: artwork.date || meta.date || meta.datierung || '',
        period: meta.period || meta.periode || '',
        medium: meta.material || meta.medium || meta.technik || '',
        dimensions: meta.dimensions || meta.maße || meta.size || '',
        inventory: meta.inventarnummer || meta['inventory number'] || artwork.id || '',
        imageUrl: img,
        classification: determineClass(artwork.title, artwork.culture, meta.objekttyp || ''),
        objectType: meta.objekttyp || meta['object type'] || determineType(artwork.title),
        category: artwork.culture || meta.category || '',
        isHighlight: false,
        description: desc.substring(0, 1500),
        provenance: meta.provenienz || meta.provenance || '',
        location: meta.standort || meta.location || '',
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: i + 1
      });
      
      const enhancements = [];
      if (meta.medium || meta.material) enhancements.push('medium');
      if (meta.dimensions || meta.maße) enhancements.push('dim');
      if (desc) enhancements.push('desc');
      
      if (enhancements.length > 0) {
        console.log(`   ✓ ${enhancements.join(', ')}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`   ⚠️  ${error.message.substring(0, 50)}`);
      
      enhanced.push({
        ...artwork,
        medium: '', dimensions: '', description: '',
        inventory: artwork.id || '',
        classification: determineClass(artwork.title, artwork.culture, ''),
        objectType: determineType(artwork.title),
        category: artwork.culture || '',
        isHighlight: false,
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: i + 1
      });
    }
  }
  
  // Save final dataset
  const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
  
  console.log(`\n\n✅ FINAL DATASET COMPLETE!`);
  console.log(`📁 Saved ${enhanced.length} artworks to khm-test-100.json\n`);
  
  printFinalReport(enhanced);
}

function determineClass(title, culture, objectType) {
  const t = (title || '').toLowerCase();
  const c = (culture || '').toLowerCase();
  const o = (objectType || '').toLowerCase();
  
  if (t.includes('gemälde') || o.includes('painting')) return 'Painting';
  if (t.includes('relief') || t.includes('statue') || t.includes('büste') || t.includes('kopf')) return 'Sculpture';
  if (c.includes('römisch') || c.includes('griechisch') || c.includes('hellenistisch') || c.includes('etruskisch')) return 'Antiquities';
  if (t.includes('kameo') || t.includes('gemme')) return 'Gem/Cameo';
  if (t.includes('instrument') || t.includes('violine') || t.includes('cembalo')) return 'Musical Instrument';
  if (t.includes('pokal') || t.includes('uhr') || t.includes('becken') || t.includes('krug')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineType(title) {
  const t = (title || '').toLowerCase();
  const map = {
    'stele': 'Stele', 'relief': 'Relief', 'büste': 'Bust', 'statue': 'Statue', 'kopf': 'Head',
    'sarkophag': 'Sarcophagus', 'urne': 'Urn', 'kameo': 'Cameo', 'gemme': 'Gem',
    'pokal': 'Cup', 'becken': 'Bowl', 'krug': 'Jug', 'uhr': 'Clock', 'dose': 'Box', 'schale': 'Dish'
  };
  
  for (const [key, val] of Object.entries(map)) {
    if (t.includes(key)) return val;
  }
  return 'Artwork';
}

function printFinalReport(artworks) {
  const total = artworks.length;
  
  console.log('════════════════════════════════════════════════════');
  console.log(`📊 KUNSTHISTORISCHES MUSEUM VIENNA - FINAL DATASET`);
  console.log('════════════════════════════════════════════════════\n');
  
  console.log(`✅ Total Artworks: ${total}\n`);
  
  console.log('📈 Data Completeness:');
  console.log(`   Images:        ${artworks.filter(a => a.imageUrl).length}/${total} (${Math.round(artworks.filter(a => a.imageUrl).length/total*100)}%)`);
  console.log(`   Culture:       ${artworks.filter(a => a.culture).length}/${total} (${Math.round(artworks.filter(a => a.culture).length/total*100)}%)`);
  console.log(`   Dates:         ${artworks.filter(a => a.date).length}/${total} (${Math.round(artworks.filter(a => a.date).length/total*100)}%)`);
  console.log(`   Medium:        ${artworks.filter(a => a.medium).length}/${total} (${Math.round(artworks.filter(a => a.medium).length/total*100)}%)`);
  console.log(`   Dimensions:    ${artworks.filter(a => a.dimensions).length}/${total} (${Math.round(artworks.filter(a => a.dimensions).length/total*100)}%)`);
  console.log(`   Descriptions:  ${artworks.filter(a => a.description).length}/${total} (${Math.round(artworks.filter(a => a.description).length/total*100)}%)`);
  
  const classes = {};
  artworks.forEach(a => classes[a.classification] = (classes[a.classification] || 0) + 1);
  
  console.log(`\n🏛️  Classifications:`);
  Object.entries(classes).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => {
    console.log(`   ${c}: ${n} (${Math.round(n/total*100)}%)`);
  });
  
  const types = {};
  artworks.forEach(a => types[a.objectType] = (types[a.objectType] || 0) + 1);
  
  console.log(`\n🎨 Object Types (top 12):`);
  Object.entries(types).sort((a,b) => b[1]-a[1]).slice(0, 12).forEach(([t, n]) => {
    console.log(`   ${t}: ${n}`);
  });
  
  console.log(`\n📋 Sample Artworks:`);
  artworks.slice(0, 5).forEach((art, i) => {
    console.log(`\n${i + 1}. ${art.title}`);
    console.log(`   Culture: ${art.culture || 'Unknown'}`);
    console.log(`   Date: ${art.date || 'N/A'}`);
    console.log(`   Type: ${art.objectType}`);
    console.log(`   Classification: ${art.classification}`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
  });
  
  console.log(`\n════════════════════════════════════════════════════`);
  console.log(`✅ SUCCESS! Dataset saved to khm-test-100.json`);
  console.log('════════════════════════════════════════════════════\n');
}

completeKHM100().catch(console.error);
