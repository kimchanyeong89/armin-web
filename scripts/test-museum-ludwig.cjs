const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Test Malerei collection
  console.log('Loading Malerei collection page...');
  await page.goto('https://museum-ludwig.kulturelles-erbe-koeln.de/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=001%5CMalerei', { waitUntil: 'networkidle', timeout: 60000 });
  const html = await page.content();
  
  // Get count
  const countMatch = html.match(/\((\d+(?:[\.,]\d+)?)\s*Dokumente?\)/i);
  console.log('Total count:', countMatch ? countMatch[1] : 'NOT FOUND');
  
  // Extract links
  const links = [];
  const regex = /documents\/obj\/(\d+)/g;
  let match;
  const seen = new Set();
  while ((match = regex.exec(html)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      links.push(match[1]);
    }
  }
  console.log('Links on first page:', links.length);
  console.log('Sample links:', links.slice(0, 5).join(', '));
  
  await browser.close();
  console.log('Test passed!');
}

test().catch(console.error);
