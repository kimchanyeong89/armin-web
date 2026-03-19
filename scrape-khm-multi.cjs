const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHMMultiPage() {
  console.log('🎨 KHM Museum - Multi-page scraping strategy\n');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // These URLs were found to work - we'll try multiple variations
  const urls = [
    // Page 1 - works
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&tx_theme_objectlist%5Bpage%5D=1&cHash=11277c9cb58e1eef7193f541418b1370&view=0&show=24&facet_date_begin=1562&facet_date_end=2022&facet_classification=48&facet_tags=9479',
    // Try show=96 to get more items at once
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&tx_theme_objectlist%5Bpage%5D=1&cHash=11277c9cb58e1eef7193f541418b1370&view=0&show=96&facet_date_begin=1562&facet_date_end=2022&facet_classification=48&facet_tags=9479',
    // Try without facets to get more variety
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&tx_theme_objectlist%5Bpage%5D=1&view=0&show=96',
    // Try different page numbers
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&tx_theme_objectlist%5Bpage%5D=2&view=0&show=48',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&tx_theme_objectlist%5Bpage%5D=3&view=0&show=48',
  ];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    for (let urlIndex = 0; urlIndex < urls.length && results.length < 100; urlIndex++) {
      const url = urls[urlIndex];
      console.log(`\n📄 Loading URL ${urlIndex + 1}/${urls.length}...`);
      console.log(`   ${url.substring(0, 80)}...`);
      
      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        // Wait for content
        try {
          await page.waitForSelector('.object-gallery-item', { timeout: 5000 });
        } catch {
          console.log('   ⚠️  No items found, skipping...');
          continue;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Extract items
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
        
        console.log(`   ✅ Found ${items.length} items`);
        
        // Add unique items only
        const existingIds = new Set(results.map(r => r.id));
        const newItems = items.filter(item => !existingIds.has(item.id));
        results.push(...newItems);
        
        console.log(`   📊 Total unique items: ${results.length}`);
        
        // Show first new item
        if (newItems.length > 0) {
          console.log(`   📌 Sample: ${newItems[0].title.substring(0, 50)}...`);
        }
        
      } catch (pageError) {
        console.log(`   ❌ Error: ${pageError.message}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n✅ Collected ${results.length} unique artworks`);
    
    // Limit to 100
    const limited = results.slice(0, 100);
    
    // Enhance metadata
    const enhanced = limited.map((item, idx) => ({
      ...item,
      medium: '',
      dimensions: '',
      inventory: item.id || '',
      classification: 'Artwork',
      category: item.culture || '',
      isHighlight: false,
      description: '',
      source: 'Kunsthistorisches Museum Vienna',
      index: idx + 1
    }));
    
    // Save
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`\n✅ Saved ${enhanced.length} artworks to: khm-test-100.json`);
    
    // Summary
    const withImages = enhanced.filter(r => r.imageUrl).length;
    const withCulture = enhanced.filter(r => r.culture).length;
    const withDate = enhanced.filter(r => r.date).length;
    
    console.log(`\n📊 Final Summary:`);
    console.log(`   Total: ${enhanced.length}`);
    console.log(`   With images: ${withImages} (${Math.round(withImages/enhanced.length*100)}%)`);
    console.log(`   With culture: ${withCulture} (${Math.round(withCulture/enhanced.length*100)}%)`);
    console.log(`   With dates: ${withDate} (${Math.round(withDate/enhanced.length*100)}%)`);
    
    // Show distribution
    const cultures = {};
    enhanced.forEach(item => {
      const cult = item.culture || 'Unknown';
      cultures[cult] = (cultures[cult] || 0) + 1;
    });
    
    console.log(`\n📈 Culture distribution (top 5):`);
    Object.entries(cultures)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([culture, count]) => {
        console.log(`   ${culture.substring(0, 40)}: ${count}`);
      });
    
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    
    if (results.length > 0) {
      const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n⚠️  Saved ${results.length} partial results`);
    }
  } finally {
    await browser.close();
  }
}

scrapeKHMMultiPage().catch(console.error);
