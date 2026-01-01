/**
 * Capture API requests for Musée de l'Armée
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Monitor POST requests to search API
  page.on('request', async request => {
    const url = request.url();
    if (url.includes('/in/rest/api/search') && request.method() === 'POST') {
      console.log('\n🔍 SEARCH API REQUEST:');
      console.log('URL:', url);
      console.log('POST Data:', request.postData());
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    
    // Capture search API response
    if (url.includes('/in/rest/api/search') && response.request().method() === 'POST') {
      try {
        const json = await response.json();
        console.log('\n📦 SEARCH API RESPONSE:');
        console.log('Total hits:', json.hits);
        console.log('Results count:', json.results?.length);
        
        if (json.results?.length > 0) {
          console.log('\n📋 First result structure:');
          console.log(JSON.stringify(json.results[0], null, 2));
          
          fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-search-response.json', 
            JSON.stringify(json, null, 2));
          console.log('\n💾 Saved search response');
        }
      } catch (e) {
        console.log('Could not parse:', e.message);
      }
    }
    
    // Also capture notice API for individual artworks
    if (url.includes('/in/rest/api/notice') && url.includes('aspect=Main')) {
      try {
        const json = await response.json();
        console.log('\n📦 NOTICE (MAIN) API RESPONSE:');
        console.log(JSON.stringify(json, null, 2).substring(0, 3000));
        
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-notice-main.json', 
          JSON.stringify(json, null, 2));
      } catch (e) {}
    }
    
    // Detail aspect
    if (url.includes('/in/rest/api/notice') && url.includes('aspect=Detail')) {
      try {
        const json = await response.json();
        console.log('\n📦 NOTICE (DETAIL) API RESPONSE:');
        console.log(JSON.stringify(json, null, 2).substring(0, 3000));
        
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-notice-detail.json', 
          JSON.stringify(json, null, 2));
      } catch (e) {}
    }
  });
  
  try {
    // Visit search page
    const searchUrl = 'https://basedescollections.musee-armee.fr/search/88fee4f5-9d88-4d9e-8ec6-17e68311b477';
    console.log('Loading search page...');
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(4000);
    
    // Click on first result to see detail API
    console.log('\n\n=== CLICKING FIRST RESULT ===');
    
    const firstResult = await page.$('a[href*="/notice?id="]');
    if (firstResult) {
      // Get the ID from the first artwork (not the collection profile)
      const artworkId = await page.evaluate(() => {
        // Find notice links that are actual artworks, not the collection profile
        const links = document.querySelectorAll('a[href*="/notice?id="]');
        for (const link of links) {
          const href = link.href;
          const id = href.match(/id=([^&]+)/)?.[1];
          // Skip the collection profile ID
          if (id && id !== '5d9f27b0-02aa-46d7-9f68-e1456a7a0867') {
            return { id, href };
          }
        }
        return null;
      });
      
      if (artworkId) {
        console.log('Found artwork ID:', artworkId.id);
        console.log('Navigating to:', artworkId.href);
        
        await page.goto(artworkId.href, { waitUntil: 'networkidle', timeout: 60000 });
        await sleep(3000);
      } else {
        console.log('No artwork links found. Checking page content...');
        const content = await page.content();
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-search-page.html', content);
        console.log('Saved page HTML');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
