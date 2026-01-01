/**
 * Capture search API with POST data and response
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture POST search requests
  page.on('request', async request => {
    if (request.url().includes('/in/rest/api/search') && request.method() === 'POST') {
      console.log('\n🔍 SEARCH REQUEST:');
      console.log('URL:', request.url());
      const postData = request.postData();
      console.log('POST:', postData);
      fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-search-request.json', postData || '{}');
    }
  });
  
  page.on('response', async response => {
    if (response.url().includes('/in/rest/api/search') && response.request().method() === 'POST') {
      console.log('\n📦 SEARCH RESPONSE:');
      try {
        const text = await response.text();
        fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-search-response.json', text);
        console.log('Response saved, length:', text.length);
        
        const json = JSON.parse(text);
        console.log('Hits:', json.hits);
        console.log('Results:', json.results?.length);
        if (json.results?.[0]) {
          console.log('\nFirst result keys:', Object.keys(json.results[0]));
          console.log('First result:', JSON.stringify(json.results[0], null, 2).substring(0, 1500));
        }
      } catch (e) {
        console.log('Parse error:', e.message);
      }
    }
    
    // Also capture notice API for artwork details
    if (response.url().includes('/in/rest/api/notice') && response.url().includes('aspect=')) {
      try {
        const text = await response.text();
        const aspect = response.url().match(/aspect=([^&]+)/)?.[1] || 'unknown';
        fs.writeFileSync(`/Users/kietzsche/armin-web-main/downloads/musee-armee-notice-${aspect}.json`, text);
        console.log(`\n📋 Notice (${aspect}) saved`);
      } catch (e) {}
    }
  });
  
  try {
    // Visit Napoleon collection
    console.log('Loading Napoleon collection...');
    await page.goto('https://basedescollections.musee-armee.fr/notice?id=5d9f27b0-02aa-46d7-9f68-e1456a7a0867', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await sleep(5000);
    
    // Now click on first artwork to get detail API
    console.log('\n\n=== CLICKING FIRST ARTWORK ===');
    
    const artworkLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="/notice?id="]').forEach(a => {
        const href = a.href;
        const id = href.match(/id=([^&]+)/)?.[1];
        // Skip the collection profile
        if (id && id !== '5d9f27b0-02aa-46d7-9f68-e1456a7a0867') {
          const text = a.innerText?.trim() || '';
          links.push({ id, href, text: text.substring(0, 50) });
        }
      });
      return links;
    });
    
    console.log('Found artwork links:', artworkLinks.length);
    artworkLinks.forEach((l, i) => console.log(`  ${i + 1}. ${l.text || l.id}`));
    
    if (artworkLinks.length > 0) {
      console.log('\nVisiting first artwork:', artworkLinks[0].href);
      await page.goto(artworkLinks[0].href, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(3000);
      
      // Get all visible fields
      const detailInfo = await page.evaluate(() => {
        const fields = {};
        
        // Look for common field patterns in French
        const patterns = [
          'Numéro d\'inventaire', 'Auteur', 'Exécutant', 'Date', 'Période',
          'Titre', 'Désignation', 'Matériaux', 'Techniques', 'Dimensions',
          'Description', 'Lieu', 'Provenance', 'Acquisition'
        ];
        
        const body = document.body.innerText;
        
        // Try to extract any visible data
        const allText = [];
        document.querySelectorAll('span, div, p, h1, h2, h3, h4').forEach(el => {
          const text = el.innerText?.trim();
          if (text && text.length > 2 && text.length < 500) {
            allText.push(text);
          }
        });
        
        // Get images
        const images = [];
        document.querySelectorAll('img').forEach(img => {
          if (img.src && !img.src.includes('logo') && img.src.includes('rest')) {
            images.push(img.src);
          }
        });
        
        return {
          title: document.querySelector('h1, h2')?.innerText?.trim() || '',
          bodySnippet: body.substring(0, 3000),
          images,
          textElements: allText.slice(0, 50)
        };
      });
      
      console.log('\n📋 Detail page info:');
      console.log('Title:', detailInfo.title);
      console.log('Images:', detailInfo.images.length);
      detailInfo.images.forEach((img, i) => console.log(`  ${i + 1}. ${img.substring(0, 100)}`));
      console.log('\nText elements sample:');
      detailInfo.textElements.slice(0, 20).forEach(t => console.log('  -', t.substring(0, 80)));
      
      // Save full page
      const html = await page.content();
      fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-artwork-detail.html', html);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
