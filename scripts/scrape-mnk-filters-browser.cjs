const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to MNK catalog...');
    await page.goto('https://zbiory.mnk.pl/en/catalog', { waitUntil: 'networkidle0' });
    
    // Find "FILTER BY"
    // The HTML showed: <div class="col-lg-3 col-12 title cv-f fs">FILTER BY <span class="plus">+</span></div>
    
    const filterBtn = await page.waitForSelector('.title.cv-f.fs', { timeout: 5000 });
    
    // Accept cookies if present
    try {
        const cookieBtn = await page.waitForSelector('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 2000 });
        if(cookieBtn) await cookieBtn.click();
        console.log('Clicked Cookie banner');
        await new Promise(r => setTimeout(r, 1000));
    } catch(e) {}

    if(filterBtn) {
        console.log('Clicking Filter button via JS...');
        await page.evaluate(el => el.click(), filterBtn);
        
        // Wait for expansion
        await new Promise(r => setTimeout(r, 3000));
        
        // Dump all text in the filter container
        // I suspect the filters are loaded dynamically.
        
        const content = await page.evaluate(() => {
            const filters = [];
            // Look for checkboxes or labels
            document.querySelectorAll('label, .checkbox, .filter-item').forEach(el => {
                filters.push(el.innerText);
            });
            // Also try capturing everything in the sidebar if possible
            const sidebar = document.querySelector('.col-lg-3'); 
            return {
                labels: filters,
                sidebarText: sidebar ? sidebar.innerText : ''
            };
        });
        
        console.log('--- Filter Sidebar Text ---');
        console.log(content.sidebarText);
        
        // Try to identify "Type" section
    } else {
        console.log('Filter button not found');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
})();
