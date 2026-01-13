const { chromium } = require('playwright');

async function checkCounts() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const collections = {
    malerei: { name: 'Malerei (Paintings)', url: 'https://museum-ludwig.kulturelles-erbe-koeln.de/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=001%5CMalerei' },
    skulptur: { name: 'Skulptur (Sculpture)', url: 'https://museum-ludwig.kulturelles-erbe-koeln.de/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=002%5CSkulptur' },
    fotografie: { name: 'Fotografie (Photography)', url: 'https://museum-ludwig.kulturelles-erbe-koeln.de/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=005%5CFotografie' },
    grafik: { name: 'Grafik (Graphics)', url: 'https://museum-ludwig.kulturelles-erbe-koeln.de/ete?action=hinzufuegenFilter&filter=filter_subsammlungen_ml&term=006%5CGrafik' }
  };
  
  console.log('Museum Ludwig Collection Counts');
  console.log('================================');
  
  for (const [key, col] of Object.entries(collections)) {
    console.log(`\nLoading ${col.name}...`);
    await page.goto(col.url, { waitUntil: 'networkidle', timeout: 60000 });
    const html = await page.content();
    
    const countMatch = html.match(/\((\d+(?:[\.,]\d+)?)\s*Dokumente?\)/i);
    const count = countMatch ? countMatch[1] : 'NOT FOUND';
    console.log(`  ${col.name}: ${count} artworks`);
  }
  
  await browser.close();
}

checkCounts().catch(console.error);
