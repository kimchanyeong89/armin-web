const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const url = "https://trove.nla.gov.au/search/category/images?keyword=%22Art%20Gallery%20of%20New%20South%20Wales%22%20painting";
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    // Wait for "load"
    await new Promise(r => setTimeout(r, 8000));
    
    console.log("Analyzing page...");
    const data = await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div'));
        const classes = new Set();
        divs.forEach(d => {
            if(d.className && typeof d.className === 'string') classes.add(d.className);
        });
        
        const imgs = document.querySelectorAll('img').length;
        const textStart = document.body.innerText.substring(0, 500);
        
        return {
            classes: Array.from(classes).slice(0, 50),
            imgCount: imgs,
            textStart
        };
    });
    
    console.log("Image Count:", data.imgCount);
    console.log("Sample Classes:", data.classes);
    console.log("Body Text Start:", data.textStart);
    
    await browser.close();
  } catch(e) { console.error(e); }
})();