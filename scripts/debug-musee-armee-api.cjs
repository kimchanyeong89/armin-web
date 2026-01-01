/**
 * Debug API for Musée de l'Armée
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const apiCalls = [];
  
  // Monitor network requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/rest/') || url.includes('search')) {
      apiCalls.push({ 
        url, 
        method: request.method(),
        postData: request.postData()
      });
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/rest/public/search') && url.includes('size')) {
      try {
        const json = await response.json();
        console.log('\n📦 Search API Response:');
        console.log('URL:', url);
        console.log('Total hits:', json.hits?.total || json.total || 'unknown');
        console.log('Results:', json.hits?.hits?.length || json.results?.length || 'unknown');
        
        // Log first result structure
        const firstResult = json.hits?.hits?.[0] || json.results?.[0];
        if (firstResult) {
          console.log('\nFirst result structure:');
          console.log(JSON.stringify(firstResult, null, 2).substring(0, 2000));
        }
        
        // Save full response
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-api-response.json', 
          JSON.stringify(json, null, 2));
        console.log('\n💾 Full response saved to musee-armee-api-response.json');
      } catch (e) {
        console.log('Could not parse response:', e.message);
      }
    }
  });
  
  try {
    // Visit the search page
    const searchUrl = 'https://basedescollections.musee-armee.fr/search/88fee4f5-9d88-4d9e-8ec6-17e68311b477';
    console.log('Loading:', searchUrl);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(5000);
    
    console.log('\n📋 All API calls made:');
    apiCalls.forEach((api, i) => {
      if (api.url.includes('search')) {
        console.log(`\n${i + 1}. [${api.method}] ${api.url}`);
        if (api.postData) {
          console.log('   POST data:', api.postData.substring(0, 300));
        }
      }
    });
    
    // Try to find the main content API
    console.log('\n\n📋 Looking for content/notice API...');
    apiCalls.forEach((api, i) => {
      if (api.url.includes('notice') || api.url.includes('content') || api.url.includes('detail')) {
        console.log(`${i + 1}. [${api.method}] ${api.url}`);
      }
    });
    
    // Now visit a detail page
    console.log('\n\n=== VISITING DETAIL PAGE ===');
    
    // Get first item link
    const firstLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/notice?id="]');
      return link?.href;
    });
    
    if (firstLink) {
      const detailApiCalls = [];
      page.on('request', request => {
        const url = request.url();
        if (url.includes('/rest/')) {
          detailApiCalls.push({ url, method: request.method() });
        }
      });
      
      page.on('response', async response => {
        const url = response.url();
        if ((url.includes('notice') || url.includes('document') || url.includes('record')) && url.includes('/rest/')) {
          try {
            const json = await response.json();
            console.log('\n📦 Detail API Response:');
            console.log('URL:', url);
            console.log(JSON.stringify(json, null, 2).substring(0, 3000));
            
            fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-detail-api.json', 
              JSON.stringify(json, null, 2));
            console.log('\n💾 Detail response saved');
          } catch (e) {}
        }
      });
      
      console.log('Visiting:', firstLink);
      await page.goto(firstLink, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(3000);
      
      console.log('\nDetail page API calls:');
      detailApiCalls.forEach((api, i) => {
        console.log(`${i + 1}. [${api.method}] ${api.url.substring(0, 120)}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
