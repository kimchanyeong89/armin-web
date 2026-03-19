const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHMComplete() {
  console.log('🎨 KHM Museum - Complete scraping (100 artworks)\n');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // Different search strategies to get 100+ items
  const searches = [
    // Paintings with images
    {
      url: 'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=48&facet_tags=9479',
      name: 'Paintings with images'
    },
    // Sculptures  
    {
      url: 'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=52',
      name: 'Sculptures'
    },
    // Decorative arts
    {
      url: 'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=49',
      name: 'Decorative arts'
    },
    // Musical instruments
    {
      url: 'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=51',
      name: 'Musical instruments'
    },
    // Antiquities
    {
      url: 'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=50',
      name: 'Antiquities'
    },
    // All artworks (no filter)
    {
      url: 'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object',
      name: 'All artworks'
    },
  ];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    for (const search of searches) {
      if (results.length >= 100) {
        console.log('\n🎯 Reached 100 items, stopping...');
        break;
      }
      
      console.log(`\n📂 Searching: ${search.name}`);
      console.log(`   URL: ${search.url.substring(0, 70)}...`);
      
      try {
        await page.goto(search.url, {
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
        
        // Extract all visible items
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
        
        console.log(`   ✅ Found ${items.length} items on page`);
        
        // Add unique items only
        const existingIds = new Set(results.map(r => r.id));
        const newItems = items.filter(item => !existingIds.has(item.id));
        
        if (newItems.length > 0) {
          results.push(...newItems);
          console.log(`   ➕ Added ${newItems.length} new unique items`);
          console.log(`   📊 Total collected: ${results.length}/100`);
          console.log(`   📌 Sample: ${newItems[0].title.substring(0, 45)}...`);
        } else {
          console.log(`   ⚠️  All items were duplicates`);
        }
        
      } catch (pageError) {
        console.log(`   ❌ Error: ${pageError.message}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log(`\n\n📊 Scraping complete!`);
    console.log(`✅ Collected ${results.length} unique artworks`);
    
    // If we don't have 100, try to get detail pages for missing metadata
    if (results.length < 100) {
      console.log(`\n⚠️  Only ${results.length} items found.`);
      console.log(`Continuing with available items...`);
    }
    
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
      isHighlight: false,
      description: '',
      source: 'Kunsthistorisches Museum Vienna',
      index: idx + 1
    }));
    
    // Save
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`\n✅ Saved ${enhanced.length} artworks to: khm-test-100.json`);
    console.log(`📁 Location: /downloads/khm-test-100.json`);
    
    // Detailed summary
    const withImages = enhanced.filter(r => r.imageUrl && r.imageUrl.includes('http')).length;
    const withCulture = enhanced.filter(r => r.culture).length;
    const withDate = enhanced.filter(r => r.date).length;
    const withArtist = enhanced.filter(r => r.artist).length;
    
    console.log(`\n📊 Data Quality Summary:`);
    console.log(`   Total artworks: ${enhanced.length}`);
    console.log(`   With images: ${withImages} (${Math.round(withImages/enhanced.length*100)}%)`);
    console.log(`   With culture: ${withCulture} (${Math.round(withCulture/enhanced.length*100)}%)`);
    console.log(`   With dates: ${withDate} (${Math.round(withDate/enhanced.length*100)}%)`);
    console.log(`   With artist: ${withArtist} (${Math.round(withArtist/enhanced.length*100)}%)`);
    
    // Classification breakdown
    const classifications = {};
    enhanced.forEach(item => {
      const cls = item.classification;
      classifications[cls] = (classifications[cls] || 0) + 1;
    });
    
    console.log(`\n🏛️  Classification breakdown:`);
    Object.entries(classifications)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cls, count]) => {
        console.log(`   ${cls}: ${count}`);
      });
    
    // Sample entries
    console.log(`\n📋 Sample entries (first 5):`);
    enhanced.slice(0, 5).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Artist/Culture: ${art.culture || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   Classification: ${art.classification}`);
      console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
      console.log(`   ID: ${art.id}`);
    });
    
    console.log(`\n✅ Scraping complete! All data saved successfully.`);
    
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    
    if (results.length > 0) {
      const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
      const partial = results.map((item, idx) => ({
        ...item,
        index: idx + 1,
        classification: 'Artwork',
        isHighlight: false
      }));
      fs.writeFileSync(outputPath, JSON.stringify(partial, null, 2));
      console.log(`\n⚠️  Saved ${partial.length} partial results to khm-test-100.json`);
    }
  } finally {
    await browser.close();
  }
}

function determineClassification(url, culture) {
  if (!url) return 'Artwork';
  
  const urlLower = url.toLowerCase();
  const cultureLower = (culture || '').toLowerCase();
  
  if (urlLower.includes('paintings') || cultureLower.includes('painting')) return 'Painting';
  if (urlLower.includes('sculptures') || cultureLower.includes('skulptur')) return 'Sculpture';
  if (urlLower.includes('decorative') || cultureLower.includes('kunstkammer')) return 'Decorative Arts';
  if (urlLower.includes('musical') || cultureLower.includes('instrument')) return 'Musical Instrument';
  if (urlLower.includes('antiquities') || cultureLower.includes('römisch') || cultureLower.includes('griechisch')) return 'Antiquities';
  if (cultureLower.includes('kameo') || cultureLower.includes('gemme')) return 'Gem/Cameo';
  
  return 'Artwork';
}

scrapeKHMComplete().catch(console.error);
