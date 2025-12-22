const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const urls = [
    'https://www.navigart.fr/mamparis/artwork/jean-le-gac-le-tableau-avec-peintre-camoufleur-et-biographie-180000000006298',
    'https://www.navigart.fr/mamparis/artwork/niele-toroni-cabinet-de-peinture-empreintes-de-pinceau-n-50-repetees-a-intervalles-reguliers-de-30-cm-180000000006190',
    'https://www.navigart.fr/mamparis/artwork/daniel-dezeuze-180000000006295'
  ];
  
  for (let i = 0; i < urls.length; i++) {
    console.log(`\n=== ${i + 1}번 작품 ===`);
    await page.goto(urls[i], { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const images = await page.$$eval('img', imgs => imgs.map(img => ({
      src: img.src,
      dataSrc: img.getAttribute('data-src')
    })).filter(img => img.src?.includes('navigart') || img.dataSrc?.includes('navigart')));
    
    console.log('찾은 이미지들:');
    images.forEach((img, j) => {
      console.log(`  ${j}: src=${img.src}`);
      if (img.dataSrc) console.log(`     data-src=${img.dataSrc}`);
    });
  }
  
  await browser.close();
})();
