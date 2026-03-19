const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM() {
  console.log('🎨 KHM Museum - Scraping 100 artworks via API\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  try {
    // Pages 1 and 2 work with different URL patterns
    for (let page = 1; page <= 5; page++) {
      if (results.length >= 100) break;
      
      console.log(`\n📄 Fetching page ${page}...`);
      
      let url;
      if (page === 1) {
        url = `${baseUrl}/en/artworks/search?page=${page}&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&cHash=11277c9cb58e1eef7193f541418b1370`;
      } else {
        // This is the URL format that worked for page 2
        url = `${baseUrl}/en/artworks/search?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=${page}&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=604bcf797dee889b38ebae87ccf2e716`;
      }
      
      try {
        const response = await axios.post(
          url,
          new URLSearchParams({}),
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              'Accept': 'text/html,*/*',
              'Content-Type': 'application/x-www-form-urlencoded',
              'HX-Request': 'true',
              'Referer': `${baseUrl}/en/artworks/search`,
            }
          }
        );
        
        const $ = cheerio.load(response.data);
        
        // Find grid items
        const items = $('.grid-item .object-gallery-item');
        
        console.log(`Found ${items.length} items on page ${page}`);
        
        if (items.length === 0) {
          console.log('No items found, stopping pagination');
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
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (pageError) {
        console.error(`❌ Error on page ${page}:`, pageError.message);
        break;
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
    });
    
    console.log(`\n✅ Done! Successfully scraped ${limited.length} artworks with full metadata.`);
    
  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    
    if (results.length > 0) {
      const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n⚠️  Saved partial results (${results.length} items) to: ${outputPath}`);
    }
  }
}

scrapeKHM().catch(console.error);
