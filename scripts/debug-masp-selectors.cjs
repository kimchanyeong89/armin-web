
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  const url = 'https://masp.org.br/en/collections/search';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Select Pintura
  await page.waitForSelector('#category');
  const options = await page.evaluate(() => Array.from(document.querySelector('#category').options).map(o => o.value));
  const pintura = options.find(v => v.match(/Pintura/i));
  if (pintura) {
      console.log(`Selecting ${pintura}...`);
      await page.select('#category', pintura);
      
      console.log('Clicking search...');
      await page.evaluate(() => {
         const btn = document.querySelector('.btn-form-collection');
         if (btn) btn.click();
      });
      
      // Wait a bit for AJAX
      await new Promise(r => setTimeout(r, 5000));
      
      // Dump HTML
      const html = await page.content();
      fs.writeFileSync('debug-masp-puppeteer-results.html', html);
      console.log('Saved debug-masp-puppeteer-results.html');
      
      // Try to find classes
      const structure = await page.evaluate(() => {
          const main = document.querySelector('main') || document.body;
          // Get all div classes with depth 3
          const getClasses = (el, depth) => {
             if (depth === 0) return [];
             let res = [];
             if (el.className) res.push(el.className);
             for (const child of el.children) {
                 res.push(...getClasses(child, depth-1));
             }
             return res;
          };
          return getClasses(main, 5).slice(0, 100); // Limit output
      });
      console.log('Classes found:', structure);
  } else {
      console.log('Pintura option not found.');
  }

  await browser.close();
})();
