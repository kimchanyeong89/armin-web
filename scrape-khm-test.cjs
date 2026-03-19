const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM() {
  console.log('🎨 KHM Museum - Testing 100 paintings scrape\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // API endpoint for paintings with images
  const apiUrl = `${baseUrl}/en/artworks/search`;
  
  try {
    // First, get the search page to see how pagination works
    console.log('📄 Fetching search page...');
    const response = await axios.get(`${apiUrl}?fq[facet_classification]=Gemälde&fq[facet_has_image][0]=1&page=1&tx_theme_objectlist[controller]=Object&type=686`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Save the HTML for analysis
    fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/khm-search-page.html', response.data);
    console.log('✅ Saved HTML page for analysis\n');
    
    // Find artwork items
    const artworkCards = $('.object-card, .artwork-item, [data-object-id], .card, .item, article').filter((i, el) => {
      const html = $(el).html();
      return html && (html.includes('object') || html.includes('artwork') || html.includes('painting'));
    });
    
    console.log(`Found ${artworkCards.length} potential artwork cards on page\n`);
    
    // Try different selectors
    const selectors = [
      '.object-card',
      '.artwork-item',
      '.search-result-item',
      'article',
      '.card',
      '[data-object]',
      '.list-item',
      '.grid-item'
    ];
    
    let items = [];
    for (const selector of selectors) {
      const found = $(selector);
      if (found.length > 0) {
        console.log(`✓ Found ${found.length} items with selector: ${selector}`);
        items = found;
        break;
      }
    }
    
    if (items.length === 0) {
      console.log('❌ No items found. Trying to find any links to artworks...');
      
      // Look for links containing /artworks/ or /object/
      const artworkLinks = $('a[href*="/artworks/"], a[href*="/object/"], a[href*="/objekt/"]');
      console.log(`Found ${artworkLinks.length} artwork links`);
      
      // Process up to 100 links
      const limit = Math.min(100, artworkLinks.length);
      for (let i = 0; i < limit; i++) {
        const link = $(artworkLinks[i]);
        const href = link.attr('href');
        const fullUrl = href?.startsWith('http') ? href : baseUrl + href;
        
        console.log(`\n[${i + 1}/${limit}] Processing: ${fullUrl}`);
        
        try {
          const detailRes = await axios.get(fullUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
            timeout: 15000
          });
          
          const $detail = cheerio.load(detailRes.data);
          
          // Extract metadata
          const artwork = {
            url: fullUrl,
            title: $detail('h1').first().text().trim() || 
                   $detail('[property="og:title"]').attr('content') ||
                   $detail('meta[name="title"]').attr('content') ||
                   link.text().trim(),
            artist: $detail('.artist, [itemprop="creator"], .creator').first().text().trim() ||
                    $detail('meta[name="author"]').attr('content'),
            date: $detail('.date, [itemprop="dateCreated"], .creation-date').first().text().trim(),
            medium: $detail('.medium, [itemprop="artMedium"], .technique').first().text().trim(),
            dimensions: $detail('.dimensions, [itemprop="size"]').first().text().trim(),
            inventory: $detail('.inventory, .object-number, .accession').first().text().trim(),
            classification: 'Gemälde',
            category: $detail('.category, .classification').first().text().trim(),
            isHighlight: $detail('body').html()?.includes('highlight') || 
                        $detail('body').html()?.includes('featured') || false,
            description: $detail('[itemprop="description"], .description, .object-description').first().text().trim() ||
                        $detail('meta[name="description"]').attr('content'),
            image: $detail('img[src*="object"], img[src*="artwork"], img[src*="painting"], meta[property="og:image"]').first().attr('src') ||
                   $detail('meta[property="og:image"]').attr('content'),
            imageUrl: null,
            provenance: $detail('.provenance').first().text().trim(),
            exhibition: $detail('.exhibition').first().text().trim(),
            references: $detail('.references, .literature').first().text().trim(),
          };
          
          // Fix relative image URLs
          if (artwork.image && !artwork.image.startsWith('http')) {
            artwork.imageUrl = baseUrl + artwork.image;
          } else {
            artwork.imageUrl = artwork.image;
          }
          
          results.push(artwork);
          
          console.log(`  ✓ Title: ${artwork.title}`);
          console.log(`  ✓ Artist: ${artwork.artist || 'N/A'}`);
          console.log(`  ✓ Image: ${artwork.imageUrl ? 'Yes' : 'No'}`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (err) {
          console.log(`  ✗ Error: ${err.message}`);
        }
      }
    } else {
      // Process cards from search results
      const limit = Math.min(100, items.length);
      console.log(`\nProcessing ${limit} items...\n`);
      
      for (let i = 0; i < limit; i++) {
        const item = $(items[i]);
        const link = item.find('a').first();
        const href = link.attr('href');
        
        if (!href) continue;
        
        const fullUrl = href.startsWith('http') ? href : baseUrl + href;
        
        const artwork = {
          url: fullUrl,
          title: item.find('h3, h2, .title, .object-title').first().text().trim() ||
                 link.attr('title') || link.text().trim(),
          artist: item.find('.artist, .creator').first().text().trim(),
          date: item.find('.date').first().text().trim(),
          image: item.find('img').first().attr('src'),
          imageUrl: null,
          classification: 'Gemälde',
          category: item.find('.category').first().text().trim(),
          isHighlight: item.hasClass('highlight') || item.find('.highlight').length > 0,
        };
        
        if (artwork.image && !artwork.image.startsWith('http')) {
          artwork.imageUrl = baseUrl + artwork.image;
        } else {
          artwork.imageUrl = artwork.image;
        }
        
        results.push(artwork);
        console.log(`[${i + 1}] ${artwork.title}`);
      }
    }
    
    // Save results
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log(`\n✅ Scraped ${results.length} artworks`);
    console.log(`✅ Saved to: ${outputPath}`);
    
    // Print summary
    const withImages = results.filter(r => r.imageUrl).length;
    const withArtist = results.filter(r => r.artist).length;
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${results.length}`);
    console.log(`   With images: ${withImages}`);
    console.log(`   With artist: ${withArtist}`);
    
    // Show first 3 examples
    console.log(`\n📋 First 3 examples:`);
    results.slice(0, 3).forEach((art, i) => {
      console.log(`\n${i + 1}. ${art.title}`);
      console.log(`   Artist: ${art.artist || 'Unknown'}`);
      console.log(`   Date: ${art.date || 'N/A'}`);
      console.log(`   Image: ${art.imageUrl || 'None'}`);
      console.log(`   URL: ${art.url}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

scrapeKHM().catch(console.error);
