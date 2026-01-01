/**
 * Musée Condé (Grand Palais RMN) + Carnavalet Scraper
 * 
 * 1. Grand Palais RMN - Musée Condé Paintings Collection
 * 2. Grand Palais RMN - Musée Condé Drawings Collection  
 * 3. Carnavalet Essential Artworks (re-scrape with full resolution images)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const delay = ms => new Promise(r => setTimeout(r, ms));
const timestamp = () => new Date().toLocaleTimeString('ko-KR', { hour12: false });
const log = (prefix, msg) => console.log(`[${timestamp()}] [${prefix}] ${msg}`);

// ═══════════════════════════════════════════════════════════════
// 1. Grand Palais RMN - Musée Condé Scraper (Pagination via clicking)
// ═══════════════════════════════════════════════════════════════
async function scrapeGrandPalaisRMN(browser, collectionType) {
  const taskName = `Condé ${collectionType}`;
  log(taskName, '🏛️ Starting Grand Palais RMN scraper...');
  
  // Category IDs: 271490 = Painting, 271479 = Drawing
  const categoryId = collectionType === 'Painting' ? '271490' : '271479';
  const baseUrl = `https://images.grandpalaisrmn.fr/search-result?CS_MERGE=media%2Ccollections&SEARCHTXT1=%22conde%22&SEARCHMODE=NEW&CATEGORY[]=275846&CATEGORY[]=${categoryId}&EVENT=WEBSHOP_SEARCH`;
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const allArtworks = new Map(); // Use Map for deduplication by media number
  
  try {
    log(taskName, `📍 Navigating to: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(5000);
    
    // Accept cookies
    try {
      const acceptButton = await page.$('button:has-text("Accept all cookies")');
      if (acceptButton) {
        await acceptButton.click();
        await delay(3000);
        log(taskName, '🍪 Accepted cookies');
      }
    } catch (e) {}
    
    await delay(3000);
    
    // Get total count
    let totalCount = 0;
    try {
      const countText = await page.$eval('.count-search-results', el => el.textContent);
      const match = countText.match(/(\d+)/);
      if (match) totalCount = parseInt(match[1]);
      log(taskName, `📊 Total results: ${totalCount}`);
    } catch (e) {}
    
    // Paginate by clicking "next page" until no more
    let pageNum = 1;
    const maxPages = 30; // Safety limit
    
    while (pageNum <= maxPages) {
      log(taskName, `📄 Page ${pageNum}: Extracting items...`);
      
      // Wait for items to be visible
      await delay(2000);
      
      // Extract items from current page
      const items = await page.evaluate(() => {
        const results = [];
        const mediaItems = document.querySelectorAll('.media-item.asset-medium');
        
        mediaItems.forEach((item, index) => {
          try {
            const mediaDiv = item.querySelector('[data-medianumber]');
            const mediaNumber = mediaDiv?.getAttribute('data-medianumber') || '';
            
            const img = item.querySelector('img.medium');
            const title = img?.alt || `Artwork ${index + 1}`;
            const thumbSrc = img?.src || '';
            
            const link = item.querySelector('a[href*="/ark:/"]');
            const sourceUrl = link?.href || '';
            
            if (mediaNumber && title) {
              results.push({
                id: mediaNumber,
                title: title,
                imageUrl: thumbSrc || `https://images.grandpalaisrmn.fr/thumb.php/${mediaNumber}.jpg`,
                sourceUrl: sourceUrl
              });
            }
          } catch (e) {}
        });
        
        return results;
      });
      
      // Add new items to collection
      let newItems = 0;
      for (const item of items) {
        if (!allArtworks.has(item.id)) {
          allArtworks.set(item.id, item);
          newItems++;
        }
      }
      
      log(taskName, `   Found ${items.length} items, ${newItems} new. Total: ${allArtworks.size}`);
      
      // Check if there's a next page link
      const nextLink = await page.$('.media-item-paging-next a');
      if (!nextLink) {
        log(taskName, '   No more pages');
        break;
      }
      
      // Check if next link is visible/clickable
      const isVisible = await nextLink.isVisible();
      if (!isVisible) {
        log(taskName, '   Next link not visible, done');
        break;
      }
      
      // Click next page
      try {
        await nextLink.click();
        await delay(4000); // Wait for AJAX load
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        pageNum++;
      } catch (e) {
        log(taskName, `   Failed to navigate: ${e.message}`);
        break;
      }
      
      // Safety check - if we've got most items, stop
      if (allArtworks.size >= totalCount * 0.95) {
        log(taskName, '   Got most items, stopping');
        break;
      }
    }
    
    log(taskName, `✅ Collected ${allArtworks.size} unique artworks`);
    
  } catch (err) {
    log(taskName, `❌ Error: ${err.message}`);
    console.error(err);
  } finally {
    await context.close();
  }
  
  // Format final output
  return Array.from(allArtworks.values()).map((item, idx) => ({
    id: `conde-${collectionType.toLowerCase()}-${idx + 1}`,
    mediaNumber: item.id,
    title: item.title,
    artist: 'Unknown',
    year: null,
    medium: collectionType,
    dimensions: '',
    imageUrl: item.imageUrl,
    sourceUrl: item.sourceUrl,
    artworkType: collectionType,
    museum: 'Musée Condé, Chantilly'
  }));
}

// ═══════════════════════════════════════════════════════════════
// 2. Carnavalet Essential Artworks - Full Resolution
// ═══════════════════════════════════════════════════════════════
async function scrapeCarnavalet(browser) {
  const taskName = 'Carnavalet';
  log(taskName, '🏛️ Scraping Essential Artworks with full resolution images...');
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  const artworks = [];
  
  try {
    const url = 'https://www.carnavalet.paris.fr/en/collections/les-oeuvres-incontournables';
    log(taskName, `📍 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await delay(3000);
    
    // Load all artworks by clicking "More" button
    let clicks = 0;
    while (clicks < 30) {
      const moreButton = await page.$('.use-ajax.button.btn.btn-link, .load-more');
      if (!moreButton || !(await moreButton.isVisible())) break;
      
      await moreButton.scrollIntoViewIfNeeded();
      await moreButton.click();
      await delay(2000);
      clicks++;
      log(taskName, `   Clicked ${clicks} times...`);
    }
    
    // Extract artwork links
    const artworkLinks = await page.evaluate(() => {
      const links = [];
      const excludeTexts = ['Collections', 'The essential artworks', 'Publications', 'Visit', 'The museum', 'Exhibitions', 'Support', 'Home', 'Online collections'];
      
      document.querySelectorAll('a[href*="/collections/"]').forEach(link => {
        const text = link.innerText.trim();
        const href = link.href;
        
        if (!text || excludeTexts.some(e => text === e)) return;
        if (href.endsWith('/collections') || href.endsWith('/les-oeuvres-incontournables')) return;
        
        // Find associated image
        let image = null;
        let parent = link.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const img = parent.querySelector('img');
          if (img) {
            image = img.src;
            break;
          }
          parent = parent.parentElement;
        }
        
        if (!links.find(l => l.url === href)) {
          links.push({ text, url: href, image });
        }
      });
      
      return links;
    });
    
    log(taskName, `🔗 Found ${artworkLinks.length} artwork links`);
    
    // Scrape each artwork detail page for full resolution image
    for (let i = 0; i < artworkLinks.length; i++) {
      const link = artworkLinks[i];
      
      try {
        await page.goto(link.url, { waitUntil: 'networkidle', timeout: 30000 });
        await delay(1500);
        
        const data = await page.evaluate(() => {
          // Get title
          const h1 = document.querySelector('h1');
          const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
          const title = h1?.innerText?.trim() || ogTitle.split('|')[0].trim() || '';
          
          // Get FULL resolution image from og:image or main image
          const ogImage = document.querySelector('meta[property="og:image"]')?.content || '';
          const mainImg = document.querySelector('.work-image img, article img, .field--name-field-image img, .content img');
          let image = ogImage || mainImg?.src || '';
          
          // Remove style cropping from URL if present
          // Convert: /styles/640x360/public/file.jpg -> /files/file.jpg
          if (image.includes('/styles/')) {
            image = image.replace(/\/styles\/[^/]+\/public\//, '/');
          }
          
          // Try to get original file URL pattern
          // https://www.carnavalet.paris.fr/sites/default/files/styles/640x360/public/collectionXXX.jpg
          // -> https://www.carnavalet.paris.fr/sites/default/files/collectionXXX.jpg
          if (image.includes('/default/files/styles/')) {
            image = image.replace(/\/files\/styles\/[^/]+\/public\//, '/files/');
          }
          
          // Get artist
          let artist = 'Unknown';
          const artistEl = document.querySelector('.field--name-field-auteur, .artist-name, .author');
          if (artistEl) artist = artistEl.innerText.trim();
          
          // Get date
          let year = null;
          let date = '';
          const dateEl = document.querySelector('.field--name-field-date-creation, .date, .field--name-field-datation');
          if (dateEl) {
            date = dateEl.innerText.trim();
            const yearMatch = date.match(/(\d{4})/);
            if (yearMatch) year = parseInt(yearMatch[1]);
          }
          
          // Get medium
          let medium = '';
          const mediumEl = document.querySelector('.field--name-field-technique, .technique');
          if (mediumEl) medium = mediumEl.innerText.trim().substring(0, 200);
          
          return { title, image, artist, year, date, medium };
        });
        
        // Parse artist from title if needed
        let title = data.title;
        let artist = data.artist;
        
        if (artist === 'Unknown') {
          const parts = link.text.split(',');
          if (parts.length >= 2) {
            const lastPart = parts[parts.length - 1].trim();
            if (lastPart.match(/\(\d+[-–]\d+\)/) || lastPart.match(/^[A-Z][a-zé]+\s+[A-Z]/)) {
              artist = lastPart.replace(/\s*\(\d+[-–]?\d*\)/g, '').trim();
              title = parts.slice(0, -1).join(',').trim();
            }
          }
        }
        
        // Use fallback image if detail page didn't provide one
        let image = data.image || link.image || '';
        
        // Final cleanup of image URL to get full resolution
        if (image.includes('/styles/640x360/')) {
          // Try original file
          const originalUrl = image.replace(/\/styles\/640x360\/public\//, '/');
          image = originalUrl;
        }
        
        artworks.push({
          id: `carnavalet-${i + 1}`,
          title: title || data.title || 'Untitled',
          artist: artist !== 'Unknown' ? artist : data.artist,
          year: data.year,
          date: data.date,
          image: image,
          medium: data.medium,
          sourceUrl: link.url
        });
        
        if ((i + 1) % 10 === 0) {
          log(taskName, `   Progress: ${i + 1}/${artworkLinks.length}`);
        }
        
      } catch (err) {
        log(taskName, `   ⚠️ Failed to scrape ${link.url}: ${err.message}`);
        // Add with fallback data
        artworks.push({
          id: `carnavalet-${i + 1}`,
          title: link.text || 'Untitled',
          artist: 'Unknown',
          year: null,
          date: '',
          image: link.image || '',
          medium: '',
          sourceUrl: link.url
        });
      }
    }
    
    log(taskName, `✅ Collected ${artworks.length} artworks`);
    
  } catch (err) {
    log(taskName, `❌ Error: ${err.message}`);
    console.error(err);
  } finally {
    await context.close();
  }
  
  return artworks;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(60));
  console.log('🏛️  Musée Condé + Carnavalet Collection Scraper');
  console.log('═'.repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  
  try {
    // 1. Scrape Grand Palais RMN - Musée Condé Paintings
    console.log('\n📍 [1/3] Scraping Musée Condé Paintings...\n');
    const paintings = await scrapeGrandPalaisRMN(browser, 'Painting');
    
    if (paintings.length > 0) {
      const paintingsOutput = {
        museum: {
          name: 'Musée Condé',
          city: 'Chantilly',
          country: 'France',
          website: 'https://www.domainedechantilly.com/musee-conde/'
        },
        collection: 'Paintings',
        source: 'Grand Palais RMN',
        totalCount: paintings.length,
        scrapedAt: new Date().toISOString(),
        artworks: paintings
      };
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'musee-conde-paintings.json'),
        JSON.stringify(paintingsOutput, null, 2)
      );
      console.log(`💾 Saved ${paintings.length} paintings to musee-conde-paintings.json`);
    }
    
    await delay(3000);
    
    // 2. Scrape Grand Palais RMN - Musée Condé Drawings
    console.log('\n📍 [2/3] Scraping Musée Condé Drawings...\n');
    const drawings = await scrapeGrandPalaisRMN(browser, 'Drawing');
    
    if (drawings.length > 0) {
      const drawingsOutput = {
        museum: {
          name: 'Musée Condé',
          city: 'Chantilly',
          country: 'France',
          website: 'https://www.domainedechantilly.com/musee-conde/'
        },
        collection: 'Drawings',
        source: 'Grand Palais RMN',
        totalCount: drawings.length,
        scrapedAt: new Date().toISOString(),
        artworks: drawings
      };
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'musee-conde-drawings.json'),
        JSON.stringify(drawingsOutput, null, 2)
      );
      console.log(`💾 Saved ${drawings.length} drawings to musee-conde-drawings.json`);
    }
    
    await delay(3000);
    
    // 3. Re-scrape Carnavalet with full resolution images
    console.log('\n📍 [3/3] Re-scraping Carnavalet with full resolution images...\n');
    const carnavalet = await scrapeCarnavalet(browser);
    
    if (carnavalet.length > 0) {
      const carnavaletOutput = {
        museum: 'Musée Carnavalet - Histoire de Paris',
        museumId: 'carnavalet',
        location: 'Paris, France',
        collectionName: 'The Essential Artworks',
        scrapedAt: new Date().toISOString(),
        totalObjects: carnavalet.length,
        objects: carnavalet
      };
      
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'carnavalet-collection.json'),
        JSON.stringify(carnavaletOutput, null, 2)
      );
      console.log(`💾 Saved ${carnavalet.length} artworks to carnavalet-collection.json`);
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Summary:');
    console.log(`   • Musée Condé Paintings: ${paintings.length}`);
    console.log(`   • Musée Condé Drawings: ${drawings.length}`);
    console.log(`   • Carnavalet Essential: ${carnavalet.length}`);
    console.log('═'.repeat(60));
    
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await browser.close();
  }
}

// Run specific task if argument provided
const args = process.argv.slice(2);
if (args.includes('--carnavalet-only')) {
  (async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const carnavalet = await scrapeCarnavalet(browser);
      if (carnavalet.length > 0) {
        const output = {
          museum: 'Musée Carnavalet - Histoire de Paris',
          museumId: 'carnavalet',
          location: 'Paris, France',
          collectionName: 'The Essential Artworks',
          scrapedAt: new Date().toISOString(),
          totalObjects: carnavalet.length,
          objects: carnavalet
        };
        fs.writeFileSync(path.join(OUTPUT_DIR, 'carnavalet-collection.json'), JSON.stringify(output, null, 2));
        console.log(`💾 Saved ${carnavalet.length} artworks`);
      }
    } finally {
      await browser.close();
    }
  })();
} else if (args.includes('--conde-only')) {
  (async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const paintings = await scrapeGrandPalaisRMN(browser, 'Painting');
      const drawings = await scrapeGrandPalaisRMN(browser, 'Drawing');
      
      if (paintings.length > 0) {
        const output = {
          museum: { name: 'Musée Condé', city: 'Chantilly', country: 'France' },
          collection: 'Paintings',
          source: 'Grand Palais RMN',
          totalCount: paintings.length,
          scrapedAt: new Date().toISOString(),
          artworks: paintings
        };
        fs.writeFileSync(path.join(OUTPUT_DIR, 'musee-conde-paintings.json'), JSON.stringify(output, null, 2));
      }
      
      if (drawings.length > 0) {
        const output = {
          museum: { name: 'Musée Condé', city: 'Chantilly', country: 'France' },
          collection: 'Drawings',
          source: 'Grand Palais RMN',
          totalCount: drawings.length,
          scrapedAt: new Date().toISOString(),
          artworks: drawings
        };
        fs.writeFileSync(path.join(OUTPUT_DIR, 'musee-conde-drawings.json'), JSON.stringify(output, null, 2));
      }
      
      console.log(`💾 Saved ${paintings.length} paintings, ${drawings.length} drawings`);
    } finally {
      await browser.close();
    }
  })();
} else {
  main().catch(console.error);
}
