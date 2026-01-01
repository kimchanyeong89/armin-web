const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.archiviodellacomunicazione.it/sicap/ENG/ArtWorks/2191/?WEB=MuseiVE', { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  const images = await page.evaluate(() => {
    const results = [];
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (src) results.push(src);
    });
    return results;
  });
  
  console.log('Found images:');
  images.forEach(img => console.log(img));
  
  // Check author field
  const author = await page.evaluate(() => {
    const text = document.body.innerText;
    const authorMatch = text.match(/Author[:\s]*([^\n]+)/i);
    return authorMatch ? authorMatch[1] : 'Not found';
  });
  console.log('\nAuthor:', author);
  
  await browser.close();
}
main().catch(console.error);
