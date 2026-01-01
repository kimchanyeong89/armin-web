/**
 * Analyze Museum Wales detail page structure for artist info
 */
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Test with a specific artwork that we know has artist info
  const testUrl = 'https://museum.wales/collections/online/object/f9a07ee5-52c7-3b7e-9108-c6cc3f86fd4c/';
  
  console.log('Visiting:', testUrl);
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  
  // Get ALL object fields
  const fields = await page.$$eval('.object_field', els => {
    return els.map(el => {
      const label = el.querySelector('.object_field_label');
      const value = el.querySelector('.object_field_value');
      return {
        label: label ? label.textContent.trim() : '',
        value: value ? value.textContent.trim() : '',
        html: value ? value.innerHTML : ''
      };
    });
  });
  
  console.log('\n=== All Object Fields ===');
  fields.forEach(f => {
    console.log(`[${f.label}]: ${f.value.substring(0, 100)}`);
  });
  
  // Look for any agent/artist links
  const agentLinks = await page.$$eval('a[href*="agent"]', els => {
    return els.map(a => ({ text: a.textContent.trim(), href: a.href }));
  });
  
  console.log('\n=== Agent Links ===');
  agentLinks.forEach(l => console.log(`  ${l.text} -> ${l.href}`));
  
  // Check the credit area
  const creditArea = await page.$eval('.credit_area', el => el.innerHTML).catch(() => 'not found');
  console.log('\n=== Credit Area HTML ===');
  console.log(creditArea.substring(0, 500));
  
  // Get page title and info summary
  const summary = await page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const summary = document.querySelector('.object_summary')?.innerHTML || '';
    return { title, summary };
  });
  
  console.log('\n=== Page Title ===');
  console.log(summary.title);
  console.log('\n=== Object Summary HTML ===');
  console.log(summary.summary.substring(0, 1000));
  
  await browser.close();
}

main().catch(console.error);
