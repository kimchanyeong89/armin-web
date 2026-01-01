/**
 * Full API capture for Musée de l'Armée
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const allResponses = [];
  
  // Capture ALL responses
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/in/rest/') && response.status() === 200) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const json = await response.json();
          allResponses.push({
            url: url,
            method: response.request().method(),
            data: json
          });
        }
      } catch (e) {}
    }
  });
  
  try {
    // 1. Visit the Napoleon collection directly
    console.log('='.repeat(60));
    console.log('VISITING NAPOLEON COLLECTION');
    console.log('='.repeat(60));
    
    // The actual search page with napoleon collection
    const searchUrl = 'https://basedescollections.musee-armee.fr/notice?id=5d9f27b0-02aa-46d7-9f68-e1456a7a0867';
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(5000);
    
    // Take screenshot
    await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/musee-armee-napoleon.png', fullPage: true });
    
    // Check for "Liste" button or result count
    const pageInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const count = body.match(/(\d+)\s*résultats?/i);
      
      // Get visible artwork info
      const artworks = [];
      document.querySelectorAll('a[href*="/notice"]').forEach(el => {
        const title = el.innerText?.trim();
        const link = el.href;
        const img = el.querySelector('img')?.src;
        if (title || link) {
          artworks.push({ title: title?.substring(0, 50), link, img });
        }
      });
      
      return {
        resultCount: count ? count[1] : 'not found',
        pageText: body.substring(0, 2000),
        artworks: artworks.slice(0, 10)
      };
    });
    
    console.log('\nResult count:', pageInfo.resultCount);
    console.log('Visible artworks:', pageInfo.artworks.length);
    
    // Save responses
    console.log('\nAPI Responses captured:', allResponses.length);
    allResponses.forEach((resp, i) => {
      console.log(`${i + 1}. [${resp.method}] ${resp.url.substring(0, 100)}`);
      
      // Look for search results
      if (resp.data?.results || resp.data?.hits || resp.data?.documents) {
        console.log('   ⭐ Contains results!');
        fs.writeFileSync(`/Users/kietzsche/armin-web-main/downloads/musee-armee-resp-${i}.json`, 
          JSON.stringify(resp.data, null, 2));
      }
    });
    
    // 2. Now visit the search page that shows the 219 items
    console.log('\n\n' + '='.repeat(60));
    console.log('VISITING SEARCH PAGE WITH RESULTS');
    console.log('='.repeat(60));
    
    allResponses.length = 0; // Clear
    
    // This search page shows "219 résultats dans Objets de la période napoléonienne"
    const searchPageUrl = 'https://basedescollections.musee-armee.fr/search/88fee4f5-9d88-4d9e-8ec6-17e68311b477';
    await page.goto(searchPageUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(5000);
    
    // The page should load with results
    await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/musee-armee-search-results.png', fullPage: true });
    
    // Check for visible results
    const searchInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const count = body.match(/(\d+)\s*résultats?/i);
      
      // Look for artwork cards
      const cards = document.querySelectorAll('[class*="card"], [class*="result"], article, .MuiCard-root');
      
      return {
        resultCount: count ? count[1] : 'not found',
        cardCount: cards.length,
        bodySnippet: body.substring(0, 500)
      };
    });
    
    console.log('\nSearch page result count:', searchInfo.resultCount);
    console.log('Card elements found:', searchInfo.cardCount);
    
    console.log('\nAPI Responses from search page:', allResponses.length);
    allResponses.forEach((resp, i) => {
      console.log(`${i + 1}. [${resp.method}] ${resp.url.substring(0, 100)}`);
      
      if (resp.data?.results || resp.data?.hits) {
        console.log('   ⭐ Contains results/hits!');
        console.log('   Results:', resp.data?.results?.length || resp.data?.hits?.length || 'N/A');
        fs.writeFileSync(`/Users/kietzsche/armin-web-main/downloads/musee-armee-search-${i}.json`, 
          JSON.stringify(resp.data, null, 2));
      }
    });
    
    // 3. Look at the page HTML to understand structure
    const html = await page.content();
    fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-search-page.html', html);
    console.log('\nHTML saved');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
