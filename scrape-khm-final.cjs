const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM() {
  console.log('🎨 KHM Museum - Scraping 100 artworks\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  try {
    let page = 1;
    let hasMore = true;
    
    while (hasMore && results.length < 100) {
      console.log(`\n📄 Fetching page ${page}...`);
      
      // Use GET request - simpler and more reliable
      const url = `${baseUrl}/en/artworks/search?page=${page}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 30000
      });
      
      const $ = cheerio.load(response.data);
      
      // Save first page for debugging
      if (page === 1) {
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/khm-full-page1.html', response.data);
        console.log('✅ Saved first page HTML\n');
      }
      
      // Wait for the page to be fully loaded - check for grid items
      const gridItems = $('.grid-item');
      console.log(`Found ${gridItems.length} grid items total`);
      
      // Find object cards - they may load dynamically
      let items = $('.grid-item .object-gallery-item');
      
      console.log(`Found ${items.length} artwork items on page ${page}`);
      
      if (items.length === 0) {
        console.log('❌ No items found, stopping.');
        hasMore = false;
        break;
      }
      
      // Process each item
      items.each((i, el) => {
        if (results.length >= 100) return false;
        
        const item = $(el);
        const link = item.find('a.detail').first();
        const href = link.attr('href');
        
        if (!href) return;
        
        const fullUrl = href.startsWith('http') ? href : baseUrl + href;
        const objectId = link.attr('data-id');
        
        // Get image
        const img = item.find('img').first();
        const imageSrc = img.attr('src');
        const imageAlt = img.attr('alt');
        
        // Get caption info
        const caption = item.find('.object-caption p');
        const spans = caption.find('span');
        
        const title = spans.eq(0).text().trim() || imageAlt || 'Untitled';
        const culture = spans.eq(1).find('small').text().trim();
        const date = spans.eq(2).find('small').text().trim();
        
        // Extract manufacturer if available
        let artist = culture;
        if (culture.toLowerCase().includes('manufacturer:')) {
          artist = culture.replace(/manufacturer:/i, '').trim();
        }
        
        const artwork = {
          id: objectId,
          url: fullUrl,
          title: title,
          artist: artist || '',
          culture: culture || '',
          date: date || '',
          medium: '',
          dimensions: '',
          inventory: objectId || '',
          image: imageSrc,
          imageUrl: imageSrc && imageSrc.startsWith('/') ? baseUrl + imageSrc : imageSrc,
          classification: 'Artwork',
          category: culture || '',
          isHighlight: false,
          description: '',
          source: 'Kunsthistorisches Museum Vienna',
          page: page
        };
        
        results.push(artwork);
        console.log(`  [${results.length}] ${artwork.title.substring(0, 60)}...`);
      });
      
      // Simple pagination check
      if (items.length < 20 || results.length >= 100) {
        hasMore = false;
      } else {
        page++;
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Limit to exactly 100
    const limited = results.slice(0, 100);
    
    // Save results
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(limited, null, 2));
    
    console.log(`\n✅ Scraped ${limited.length} artworks`);
    console.log(`✅ Saved to: ${outputPath}`);
    
    // Print summary
    const withImages = limited.filter(r => r.imageUrl).length;
    const withArtist = limited.filter(r => r.artist).length;
    const withDate = limited.filter(r => r.date).length;
    const withCulture = limited.filter(r => r.culture).length;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${limited.length}`);
    console.log(`   With images: ${withImages}`);
    console.log(`   With artist/culture: ${withArtist}`);
    console.log(`   With dates: ${withDate}`);
    console.log(`   With culture info: ${withCulture}`);
    
    // Show first 5 examples
    console.log(`\n📋 First 5 examples:`);
    limited.slice(0, 5).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Culture: ${art.culture || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
      console.log(`   ID: ${art.id}`);
      console.log(`   URL: ${art.url}`);
    });
    
    console.log(`\n✅ Done! Check the JSON file for all metadata.`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('URL:', error.config?.url);
    }
    console.log(`\n⚠️  Scraped ${results.length} items before error`);
    
    if (results.length > 0) {
      const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`✅ Saved partial results (${results.length} items) to: ${outputPath}`);
    }
  }
}

scrapeKHM().catch(console.error);
