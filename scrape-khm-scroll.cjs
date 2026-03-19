const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHMScroll() {
  console.log('🎨 KHM Museum - Scroll-based scraping for 100+ artworks\n');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // Start with a broad search
    console.log('📄 Loading search page...');
    await page.goto('https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    await page.waitForSelector('.object-gallery-item', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🔄 Scrolling and loading more items...\n');
    
    let previousCount = 0;
    let noChangeCount = 0;
    const maxAttempts = 20;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Count current items
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('.object-gallery-item').length;
      });
      
      console.log(`   Attempt ${attempt + 1}/${maxAttempts}: ${currentCount} items loaded`);
      
      if (currentCount >= 100) {
        console.log('   🎯 Reached 100+ items!');
        break;
      }
      
      // Check if count changed
      if (currentCount === previousCount) {
        noChangeCount++;
        if (noChangeCount >= 3) {
          console.log('   ⚠️  No new items after 3 attempts, stopping...');
          break;
        }
      } else {
        noChangeCount = 0;
      }
      previousCount = currentCount;
      
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait for potential new items to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Look for and click "load more" button if it exists
      const loadMoreClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loadMore = buttons.find(btn => 
          btn.textContent.toLowerCase().includes('more') ||
          btn.textContent.toLowerCase().includes('laden') ||
          btn.textContent.toLowerCase().includes('next') ||
          btn.hasAttribute('hx-get')
        );
        
        if (loadMore && loadMore.getAttribute('hx-get') !== '/static/cache/data/theme_static/heute_en.html') {
          loadMore.click();
          return true;
        }
        return false;
      });
      
      if (loadMoreClicked) {
        console.log('   🖱️  Clicked "Load more" button');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Also scroll back up and down to trigger lazy loading
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log('\n📊 Extracting all loaded items...');
    
    // Extract all items
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
          imageUrl: imageSrc,
          artist: culture
        });
      });
      return results;
    }, baseUrl);
    
    console.log(`✅ Extracted ${items.length} items\n`);
    
    // Remove duplicates by ID
    const uniqueMap = new Map();
    items.forEach(item => {
      if (item.id && !uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      } else if (!item.id) {
        // Items without ID - use URL as key
        uniqueMap.set(item.url, item);
      }
    });
    
    const uniqueItems = Array.from(uniqueMap.values());
    console.log(`📊 Unique items: ${uniqueItems.length}`);
    
    results.push(...uniqueItems);
    
    // If we still don't have 100, try different search pages
    if (results.length < 100) {
      console.log(`\n⚠️  Only ${results.length} items from main search.`);
      console.log('🔄 Trying additional searches...\n');
      
      const additionalSearches = [
        'https://www.khm.at/en/artworks/search?facet_date_begin=1400&facet_date_end=1600',
        'https://www.khm.at/en/artworks/search?facet_date_begin=1600&facet_date_end=1800',
        'https://www.khm.at/en/artworks/search?facet_date_begin=1800&facet_date_end=2000',
      ];
      
      for (const searchUrl of additionalSearches) {
        if (results.length >= 100) break;
        
        console.log(`📄 Loading: ${searchUrl.substring(0, 70)}...`);
        
        try {
          await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          await page.waitForSelector('.object-gallery-item', { timeout: 5000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const moreItems = await page.evaluate((baseUrl) => {
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
                title, culture, date,
                imageUrl: imageSrc,
                artist: culture
              });
            });
            return results;
          }, baseUrl);
          
          const existingIds = new Set(results.map(r => r.id));
          const newItems = moreItems.filter(item => !existingIds.has(item.id));
          
          if (newItems.length > 0) {
            results.push(...newItems);
            console.log(`   ✅ Added ${newItems.length} new items (Total: ${results.length})`);
          } else {
            console.log(`   ⚠️  No new unique items`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (err) {
          console.log(`   ❌ Error: ${err.message}`);
        }
      }
    }
    
    console.log(`\n✅ Total unique artworks collected: ${results.length}`);
    
    // Limit to 100
    const limited = results.slice(0, 100);
    
    // Enhance metadata
    const enhanced = limited.map((item, idx) => ({
      id: item.id || `khm_${idx + 1}`,
      url: item.url,
      title: item.title,
      artist: item.artist || item.culture || '',
      culture: item.culture || '',
      date: item.date || '',
      medium: '',
      dimensions: '',
      inventory: item.id || '',
      imageUrl: item.imageUrl,
      classification: determineClassification(item.url, item.culture),
      category: item.culture || 'Artwork',
      objectType: determineObjectType(item.title, item.culture),
      isHighlight: false,
      description: '',
      source: 'Kunsthistorisches Museum Vienna',
      sourceUrl: 'https://www.khm.at',
      index: idx + 1
    }));
    
    // Save
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`\n✅ Saved ${enhanced.length} artworks to: khm-test-100.json`);
    
    // Summary
    const withImages = enhanced.filter(r => r.imageUrl && r.imageUrl.includes('http')).length;
    const withCulture = enhanced.filter(r => r.culture).length;
    const withDate = enhanced.filter(r => r.date).length;
    
    console.log(`\n📊 Final Summary:`);
    console.log(`   Total: ${enhanced.length}`);
    console.log(`   With images: ${withImages} (${Math.round(withImages/enhanced.length*100)}%)`);
    console.log(`   With culture: ${withCulture} (${Math.round(withCulture/enhanced.length*100)}%)`);
    console.log(`   With dates: ${withDate} (${Math.round(withDate/enhanced.length*100)}%)`);
    
    // Classifications
    const classes = {};
    enhanced.forEach(item => {
      classes[item.classification] = (classes[item.classification] || 0) + 1;
    });
    
    console.log(`\n🏛️  Classifications:`);
    Object.entries(classes).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
      console.log(`   ${c}: ${n}`);
    });
    
    // Object types
    const types = {};
    enhanced.forEach(item => {
      types[item.objectType] = (types[item.objectType] || 0) + 1;
    });
    
    console.log(`\n🎨 Object Types (top 5):`);
    Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([t, n]) => {
      console.log(`   ${t}: ${n}`);
    });
    
    console.log(`\n📋 First 3 examples:`);
    enhanced.slice(0, 3).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Culture: ${art.culture || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   Type: ${art.objectType}`);
      console.log(`   Classification: ${art.classification}`);
      console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
    });
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (results.length > 0) {
      const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n⚠️  Saved ${results.length} partial results`);
    }
  } finally {
    await browser.close();
  }
}

function determineClassification(url, culture) {
  if (!url) return 'Artwork';
  
  const urlLower = url.toLowerCase();
  const cultureLower = (culture || '').toLowerCase();
  
  if (urlLower.includes('paintings') || cultureLower.includes('painting') || cultureLower.includes('gemälde')) return 'Painting';
  if (urlLower.includes('sculptures') || cultureLower.includes('skulptur') || cultureLower.includes('statue')) return 'Sculpture';
  if (urlLower.includes('decorative') || cultureLower.includes('kunstkammer')) return 'Decorative Arts';
  if (urlLower.includes('musical') || cultureLower.includes('instrument')) return 'Musical Instrument';
  if (cultureLower.includes('römisch') || cultureLower.includes('griechisch') || cultureLower.includes('hellenistisch')) return 'Antiquities';
  if (cultureLower.includes('kameo') || cultureLower.includes('gemme')) return 'Gem/Cameo';
  
  return 'Artwork';
}

function determineObjectType(title, culture) {
  const titleLower = (title || '').toLowerCase();
  const cultureLower = (culture || '').toLowerCase();
  
  if (titleLower.includes('kameo') || titleLower.includes('cameo')) return 'Cameo';
  if (titleLower.includes('gemme') || titleLower.includes('gem')) return 'Gem';
  if (titleLower.includes('statue') || titleLower.includes('statuette')) return 'Statue';
  if (titleLower.includes('fibel') || titleLower.includes('fibula')) return 'Fibula';
  if (titleLower.includes('sieb') || titleLower.includes('sieve')) return 'Vessel';
  if (titleLower.includes('instrument') || cultureLower.includes('instrument')) return 'Musical Instrument';
  if (titleLower.includes('gambe') || titleLower.includes('violine') || titleLower.includes('violin')) return 'String Instrument';
  if (titleLower.includes('flöte') || titleLower.includes('flute') || titleLower.includes('horn')) return 'Wind Instrument';
  if (titleLower.includes('cembalo') || titleLower.includes('klavier') || titleLower.includes('spinett')) return 'Keyboard Instrument';
  if (titleLower.includes('trompete') || titleLower.includes('trumpet') || titleLower.includes('posaune')) return 'Brass Instrument';
  
  return 'Artwork';
}

scrapeKHMScroll().catch(console.error);
