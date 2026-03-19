const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHMDirectAPI() {
  console.log('🎨 KHM Museum - Direct API Scraping (100 Artworks)\n');
  console.log('Using discovered API endpoint: type=686\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // The intercepted API shows: /en/artworks/search?page=X&tx_theme_objectlist[controller]=Object&type=686&cHash=...
  // We'll try multiple pages with type=686
  
  const maxPages = 10;
  
  for (let page = 1; page <= maxPages && results.length < 100; page++) {
    console.log(`📄 Fetching page ${page}...`);
    
    try {
      const url = `${baseUrl}/en/artworks/search?page=${page}&tx_theme_objectlist[controller]=Object&type=686`;
      
      const response = await axios.post(
        url,
        {},
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html, */*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'HX-Request': 'true',
            'HX-Current-URL': `${baseUrl}/en/artworks/search`,
            'X-Requested-With': 'XMLHttpRequest',
          }
        }
      );
      
      const $ = cheerio.load(response.data);
      const items = $('.grid-item .object-gallery-item, .object-gallery-item');
      
      console.log(`   Found ${items.length} items`);
      
      if (items.length === 0) {
        console.log(`   ⚠️  No more items, stopping`);
        break;
      }
      
      let newCount = 0;
      const existingIds = new Set(results.map(r => r.id));
      
      items.each((i, el) => {
        if (results.length >= 100) return false;
        
        const item = $(el);
        const link = item.find('a.detail, a[data-id]').first();
        const href = link.attr('href');
        
        if (!href) return;
        
        const objectId = link.attr('data-id');
        
        if (objectId && existingIds.has(objectId)) return;
        
        const fullUrl = href.startsWith('http') ? href : baseUrl + href;
        const img = item.find('img').first();
        const imageSrc = img.attr('src');
        const imageAlt = img.attr('alt');
        
        const caption = item.find('.object-caption p, .caption p');
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
        console.log(`   ⚠️  All items were duplicates`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      
      // If POST fails, try GET
      try {
        console.log(`   🔄 Trying GET request instead...`);
        
        const url = `${baseUrl}/en/artworks/search?page=${page}&tx_theme_objectlist[controller]=Object&type=686`;
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          }
        });
        
        const $ = cheerio.load(response.data);
        const items = $('.grid-item .object-gallery-item, .object-gallery-item');
        
        console.log(`   Found ${items.length} items with GET`);
        
        if (items.length > 0) {
          let newCount = 0;
          const existingIds = new Set(results.map(r => r.id));
          
          items.each((i, el) => {
            if (results.length >= 100) return false;
            
            const item = $(el);
            const link = item.find('a.detail, a[data-id]').first();
            const href = link.attr('href');
            
            if (!href) return;
            
            const objectId = link.attr('data-id');
            
            if (objectId && existingIds.has(objectId)) return;
            
            const fullUrl = href.startsWith('http') ? href : baseUrl + href;
            const img = item.find('img').first();
            const imageSrc = img.attr('src');
            const caption = item.find('.object-caption p');
            const spans = caption.find('span');
            
            const title = spans.eq(0).text().trim() || img.attr('alt') || 'Untitled';
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
            console.log(`   ✅ GET added ${newCount} new items (Total: ${results.length}/100)`);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (getError) {
        console.log(`   ❌ GET also failed: ${getError.message}`);
        break;
      }
    }
  }
  
  console.log(`\n✅ Collection complete: ${results.length} artworks\n`);
  
  // Enhance with detail pages
  console.log(`📋 Enhancing with detailed metadata...\n`);
  
  const enhanced = [];
  
  for (const [index, artwork] of results.entries()) {
    if (index >= 100) break;
    
    console.log(`[${index + 1}/100] ${artwork.title.substring(0, 50)}...`);
    
    try {
      const response = await axios.get(artwork.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract metadata
      const metadata = {};
      
      $('dt').each((i, el) => {
        const key = $(el).text().trim().toLowerCase().replace(':', '');
        const value = $(el).next('dd').text().trim();
        if (key && value) metadata[key] = value;
      });
      
      $('.field, [class*="metadata"]').each((i, el) => {
        const label = $(el).find('.label, dt').text().trim().toLowerCase();
        const value = $(el).find('.value, dd').text().trim();
        if (label && value) metadata[label] = value;
      });
      
      // Description
      let description = '';
      const descSelectors = [
        '.object-description', 
        '.description', 
        '[itemprop="description"]',
        '.detail-text',
        '.text-content p'
      ];
      
      for (const selector of descSelectors) {
        const desc = $(selector).text().trim();
        if (desc && desc.length > description.length) {
          description = desc;
        }
      }
      
      // Enhanced fields
      const medium = metadata.material || metadata.medium || metadata.technik || metadata.technique || '';
      const dimensions = metadata.dimensions || metadata.maße || metadata.size || metadata.größe || '';
      const objectType = metadata['object type'] || metadata.objekttyp || metadata.category || '';
      const inventory = metadata['inventory number'] || metadata.inventarnummer || metadata['inv. no.'] || artwork.id || '';
      const period = metadata.period || metadata.periode || metadata.epoche || '';
      const provenance = metadata.provenance || metadata.provenienz || '';
      const location = metadata.location || metadata.standort || metadata.display || '';
      
      // Get better image
      let highResImage = artwork.imageUrl;
      const imgSrc = $('.object-image img, .detail-image img, [itemprop="image"]').first().attr('src');
      if (imgSrc) {
        highResImage = imgSrc.startsWith('http') ? imgSrc : baseUrl + imgSrc;
      }
      
      const enhancedArtwork = {
        id: artwork.id,
        url: artwork.url,
        title: artwork.title,
        artist: artwork.artist || '',
        culture: artwork.culture || '',
        date: artwork.date || '',
        period: period,
        medium: medium,
        dimensions: dimensions,
        inventory: inventory,
        imageUrl: highResImage,
        classification: determineClassification(artwork.title, artwork.culture, objectType),
        objectType: objectType || determineObjectType(artwork.title),
        category: artwork.culture || objectType || '',
        isHighlight: $('.highlight, .featured').length > 0,
        description: description.substring(0, 1000),
        provenance: provenance,
        location: location,
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: index + 1
      };
      
      enhanced.push(enhancedArtwork);
      
      // Show enhancements
      const enhancements = [];
      if (medium) enhancements.push('medium');
      if (dimensions) enhancements.push('dimensions');
      if (description) enhancements.push('description');
      if (objectType) enhancements.push('type');
      
      if (enhancements.length > 0) {
        console.log(`   ✓ ${enhancements.join(', ')}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`   ⚠️  ${error.message.substring(0, 50)}`);
      
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
  
  console.log(`\n✅ Successfully saved ${enhanced.length} artworks!`);
  console.log(`📁 File: khm-test-100.json\n`);
  
  // Statistics
  const total = enhanced.length;
  console.log('📊 Final Report:');
  console.log(`   Total artworks: ${total}`);
  console.log(`   With images: ${enhanced.filter(a => a.imageUrl).length} (${Math.round(enhanced.filter(a => a.imageUrl).length/total*100)}%)`);
  console.log(`   With culture: ${enhanced.filter(a => a.culture).length} (${Math.round(enhanced.filter(a => a.culture).length/total*100)}%)`);
  console.log(`   With dates: ${enhanced.filter(a => a.date).length} (${Math.round(enhanced.filter(a => a.date).length/total*100)}%)`);
  console.log(`   With medium: ${enhanced.filter(a => a.medium).length} (${Math.round(enhanced.filter(a => a.medium).length/total*100)}%)`);
  console.log(`   With dimensions: ${enhanced.filter(a => a.dimensions).length} (${Math.round(enhanced.filter(a => a.dimensions).length/total*100)}%)`);
  console.log(`   With description: ${enhanced.filter(a => a.description).length} (${Math.round(enhanced.filter(a => a.description).length/total*100)}%)`);
  
  const classifications = {};
  enhanced.forEach(a => classifications[a.classification] = (classifications[a.classification] || 0) + 1);
  console.log(`\n🏛️  Classifications:`);
  Object.entries(classifications).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => 
    console.log(`   ${c}: ${n} (${Math.round(n/total*100)}%)`)
  );
  
  const types = {};
  enhanced.forEach(a => types[a.objectType] = (types[a.objectType] || 0) + 1);
  console.log(`\n🎨 Object Types (top 10):`);
  Object.entries(types).sort((a,b) => b[1]-a[1]).slice(0, 10).forEach(([t, n]) => 
    console.log(`   ${t}: ${n}`)
  );
  
  console.log(`\n📋 Sample (first 3):`);
  enhanced.slice(0, 3).forEach((art, i) => {
    console.log(`\n${i + 1}. ${art.title}`);
    console.log(`   Culture: ${art.culture || 'Unknown'}`);
    console.log(`   Date: ${art.date || 'N/A'}`);
    console.log(`   Type: ${art.objectType}`);
    console.log(`   Classification: ${art.classification}`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
  });
}

function determineClassification(title, culture, objectType) {
  const t = (title || '').toLowerCase();
  const c = (culture || '').toLowerCase();
  const o = (objectType || '').toLowerCase();
  
  if (t.includes('gemälde') || t.includes('painting') || o.includes('painting')) return 'Painting';
  if (t.includes('skulptur') || t.includes('statue') || t.includes('büste') || o.includes('sculpture')) return 'Sculpture';
  if (c.includes('römisch') || c.includes('griechisch') || c.includes('hellenistisch') || c.includes('ägyptisch')) return 'Antiquities';
  if (t.includes('kameo') || t.includes('gemme')) return 'Gem/Cameo';
  if (t.includes('instrument') || t.includes('violine') || t.includes('klavier') || t.includes('gambe') || t.includes('cembalo') || t.includes('gitarre')) return 'Musical Instrument';
  if (t.includes('fibel') || t.includes('medaillon') || t.includes('kapsel') || t.includes('krug')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title) {
  const t = (title || '').toLowerCase();
  const types = {
    'kameo': 'Cameo', 'gemme': 'Gem', 'statue': 'Statue', 'büste': 'Bust', 'fibel': 'Fibula',
    'violine': 'Violin', 'viola': 'Viola', 'violoncello': 'Cello', 'gambe': 'Viol',
    'cembalo': 'Harpsichord', 'klavier': 'Piano', 'flügel': 'Piano',
    'flöte': 'Flute', 'trompete': 'Trumpet', 'posaune': 'Trombone', 'klarinette': 'Clarinet',
    'gitarre': 'Guitar', 'cister': 'Cittern', 'lira': 'Lira', 'harfe': 'Harp', 'orgel': 'Organ',
    'gemälde': 'Painting', 'porträt': 'Portrait', 'landschaft': 'Landscape',
    'medaillon': 'Medallion', 'kapsel': 'Casket', 'krug': 'Jug'
  };
  
  for (const [key, type] of Object.entries(types)) {
    if (t.includes(key)) return type;
  }
  return 'Artwork';
}

scrapeKHMDirectAPI().catch(console.error);
