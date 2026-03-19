const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM() {
  console.log('🎨 KHM Museum - Scraping paintings with API\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // HTMX API endpoint found in the HTML
  const apiUrl = `${baseUrl}/en/artworks/search`;
  
  try {
    let page = 1;
    let hasMore = true;
    
    while (hasMore && results.length < 100) {
      console.log(`\n📄 Fetching page ${page}...`);
      
      // Build the URL with proper parameters
      let url;
      if (page === 1) {
        url = `${apiUrl}?page=${page}&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&cHash=11277c9cb58e1eef7193f541418b1370`;
      } else {
        // Use the actual "Load more" URL structure from the HTML
        url = `${apiUrl}?facet_date_begin=1562&facet_date_end=2022&listOnly=1&page=${page}&show=24&tx_theme_objectlist%5Bcontroller%5D=Object&type=686&view=0&cHash=604bcf797dee889b38ebae87ccf2e716`;
      }
      
      const response = await axios.post(
        url,
        new URLSearchParams({
          'tx_theme_objectlist[filter][facet_classification]': 'Gemälde',
          'tx_theme_objectlist[filter][facet_has_image][0]': '1'
        }),
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'HX-Request': 'true',
            'HX-Target': 'collection-grid',
            'Referer': `${baseUrl}/en/artworks/search`,
          }
        }
      );
      
      const $ = cheerio.load(response.data);
      
      // Save first page HTML for analysis
      if (page === 1) {
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/khm-api-page1.html', response.data);
        console.log('✅ Saved first page API response\n');
      }
      
      // Find grid items
      const items = $('.grid-item .object-gallery-item');
      
      console.log(`Found ${items.length} items on page ${page}`);
      
      if (items.length === 0) {
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
        
        // Get caption info
        const caption = item.find('.object-caption p');
        const spans = caption.find('span');
        
        const title = spans.eq(0).text().trim();
        const culture = spans.eq(1).find('small').text().trim();
        const date = spans.eq(2).find('small').text().trim();
        
        const artwork = {
          id: objectId,
          url: fullUrl,
          title: title || 'Untitled',
          artist: culture || '',  // Culture/period as artist
          date: date || '',
          medium: '',
          dimensions: '',
          inventory: objectId || '',
          image: imageSrc,
          imageUrl: imageSrc && imageSrc.startsWith('http') ? imageSrc : baseUrl + imageSrc,
          classification: 'Artwork',
          category: culture || '',
          isHighlight: false,
          description: '',
          page: page
        };
        
        results.push(artwork);
        console.log(`  [${results.length}] ${artwork.title.substring(0, 60)}...`);
      });
      
      // Check for pagination - look for "Load more" button
      const loadMoreBtn = $('button[hx-get*="page=' + (page + 1) + '"]');
      const hasNextPage = loadMoreBtn.length > 0;
      
      console.log(`Has more pages: ${hasNextPage}`);
      
      if (!hasNextPage || items.length === 0 || results.length >= 100) {
        hasMore = false;
      }
      
      page++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // Limit to 100
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
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${limited.length}`);
    console.log(`   With images: ${withImages}`);
    console.log(`   With artist: ${withArtist}`);
    console.log(`   With dates: ${withDate}`);
    
    // Show first 5 examples
    console.log(`\n📋 First 5 examples:`);
    limited.slice(0, 5).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Artist: ${art.artist || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
      console.log(`   URL: ${art.url}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data preview:', error.response.data?.substring(0, 500));
    }
  }
}

scrapeKHM().catch(console.error);
