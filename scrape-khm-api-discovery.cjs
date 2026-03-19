const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHMWithAPI() {
  console.log('🎨 KHM Museum - API Discovery and Complete Scraping\n');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Intercept network requests to find API calls
    const apiCalls = [];
    
    page.on('response', async (response) => {
      const url = response.url();
      const type = response.request().resourceType();
      
      // Look for JSON or HTML API responses
      if (url.includes('/artworks/') || url.includes('/search') || url.includes('/object')) {
        if (type === 'xhr' || type === 'fetch' || url.includes('type=686')) {
          try {
            apiCalls.push({
              url: url,
              status: response.status(),
              type: type
            });
          } catch (e) {
            // Ignore
          }
        }
      }
    });
    
    console.log('🔍 Loading page and intercepting API calls...\n');
    
    await page.goto('https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.object-gallery-item', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to click "show more" or change items per page
    console.log('🔄 Attempting to load more items...\n');
    
    // Try clicking show more button
    const showMoreClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        if (text.includes('show') && (text.includes('more') || text.includes('all') || text.includes('96') || text.includes('48'))) {
          btn.click();
          return true;
        }
      }
      // Try to find pagination links
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        if (link.textContent.match(/\d+/) && link.href.includes('show=')) {
          link.click();
          return true;
        }
      }
      return false;
    });
    
    if (showMoreClicked) {
      console.log('   ✓ Clicked show more/pagination');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`\n📡 Intercepted ${apiCalls.length} API calls:\n`);
    apiCalls.forEach((call, i) => {
      console.log(`   ${i + 1}. ${call.url.substring(0, 100)}...`);
      console.log(`      Status: ${call.status}, Type: ${call.type}`);
    });
    
    // Extract current items
    const items = await page.evaluate((baseUrl) => {
      const results = [];
      document.querySelectorAll('.grid-item .object-gallery-item').forEach(el => {
        const link = el.querySelector('a.detail');
        if (!link) return;
        
        const href = link.getAttribute('href');
        const objectId = link.getAttribute('data-id');
        const img = el.querySelector('img');
        const caption = el.querySelector('.object-caption p');
        const spans = caption?.querySelectorAll('span') || [];
        
        const title = spans[0]?.textContent?.trim() || img?.alt || 'Untitled';
        const culture = spans[1]?.querySelector('small')?.textContent?.trim() || '';
        const date = spans[2]?.querySelector('small')?.textContent?.trim() || '';
        const imageSrc = img?.src || '';
        
        results.push({
          id: objectId,
          url: href?.startsWith('http') ? href : baseUrl + href,
          title: title,
          culture: culture,
          date: date,
          imageUrl: imageSrc
        });
      });
      return results;
    }, baseUrl);
    
    console.log(`\n✅ Collected ${items.length} items from initial page\n`);
    results.push(...items);
    
    await browser.close();
    
    // Now try different API approaches
    console.log('🔄 Trying direct API calls with different parameters...\n');
    
    // Try POST requests with pagination
    const postUrls = [
      { page: 1, show: 96 },
      { page: 2, show: 96 },
      { page: 3, show: 48 },
      { page: 4, show: 48 },
    ];
    
    for (const params of postUrls) {
      if (results.length >= 100) break;
      
      console.log(`📄 Trying page ${params.page} with show=${params.show}...`);
      
      try {
        // Try with different URL patterns found
        const url = `${baseUrl}/en/artworks/search?tx_theme_objectlist[controller]=Object&page=${params.page}&show=${params.show}`;
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        const pageItems = $('.grid-item .object-gallery-item');
        
        console.log(`   Found ${pageItems.length} items`);
        
        if (pageItems.length === 0) continue;
        
        let newCount = 0;
        const existingIds = new Set(results.map(r => r.id));
        
        pageItems.each((i, el) => {
          const item = $(el);
          const link = item.find('a.detail').first();
          const objectId = link.attr('data-id');
          
          if (objectId && existingIds.has(objectId)) return;
          
          const href = link.attr('href');
          const fullUrl = href?.startsWith('http') ? href : baseUrl + href;
          
          const img = item.find('img').first();
          const imageSrc = img.attr('src');
          const caption = item.find('.object-caption p');
          const spans = caption.find('span');
          
          const title = spans.eq(0).text().trim() || img.attr('alt') || 'Untitled';
          const culture = spans.eq(1).find('small').text().trim();
          const date = spans.eq(2).find('small').text().trim();
          
          results.push({
            id: objectId,
            url: fullUrl,
            title: title,
            culture: culture,
            date: date,
            imageUrl: imageSrc?.startsWith('/') ? baseUrl + imageSrc : imageSrc
          });
          
          newCount++;
        });
        
        if (newCount > 0) {
          console.log(`   ✅ Added ${newCount} new items (Total: ${results.length})`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Collection complete: ${results.length} unique artworks\n`);
    
    // If still not enough, scrape from different starting points
    if (results.length < 100) {
      console.log(`⚠️  Need ${100 - results.length} more items. Trying alternative approach...\n`);
      console.log('📂 Scraping from museum collection pages directly...\n');
      
      // Try browsing different collection pages
      const collectionUrls = [
        '/en/visit/collections/kunstkammer-wien/',
        '/en/visit/collections/antiquities/',
        '/en/visit/collections/picture-gallery/',
        '/en/visit/collections/egyptian-and-near-eastern-collection/',
      ];
      
      for (const collUrl of collectionUrls) {
        if (results.length >= 100) break;
        
        try {
          console.log(`📄 Trying collection page: ${collUrl}`);
          const response = await axios.get(baseUrl + collUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
          });
          
          const $ = cheerio.load(response.data);
          
          // Look for artwork links
          const artworkLinks = $('a[href*="/artworks/"]');
          console.log(`   Found ${artworkLinks.length} artwork links`);
          
          const existingIds = new Set(results.map(r => r.id));
          let added = 0;
          
          artworkLinks.each((i, el) => {
            if (results.length >= 100) return false;
            
            const href = $(el).attr('href');
            if (!href || !href.includes('/artworks/')) return;
            
            const fullUrl = href.startsWith('http') ? href : baseUrl + href;
            const urlParts = fullUrl.split('/');
            const slug = urlParts[urlParts.length - 1];
            const idMatch = slug.match(/(\d+)/);
            const objectId = idMatch ? idMatch[1] : null;
            
            if (objectId && existingIds.has(objectId)) return;
            
            const title = $(el).text().trim() || $(el).find('img').attr('alt') || 'Untitled';
            const img = $(el).find('img').first();
            const imageSrc = img.attr('src');
            
            if (title && title.length > 3) {
              results.push({
                id: objectId || `khm_${results.length + 1}`,
                url: fullUrl,
                title: title,
                culture: '',
                date: '',
                imageUrl: imageSrc?.startsWith('/') ? baseUrl + imageSrc : imageSrc || ''
              });
              added++;
              existingIds.add(objectId);
            }
          });
          
          if (added > 0) {
            console.log(`   ✅ Added ${added} items (Total: ${results.length})`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 800));
          
        } catch (error) {
          console.log(`   ❌ Error: ${error.message}`);
        }
      }
    }
    
    // Limit to 100
    const limited = results.slice(0, 100);
    
    console.log(`\n📋 Phase 2: Enhancing ${limited.length} artworks with detail page metadata...\n`);
    
    const enhanced = [];
    
    for (const [index, artwork] of limited.entries()) {
      console.log(`[${index + 1}/${limited.length}] ${artwork.title.substring(0, 50)}...`);
      
      try {
        const response = await axios.get(artwork.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          },
          timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        // Extract all available metadata
        const metadata = {};
        
        // Method 1: dt/dd pairs
        $('dt').each((i, el) => {
          const key = $(el).text().trim().toLowerCase().replace(':', '');
          const value = $(el).next('dd').text().trim();
          if (key && value) metadata[key] = value;
        });
        
        // Method 2: Specific fields
        $('.object-data .field, .metadata .field, [class*="field"]').each((i, el) => {
          const label = $(el).find('.label, .field-label, dt').text().trim().toLowerCase();
          const value = $(el).find('.value, .field-value, dd').text().trim();
          if (label && value) metadata[label] = value;
        });
        
        // Description
        let description = '';
        const descSelectors = ['.object-description', '.description', '[itemprop="description"]', '.text p'];
        for (const sel of descSelectors) {
          const desc = $(sel).text().trim();
          if (desc && desc.length > description.length) description = desc;
        }
        
        // Image
        let highResImage = artwork.imageUrl;
        const imgSrc = $('[itemprop="image"], .object-image img, .detail-image img').first().attr('src');
        if (imgSrc) {
          highResImage = imgSrc.startsWith('http') ? imgSrc : baseUrl + imgSrc;
        }
        
        // Build enhanced object
        const enhancedArtwork = {
          id: artwork.id || `khm_${index + 1}`,
          url: artwork.url,
          title: artwork.title,
          artist: artwork.culture || metadata.artist || metadata.künstler || '',
          culture: artwork.culture || metadata.culture || metadata.kultur || '',
          date: artwork.date || metadata.date || metadata.datierung || '',
          period: metadata.period || metadata.periode || '',
          medium: metadata.material || metadata.medium || metadata.technique || '',
          dimensions: metadata.dimensions || metadata.maße || metadata.size || '',
          inventory: metadata['inventory number'] || metadata.inventarnummer || artwork.id || '',
          imageUrl: highResImage,
          classification: determineClassification(artwork.title, artwork.culture, metadata.category || ''),
          objectType: metadata.objecttype || metadata.objekttyp || determineObjectType(artwork.title),
          category: artwork.culture || metadata.category || '',
          isHighlight: $('.highlight, .featured').length > 0,
          description: description.substring(0, 1000),
          provenance: metadata.provenance || metadata.provenienz || '',
          creditLine: metadata.credit || '',
          location: metadata.location || metadata.standort || '',
          source: 'Kunsthistorisches Museum Vienna',
          sourceUrl: baseUrl,
          index: index + 1
        };
        
        enhanced.push(enhancedArtwork);
        
        const enhancements = [];
        if (enhancedArtwork.medium) enhancements.push('medium');
        if (enhancedArtwork.dimensions) enhancements.push('dimensions');
        if (enhancedArtwork.description) enhancements.push('description');
        if (enhancements.length) console.log(`   ✓ ${enhancements.join(', ')}`);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`   ⚠️  ${error.message}`);
        enhanced.push({
          ...artwork,
          id: artwork.id || `khm_${index + 1}`,
          medium: '', dimensions: '', description: '',
          classification: determineClassification(artwork.title, artwork.culture, ''),
          objectType: determineObjectType(artwork.title),
          category: artwork.culture || '',
          isHighlight: false,
          source: 'Kunsthistorisches Museum Vienna',
          index: index + 1
        });
      }
    }
    
    // Save
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`\n✅ Success! Saved ${enhanced.length} artworks with full metadata`);
    console.log(`📁 File: khm-test-100.json\n`);
    
    printStats(enhanced);
    
  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
  }
}

function determineClassification(title, culture, category) {
  const t = (title || '').toLowerCase();
  const c = (culture || '').toLowerCase();
  const cat = (category || '').toLowerCase();
  
  if (t.includes('gemälde') || t.includes('painting') || cat.includes('painting')) return 'Painting';
  if (t.includes('skulptur') || t.includes('statue') || t.includes('büste')) return 'Sculpture';
  if (c.includes('römisch') || c.includes('griechisch') || c.includes('hellenistisch')) return 'Antiquities';
  if (t.includes('kameo') || t.includes('gemme')) return 'Gem/Cameo';
  if (t.includes('instrument') || t.includes('violine') || t.includes('klavier') || t.includes('gambe')) return 'Musical Instrument';
  if (t.includes('fibel') || t.includes('medaillon') || t.includes('kapsel')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title) {
  const t = (title || '').toLowerCase();
  const types = {
    'kameo': 'Cameo', 'gemme': 'Gem', 'statue': 'Statue', 'fibel': 'Fibula',
    'violine': 'Violin', 'viola': 'Viola', 'cello': 'Cello', 'gambe': 'Viol',
    'cembalo': 'Harpsichord', 'klavier': 'Piano', 'flügel': 'Piano',
    'flöte': 'Flute', 'trompete': 'Trumpet', 'posaune': 'Trombone',
    'gitarre': 'Guitar', 'harfe': 'Harp', 'orgel': 'Organ',
    'gemälde': 'Painting', 'portrait': 'Portrait', 'porträt': 'Portrait'
  };
  
  for (const [key, type] of Object.entries(types)) {
    if (t.includes(key)) return type;
  }
  return 'Artwork';
}

function printStats(artworks) {
  const total = artworks.length;
  console.log('📊 Final Statistics:');
  console.log(`   Total: ${total}`);
  console.log(`   Images: ${artworks.filter(a => a.imageUrl).length} (${Math.round(artworks.filter(a => a.imageUrl).length/total*100)}%)`);
  console.log(`   Culture: ${artworks.filter(a => a.culture).length} (${Math.round(artworks.filter(a => a.culture).length/total*100)}%)`);
  console.log(`   Dates: ${artworks.filter(a => a.date).length} (${Math.round(artworks.filter(a => a.date).length/total*100)}%)`);
  console.log(`   Medium: ${artworks.filter(a => a.medium).length} (${Math.round(artworks.filter(a => a.medium).length/total*100)}%)`);
  console.log(`   Dimensions: ${artworks.filter(a => a.dimensions).length} (${Math.round(artworks.filter(a => a.dimensions).length/total*100)}%)`);
  console.log(`   Description: ${artworks.filter(a => a.description).length} (${Math.round(artworks.filter(a => a.description).length/total*100)}%)`);
  
  const classes = {};
  artworks.forEach(a => classes[a.classification] = (classes[a.classification] || 0) + 1);
  console.log(`\n🏛️  Classifications:`);
  Object.entries(classes).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => console.log(`   ${c}: ${n}`));
}

scrapeKHMWithAPI().catch(console.error);
