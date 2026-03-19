const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM100WithImages() {
  console.log('🎨 KHM Museum - 100 Artworks with Complete Images\n');
  
  const baseUrl = 'https://www.khm.at';
  const allArtworks = [];
  const seenIds = new Set();
  const seenImages = new Set();
  
  // Working API URLs (pages 1-2 verified)
  const apiUrls = [
    `${baseUrl}/en/artworks/search?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=1&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=11277c9cb58e1eef7193f541418b1370`,
    `${baseUrl}/en/artworks/search?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=2&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=604bcf797dee889b38ebae87ccf2e716`,
  ];
  
  console.log('📥 Step 1: Collecting from API (pages 1-2)...\n');
  
  // Collect from API first
  for (const url of apiUrls) {
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
      
      items.each((i, el) => {
        const item = $(el);
        const link = item.find('a.detail').first();
        const objectId = link.attr('data-id');
        
        if (!objectId || seenIds.has(objectId)) return;
        
        const href = link.attr('href');
        const fullUrl = href?.startsWith('http') ? href : baseUrl + href;
        const img = item.find('img').first();
        const caption = item.find('.object-caption p');
        const spans = caption.find('span');
        
        const title = spans.eq(0).text().trim() || img.attr('alt') || 'Untitled';
        const culture = spans.eq(1).find('small').text().trim();
        const date = spans.eq(2).find('small').text().trim();
        const imageSrc = img.attr('src');
        const imageUrl = imageSrc?.startsWith('/') ? baseUrl + imageSrc : imageSrc;
        
        if (imageUrl && !seenImages.has(imageUrl)) {
          allArtworks.push({
            id: objectId,
            url: fullUrl,
            title: title,
            artist: culture,
            culture: culture,
            date: date,
            imageUrl: imageUrl,
            classification: 'Artwork',
            category: culture,
            isHighlight: false
          });
          
          seenIds.add(objectId);
          seenImages.add(imageUrl);
          console.log(`   ✓ [${allArtworks.length}] ${title.substring(0, 50)}...`);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Collected ${allArtworks.length} artworks from API\n`);
  
  // Step 2: Expand via sequential ID discovery
  console.log('📥 Step 2: Sequential ID discovery for remaining artworks...\n');
  
  const existingIds = allArtworks.map(a => parseInt(a.id)).filter(id => !isNaN(id));
  const minId = Math.min(...existingIds);
  const maxId = Math.max(...existingIds);
  
  console.log(`   ID range: ${minId} - ${maxId}`);
  console.log(`   Searching for more artworks...\n`);
  
  // Search in ranges above and below existing IDs
  const searchRanges = [
    { start: maxId + 1, end: maxId + 100, desc: 'above max ID' },
    { start: minId - 100, end: minId - 1, desc: 'below min ID' }
  ];
  
  for (const range of searchRanges) {
    if (allArtworks.length >= 100) break;
    
    console.log(`   Searching ${range.desc} (${range.start}-${range.end})...`);
    
    for (let id = range.start; id <= range.end; id++) {
      if (allArtworks.length >= 100) break;
      if (seenIds.has(id.toString())) continue;
      
      try {
        const detailUrl = `${baseUrl}/en/object/${id}/`;
        const response = await axios.get(detailUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 5000,
          validateStatus: (status) => status === 200
        });
        
        const $ = cheerio.load(response.data);
        
        // Extract title
        const title = $('h1').first().text().trim() || 
                     $('.object-title').text().trim() ||
                     $('[itemprop="name"]').text().trim();
        
        if (!title || title.length < 2) continue;
        
        // Extract image
        let imageUrl = '';
        const imgSelectors = [
          '.object-image img',
          '[itemprop="image"]',
          '.detail-image img',
          'img[src*="typo3temp"]',
          'img[src*="fileadmin"]'
        ];
        
        for (const sel of imgSelectors) {
          const imgEl = $(sel).first();
          const src = imgEl.attr('src') || imgEl.attr('data-src');
          if (src && src.length > 10) {
            imageUrl = src.startsWith('http') ? src : baseUrl + src;
            break;
          }
        }
        
        // Skip if no image found
        if (!imageUrl || seenImages.has(imageUrl)) continue;
        
        // Extract metadata
        const meta = {};
        $('dt').each((idx, el) => {
          const key = $(el).text().trim().toLowerCase().replace(/[:]/g, '');
          const value = $(el).next('dd').text().trim();
          if (key && value) meta[key] = value;
        });
        
        const culture = meta.kultur || meta.culture || meta.künstler || meta.artist || '';
        const date = meta.datierung || meta.date || '';
        
        allArtworks.push({
          id: id.toString(),
          url: detailUrl,
          title: title,
          artist: culture,
          culture: culture,
          date: date,
          imageUrl: imageUrl,
          classification: determineClassification(title, culture),
          category: culture,
          isHighlight: false,
          medium: meta.material || meta.medium || meta.technik || '',
          dimensions: meta.maße || meta.dimensions || '',
          objectType: meta.objekttyp || determineObjectType(title)
        });
        
        seenIds.add(id.toString());
        seenImages.add(imageUrl);
        
        console.log(`   ✓ ID ${id}: ${title.substring(0, 40)}... (${allArtworks.length}/100)`);
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        // Skip 404s and other errors silently
      }
    }
  }
  
  console.log(`\n✅ Total collected: ${allArtworks.length} artworks\n`);
  
  // Step 3: Enhance all artworks with complete metadata from detail pages
  if (allArtworks.length < 100) {
    console.log('⚠️  Warning: Only found', allArtworks.length, 'artworks. Continuing with enhancement...\n');
  }
  
  console.log('📋 Step 3: Enhancing all artworks with complete metadata...\n');
  
  const enhanced = [];
  
  for (let i = 0; i < allArtworks.length; i++) {
    const artwork = allArtworks[i];
    console.log(`[${i + 1}/${allArtworks.length}] ${artwork.title.substring(0, 50)}...`);
    
    try {
      const response = await axios.get(artwork.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract all metadata
      const meta = {};
      $('dt').each((idx, el) => {
        const key = $(el).text().trim().toLowerCase().replace(/[:]/g, '');
        const value = $(el).next('dd').text().trim();
        if (key && value) meta[key] = value;
      });
      
      // Extract description
      let description = '';
      const descSelectors = [
        '.object-description',
        '[itemprop="description"]',
        '.description',
        '.detail-text',
        '.object-text'
      ];
      
      for (const sel of descSelectors) {
        const text = $(sel).text().trim();
        if (text && text.length > description.length) {
          description = text;
        }
      }
      
      // Verify or update image
      let finalImage = artwork.imageUrl;
      const imgSelectors = [
        '.object-image img',
        '[itemprop="image"]',
        '.detail-image img',
        'img[src*="typo3temp"]'
      ];
      
      for (const sel of imgSelectors) {
        const imgEl = $(sel).first();
        const src = imgEl.attr('src') || imgEl.attr('data-src');
        if (src && src.length > 10) {
          finalImage = src.startsWith('http') ? src : baseUrl + src;
          break;
        }
      }
      
      enhanced.push({
        id: artwork.id,
        url: artwork.url,
        title: artwork.title,
        artist: artwork.artist || meta.künstler || meta.artist || '',
        culture: artwork.culture || meta.kultur || meta.culture || '',
        date: artwork.date || meta.datierung || meta.date || '',
        period: meta.periode || meta.period || '',
        medium: meta.material || meta.medium || meta.technik || artwork.medium || '',
        dimensions: meta.maße || meta.dimensions || meta.size || artwork.dimensions || '',
        inventory: meta.inventarnummer || meta['inventory number'] || artwork.id,
        imageUrl: finalImage,
        classification: artwork.classification,
        objectType: artwork.objectType || meta.objekttyp || determineObjectType(artwork.title),
        category: artwork.category,
        isHighlight: false,
        description: description.substring(0, 1500),
        provenance: meta.provenienz || meta.provenance || '',
        location: meta.standort || meta.location || '',
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: i + 1
      });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      // If enhancement fails, keep original data
      enhanced.push({
        ...artwork,
        index: i + 1,
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl
      });
    }
  }
  
  // Final validation: ensure all have images
  const finalDataset = enhanced.filter(art => art.imageUrl && art.imageUrl.length > 10);
  
  console.log('\n════════════════════════════════════════════════════\n');
  console.log(`✅ FINAL DATASET: ${finalDataset.length} artworks\n`);
  console.log('📊 Data Quality Check:\n');
  
  const withImages = finalDataset.filter(a => a.imageUrl).length;
  const withCulture = finalDataset.filter(a => a.culture).length;
  const withDates = finalDataset.filter(a => a.date).length;
  const withMedium = finalDataset.filter(a => a.medium).length;
  const withDimensions = finalDataset.filter(a => a.dimensions).length;
  const withDescription = finalDataset.filter(a => a.description).length;
  
  console.log(`   Images:        ${withImages}/${finalDataset.length} (${Math.round(withImages/finalDataset.length*100)}%)`);
  console.log(`   Culture:       ${withCulture}/${finalDataset.length} (${Math.round(withCulture/finalDataset.length*100)}%)`);
  console.log(`   Dates:         ${withDates}/${finalDataset.length} (${Math.round(withDates/finalDataset.length*100)}%)`);
  console.log(`   Medium:        ${withMedium}/${finalDataset.length} (${Math.round(withMedium/finalDataset.length*100)}%)`);
  console.log(`   Dimensions:    ${withDimensions}/${finalDataset.length} (${Math.round(withDimensions/finalDataset.length*100)}%)`);
  console.log(`   Descriptions:  ${withDescription}/${finalDataset.length} (${Math.round(withDescription/finalDataset.length*100)}%)`);
  
  // Check for duplicates
  const uniqueIds = new Set(finalDataset.map(a => a.id));
  const uniqueImages = new Set(finalDataset.map(a => a.imageUrl));
  
  console.log(`\n✓ Unique IDs: ${uniqueIds.size}`);
  console.log(`✓ Unique Images: ${uniqueImages.size}`);
  console.log(`✓ No duplicates: ${uniqueIds.size === finalDataset.length && uniqueImages.size === finalDataset.length ? 'YES' : 'NO'}`);
  
  // Save to file
  const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  fs.writeFileSync(outputPath, JSON.stringify(finalDataset, null, 2), 'utf8');
  
  console.log(`\n📁 Saved to: ${outputPath}`);
  console.log('\n════════════════════════════════════════════════════\n');
  
  // Show sample entries
  console.log('📋 Sample Entries:\n');
  finalDataset.slice(0, 5).forEach((art, idx) => {
    console.log(`${idx + 1}. ${art.title}`);
    console.log(`   Culture: ${art.culture}`);
    console.log(`   Date: ${art.date}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log('');
  });
  
  console.log('✅ SUCCESS!\n');
}

function determineClassification(title, culture) {
  const t = (title + ' ' + culture).toLowerCase();
  
  if (t.match(/statue|figur|skulptur|torso|büste|bust|head|kopf/)) return 'Sculpture';
  if (t.match(/relief|friese|fries|stele/)) return 'Relief';
  if (t.match(/sarkophag|urne|urn|sarcophagus/)) return 'Funerary Art';
  if (t.match(/vase|bowl|cup|dish|tazza|pokal|becher/)) return 'Decorative Arts';
  if (t.match(/griechisch|römisch|etruskisch|greek|roman|etruscan/)) return 'Antiquities';
  
  return 'Artwork';
}

function determineObjectType(title) {
  const t = title.toLowerCase();
  
  if (t.includes('relief')) return 'Relief';
  if (t.includes('statue') || t.includes('statuary')) return 'Statue';
  if (t.includes('bust') || t.includes('büste')) return 'Bust';
  if (t.includes('head') || t.includes('kopf')) return 'Head';
  if (t.includes('stele') || t.includes('stela')) return 'Stele';
  if (t.includes('sarkophag') || t.includes('sarcophagus')) return 'Sarcophagus';
  if (t.includes('urne') || t.includes('urn')) return 'Urn';
  if (t.includes('vase')) return 'Vase';
  if (t.includes('bowl') || t.includes('schale')) return 'Bowl';
  if (t.includes('cup') || t.includes('becher')) return 'Cup';
  if (t.includes('pokal')) return 'Goblet';
  
  return 'Artwork';
}

scrapeKHM100WithImages().catch(console.error);
