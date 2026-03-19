const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const url = "https://colecciones.banrepcultural.org/page/coleccin-de-arte/6357aa7ae27d753f221c618d?v=mosaic&wm=1&denominacin%5B0%5D=Pintura%20Tipo%20de%20objeto%20f%C3%ADsico";
  console.log(`Navigating to ${url}...`);
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    const content = await page.content();
    fs.writeFileSync('/tmp/banrep_full.html', content);
    console.log(`Saved /tmp/banrep_full.html (${content.length} bytes)`);

    // Also look for image selectors or item containers
    // Common classes often contain 'item', 'card', 'grid'
    const itemClasses = await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div, li, article'));
        return divs.map(d => d.className).filter(c => c.includes('item') || c.includes('card') || c.includes('grid')).slice(0, 50);
    });
    console.log('Potential item classes:', [...new Set(itemClasses)]);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
})();
