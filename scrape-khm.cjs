const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHM() {
  console.log('🎨 Starting KHM (Kunsthistorisches Museum) scraper...');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Intercept API calls
  const apiCalls = [];
  await page.setRequestInterception(true);
  
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('api') || url.includes('json') || url.includes('search')) {
      console.log('📡 API Request:', url);
      apiCalls.push({
        url: url,
        method: request.method(),
        headers: request.headers(),
        postData: request.postData()
      });
    }
    request.continue();
  });
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('api') || url.includes('json') || url.includes('search')) {
      try {
        const contentType = response.headers()['content-type'];
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log('📥 API Response:', url);
          console.log('Response data sample:', JSON.stringify(data).substring(0, 500));
          
          // Save the response
          const filename = `khm-api-${Date.now()}.json`;
          fs.writeFileSync(
            `/Users/kietzsche/armin-web-main/downloads/${filename}`,
            JSON.stringify(data, null, 2)
          );
          console.log(`✅ Saved to ${filename}`);
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
  });
  
  // Navigate to the search page
  const url = 'https://www.khm.at/en/artworks/search?fq%5Bfacet_classification%5D=Gem%C3%A4lde&fq%5Bfacet_has_image%5D%5B0%5D=1&cHash=738b8e81cc3ddb9958b1da50cd95fa40';
  
  console.log('🌐 Navigating to:', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Wait for content to load
  await page.waitForTimeout(5000);
  
  // Try to find the search results
  const pageContent = await page.content();
  fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/khm-page.html', pageContent);
  console.log('✅ Saved page HTML');
  
  // Check for any data in window object
  const windowData = await page.evaluate(() => {
    const data = {};
    
    // Check common data containers
    if (window.__INITIAL_STATE__) data.initialState = window.__INITIAL_STATE__;
    if (window.__DATA__) data.data = window.__DATA__;
    if (window.__NEXT_DATA__) data.nextData = window.__NEXT_DATA__;
    
    return data;
  });
  
  if (Object.keys(windowData).length > 0) {
    fs.writeFileSync(
      '/Users/kietzsche/armin-web-main/downloads/khm-window-data.json',
      JSON.stringify(windowData, null, 2)
    );
    console.log('✅ Saved window data');
  }
  
  console.log('\n📋 API Calls Summary:');
  apiCalls.forEach((call, i) => {
    console.log(`${i + 1}. ${call.method} ${call.url}`);
  });
  
  // Keep browser open for manual inspection
  console.log('\n⏸️  Browser will stay open for 30 seconds for inspection...');
  await page.waitForTimeout(30000);
  
  await browser.close();
  console.log('✅ Done!');
}

scrapeKHM().catch(console.error);
