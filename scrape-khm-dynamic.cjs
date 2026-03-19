const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHMDynamic() {
  console.log('🎨 KHM Museum - Dynamic scraping with cHash extraction\n');
  
  const browser = await puppeteer.launch({ 
    headless: false,  // Show browser for debugging
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  try {
    console.log('📄 Loading initial page...');
    await page.goto('https://www.khm.at/en/artworks/search?tx_theme_objectlist%5Bcontroller%5D=Object&tx_theme_objectlist%5Bpage%5D=1&cHash=11277c9cb58e1eef7193f541418b1370&view=0&show=24&facet_date_begin=1562&facet_date_end=2022&facet_classification=48&facet_tags=9479', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Wait for initial content
    await page.waitForSelector('.object-gallery-item', { timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let loadMoreClicks = 0;
    const maxClicks = 5; // Try to load 5 more pages (24 items each = ~120 items total)
    
    while (loadMoreClicks < maxClicks && results.length < 100) {
      // Extract current items
      const currentItems = await page.evaluate((baseUrl) => {
        const items = [];
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
          
          items.push({
            id: objectId,
            url: href?.startsWith('http') ? href : baseUrl + href,
            title: title,
            culture: culture,
            date: date,
            imageUrl: imageSrc,
            artist: culture
          });
        });
        return items;
      }, baseUrl);
      
      console.log(`📊 Current items on page: ${currentItems.length}`);
      
      // Add new items (avoid duplicates)
      const existingIds = new Set(results.map(r => r.id));
      const newItems = currentItems.filter(item => !existingIds.has(item.id));
      results.push(...newItems);
      
      console.log(`✅ Total unique items collected: ${results.length}`);
      
      if (results.length >= 100) {
        console.log('🎯 Reached 100 items, stopping...');
        break;
      }
      
      // Check for "Load more" button and extract the next URL with cHash
      const loadMoreInfo = await page.evaluate(() => {
        const button = document.querySelector('button[hx-get]');
        if (!button) return null;
        
        const hxGet = button.getAttribute('hx-get');
        const buttonText = button.textContent.trim();
        
        return {
          url: hxGet,
          text: buttonText,
          exists: true
        };
      });
      
      if (!loadMoreInfo || !loadMoreInfo.exists) {
        console.log('❌ No "Load more" button found, stopping...');
        break;
      }
      
      console.log(`\n🔄 Found "Load more" button with URL: ${loadMoreInfo.url}`);
      console.log(`📌 Button text: "${loadMoreInfo.text}"`);
      
      // Click the button
      await page.click('button[hx-get]');
      console.log(`🖱️  Clicked "Load more" button (${loadMoreClicks + 1}/${maxClicks})`);
      
      // Wait for HTMX to load new content
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Wait for new items to appear
      try {
        await page.waitForFunction(
          (prevCount) => {
            const currentCount = document.querySelectorAll('.object-gallery-item').length;
            return currentCount > prevCount;
          },
          { timeout: 10000 },
          currentItems.length
        );
        console.log('✅ New items loaded');
      } catch (waitError) {
        console.log('⚠️  Timeout waiting for new items, checking anyway...');
      }
      
      loadMoreClicks++;
    }
    
    // Limit to 100 items
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
    
    // Save results
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`\n✅ Scraped ${enhanced.length} artworks`);
    console.log(`✅ Saved to: ${outputPath}`);
    
    // Summary
    const withImages = enhanced.filter(r => r.imageUrl).length;
    const withCulture = enhanced.filter(r => r.culture).length;
    const withDate = enhanced.filter(r => r.date).length;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${enhanced.length}`);
    console.log(`   With images: ${withImages}`);
    console.log(`   With culture: ${withCulture}`);
    console.log(`   With dates: ${withDate}`);
    
    // Show sample
    console.log(`\n📋 Sample (first 3):`);
    enhanced.slice(0, 3).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Culture: ${art.culture || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   ID: ${art.id}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (results.length > 0) {
      const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n⚠️  Saved ${results.length} partial results`);
    }
  } finally {
    await browser.close();
  }
}

scrapeKHMDynamic().catch(console.error);
