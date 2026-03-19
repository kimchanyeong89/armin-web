const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHM() {
  console.log('🎨 KHM Museum - Scraping 100 artworks with Puppeteer\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to the search page
    const url = 'https://www.khm.at/en/artworks/search';
    console.log('📄 Loading page...'); 
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Wait extra time for HTMX to load content
    console.log('⏳ Waiting for content to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Wait for the grid to load
    await page.waitForSelector('.object-gallery-item', { timeout: 30000 });
    
    // Click "Load more" button multiple times to get 100 items
    let loadedCount = 0;
    while (loadedCount < 100) {
      // Count current items
      const itemCount = await page.$$eval('.grid-item .object-gallery-item', items => items.length);
      console.log(`\n📊 Currently loaded: ${itemCount} items`);
      
      if (itemCount >= 100) break;
      
      // Try to find and click "Load more" button
      const loadMoreBtn = await page.$('button[hx-get*="page="]');
      
      if (!loadMoreBtn) {
        console.log('❌ No more "Load more" button found');
        break;
      }
      
      console.log('🔄 Clicking "Load more"...');
      await loadMoreBtn.click();
      
      // Wait for new items to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      loadedCount = itemCount;
    }
    
    console.log('\n✅ Finished loading items, now extracting data...\n');
    
    // Extract all artwork data
    const artworks = await page.$$eval('.grid-item .object-gallery-item', (items, baseUrl) => {
      return items.slice(0, 100).map((item, index) => {
        const link = item.querySelector('a.detail');
        const href = link?.getAttribute('href');
        const objectId = link?.getAttribute('data-id');
        
        const img = item.querySelector('img');
        const imageSrc = img?.getAttribute('src');
        const imageAlt = img?.getAttribute('alt');
        
        const caption = item.querySelector('.object-caption p');
        const spans = caption?.querySelectorAll('span') || [];
        
        const title = spans[0]?.textContent?.trim() || imageAlt || 'Untitled';
        const culture = spans[1]?.querySelector('small')?.textContent?.trim() || '';
        const date = spans[2]?.querySelector('small')?.textContent?.trim() || '';
        
        let artist = culture;
        if (culture.toLowerCase().includes('manufacturer:')) {
          artist = culture.replace(/manufacturer:/i, '').trim();
        }
        
        return {
          id: objectId,
          url: href?.startsWith('http') ? href : baseUrl + href,
          title: title,
          artist: artist,
          culture: culture,
          date: date,
          medium: '',
          dimensions: '',
          inventory: objectId || '',
          image: imageSrc,
          imageUrl: imageSrc && imageSrc.startsWith('/') ? baseUrl + imageSrc : imageSrc,
          classification: 'Artwork',
          category: culture,
          isHighlight: false,
          description: '',
          source: 'Kunsthistorisches Museum Vienna'
        };
      });
    }, baseUrl);
    
    console.log(`✅ Extracted ${artworks.length} artworks\n`);
    
    // Save results
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(artworks, null, 2));
    
    console.log(`✅ Saved to: ${outputPath}`);
    
    // Print summary
    const withImages = artworks.filter(r => r.imageUrl).length;
    const withArtist = artworks.filter(r => r.artist).length;
    const withDate = artworks.filter(r => r.date).length;
    const withCulture = artworks.filter(r => r.culture).length;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${artworks.length}`);
    console.log(`   With images: ${withImages}`);
    console.log(`   With artist/culture: ${withArtist}`);
    console.log(`   With dates: ${withDate}`);
    console.log(`   With culture info: ${withCulture}`);
    
    // Show first 5 examples
    console.log(`\n📋 First 5 examples:`);
    artworks.slice(0, 5).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Culture: ${art.culture || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
      console.log(`   ID: ${art.id}`);
    });
    
    console.log(`\n✅ Done! Check the JSON file for all metadata.`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

scrapeKHM().catch(console.error);
