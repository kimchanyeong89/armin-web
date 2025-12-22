/**
 * Test MAM detail page parsing
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.navigart.fr/mamparis/artwork/portrait-de-monsieur-almenar-180000000005964', { 
    waitUntil: 'networkidle', 
    timeout: 60000 
  });
  await page.waitForTimeout(5000);
  
  const data = await page.evaluate(() => {
    const details = document.querySelector('.details');
    if (!details) return { error: 'No .details found' };
    
    const lines = details.innerText.split('\n').map(l => l.trim()).filter(Boolean);
    
    let artist = null;
    let title = null;
    let year = null;
    let medium = null;
    let dimensions = null;
    
    // Artist - first line, usually starts with dash
    if (lines[0]) {
      artist = lines[0].replace(/^-\s*/, '');
    }
    
    // Title - look for the em/i element or second non-date line
    const titleEl = details.querySelector('.single-artwork-title-ua, em, i');
    if (titleEl) {
      title = titleEl.textContent.trim();
    }
    
    // Parse other fields from lines
    for (const line of lines) {
      if (!year && line.match(/^vers\s+\d{4}|^\d{4}$/i)) {
        year = line;
      }
      if (!medium && line.match(/^(Peinture|Huile|Acrylique|Tempera|Gouache)/i)) {
        medium = line;
      }
      if (!dimensions && line.match(/\d+\s*[x×]\s*\d+\s*cm/i)) {
        dimensions = line;
      }
    }
    
    // Image - find real src
    let image = null;
    const imgs = Array.from(document.querySelectorAll('img'));
    for (const img of imgs) {
      if (img.src && img.src.includes('images.navigart.fr')) {
        image = img.src;
        break;
      }
      const dataSrc = img.dataset?.src;
      if (dataSrc && dataSrc.includes('navigart')) {
        image = dataSrc;
        break;
      }
    }
    
    return { artist, title, year, medium, dimensions, image, lines: lines.slice(0, 8) };
  });
  
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
