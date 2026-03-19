const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeKHMBrowser() {
  console.log('🎨 KHM Museum - Browser-Based Complete Scraping\n');
  console.log('Strategy: Navigate multiple pages + Extract all metadata\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const baseUrl = 'https://www.khm.at';
  const results = [];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    // List of different starting URLs
    const searchUrls = [
      '/en/artworks/search',
      '/en/visit/collections/picture-gallery',
      '/en/visit/collections/kunstkammer-wien',
    ];
    
    // Visit different collection/search pages
    for (const searchUrl of searchUrls) {
      if (results.length >= 100) break;
      
      console.log(`\n📂 Visiting ${searchUrl}...`);
      
      try {
        await page.goto(baseUrl + searchUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Find all artwork links on the page
        const links = await page.evaluate(() => {
          const artworkLinks = [];
          document.querySelectorAll('a[href*="/artworks/"]').forEach(link => {
            const href = link.getAttribute('href');
            if (href && href.includes('/artworks/') && !href.includes('/search')) {
              const title = link.textContent.trim() || link.querySelector('img')?.alt || '';
              const img = link.querySelector('img')?.src || '';
              if (title && title.length > 3) {
                artworkLinks.push({ href, title, img });
              }
            }
          });
          return artworkLinks;
        });
        
        console.log(`   Found ${links.length} artwork links`);
        
        // Visit each artwork page and extract detailed info
        const existingUrls = new Set(results.map(r => r.url));
        
        for (const link of links) {
          if (results.length >= 100) break;
          
          const fullUrl = link.href.startsWith('http') ? link.href : baseUrl + link.href;
          
          if (existingUrls.has(fullUrl)) continue;
          
          console.log(`   [${results.length + 1}/100] ${link.title.substring(0, 50)}...`);
          
          try {
            await page.goto(fullUrl, {
              waitUntil: 'networkidle2',
              timeout: 20000
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Extract all metadata from detail page
            const artwork = await page.evaluate((baseUrl) => {
              const data = {};
              
              // Title
              data.title = document.querySelector('h1, .object-title, [itemprop="name"]')?.textContent.trim() || '';
              
              // Image
              const img = document.querySelector('.object-image img, [itemprop="image"], .detail-image img');
              data.imageUrl = img?.src || img?.getAttribute('data-src') || '';
              
              // Extract all dt/dd pairs
              const metadata = {};
              document.querySelectorAll('dt').forEach(dt => {
                const key = dt.textContent.trim().toLowerCase().replace(':', '');
                const value = dt.nextElementSibling?.textContent.trim();
                if (key && value) metadata[key] = value;
              });
              
              // Extract labeled fields
              document.querySelectorAll('.field, .metadata-item, .object-data-row').forEach(field => {
                const label = field.querySelector('.label, .field-label, dt')?.textContent.trim().toLowerCase();
                const value = field.querySelector('.value, .field-value, dd')?.textContent.trim();
                if (label && value) metadata[label] = value;
              });
              
              // Description
              const descEl = document.querySelector('.object-description, .description, [itemprop="description"], .detail-text');
              data.description = descEl?.textContent.trim() || '';
              
              // Common metadata fields
              data.artist = metadata.artist || metadata.künstler || metadata.creator || metadata.school || '';
              data.culture = metadata.culture || metadata.kultur || metadata.origin || metadata.herkunft || '';
              data.date = metadata.date || metadata.dating || metadata.datierung || metadata.created || '';
              data.period = metadata.period || metadata.periode || metadata.epoch || metadata.epoche || '';
              data.medium = metadata.material || metadata.medium || metadata.technique || metadata.technik || '';
              data.dimensions = metadata.dimensions || metadata.maße || metadata.size || metadata.größe || '';
              data.inventory = metadata['inventory number'] || metadata.inventarnummer || metadata['object number'] || '';
              data.category = metadata.category || metadata.kategorie || metadata.classification || '';
              data.objectType = metadata['object type'] || metadata.objekttyp || metadata.objektart || '';
              data.provenance = metadata.provenance || metadata.provenienz || '';
              data.location = metadata.location || metadata.standort || metadata.display || '';
              data.creditLine = metadata.credit || metadata['credit line'] || metadata.erwerbung || '';
              
              // ID from URL
              const urlParts = window.location.pathname.split('/');
              const lastPart = urlParts[urlParts.length - 1];
              const idMatch = lastPart.match(/(\d+)/);
              data.id = idMatch ? idMatch[1] : '';
              
              data.url = window.location.href;
              
              return data;
            }, baseUrl);
            
            if (artwork.title) {
              results.push(artwork);
              existingUrls.add(fullUrl);
              
              const enhancements = [];
              if (artwork.medium) enhancements.push('medium');
              if (artwork.dimensions) enhancements.push('dimensions');
              if (artwork.description) enhancements.push('desc');
              
              if (enhancements.length > 0) {
                console.log(`      ✓ ${enhancements.join(', ')}`);
              }
            }
            
            await new Promise(resolve => setTimeout(resolve, 800));
            
          } catch (error) {
            console.log(`      ⚠️  ${error.message.substring(0, 40)}`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Error on ${searchUrl}: ${error.message}`);
      }
    }
    
    await browser.close();
    
    console.log(`\n✅ Collected ${results.length} artworks with metadata\n`);
    
    // Process and enhance
    const enhanced = results.slice(0, 100).map((artwork, index) => ({
      id: artwork.id || `khm_${index + 1}`,
      url: artwork.url,
      title: artwork.title,
      artist: artwork.artist || artwork.culture || '',
      culture: artwork.culture || artwork.artist || '',
      date: artwork.date || '',
      period: artwork.period || '',
      medium: artwork.medium || '',
      dimensions: artwork.dimensions || '',
      inventory: artwork.inventory || artwork.id || '',
      imageUrl: artwork.imageUrl,
      classification: determineClassification(artwork.title, artwork.culture, artwork.objectType, artwork.category),
      objectType: artwork.objectType || determineObjectType(artwork.title),
      category: artwork.category || artwork.culture || '',
      isHighlight: false,
      description: artwork.description ? artwork.description.substring(0, 1500) : '',
      provenance: artwork.provenance || '',
      creditLine: artwork.creditLine || '',
      location: artwork.location || '',
      source: 'Kunsthistorisches Museum Vienna',
      sourceUrl: baseUrl,
      index: index + 1
    }));
    
    // Save
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`✅ Saved ${enhanced.length} artworks to khm-test-100.json\n`);
    
    printStats(enhanced);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    await browser.close();
  }
}

function determineClassification(title, culture, objectType, category) {
  const t = (title || '').toLowerCase();
  const c = (culture || '').toLowerCase();
  const o = (objectType || '').toLowerCase();
  const cat = (category || '').toLowerCase();
  
  if (t.includes('gemälde') || t.includes('painting') || o.includes('painting') || cat.includes('painting')) return 'Painting';
  if (t.includes('skulptur') || t.includes('statue') || t.includes('büste') || t.includes('relief') || o.includes('sculpture')) return 'Sculpture';
  if (c.includes('römisch') || c.includes('griechisch') || c.includes('hellenistisch') || c.includes('ägyptisch') || c.includes('etruskisch')) return 'Antiquities';
  if (t.includes('kameo') || t.includes('gemme') || t.includes('cameo')) return 'Gem/Cameo';
  if (t.includes('instrument') || t.includes('violine') || t.includes('klavier') || t.includes('gambe') || 
      t.includes('cembalo') || t.includes('gitarre') || t.includes('flöte') || t.includes('orgel')) return 'Musical Instrument';
  if (t.includes('fibel') || t.includes('medaillon') || t.includes('kapsel') || t.includes('krug') || 
      t.includes('pokal') || t.includes('becken') || t.includes('uhr') || t.includes('dose')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title) {
  const t = (title || '').toLowerCase();
  const types = {
    'gemälde': 'Painting', 'portrait': 'Portrait', 'porträt': 'Portrait', 'landschaft': 'Landscape',
    'statue': 'Statue', 'büste': 'Bust', 'kopf': 'Head', 'relief': 'Relief', 'torso': 'Torso',
    'stele': 'Stele', 'sarkophag': 'Sarcophagus', 'urne': 'Urn', 'kameo': 'Cameo', 'gemme': 'Gem',
    'violine': 'Violin', 'viola': 'Viola', 'cello': 'Cello', 'gambe': 'Viol',
    'cembalo': 'Harpsichord', 'klavier': 'Piano', 'flügel': 'Piano',
    'flöte': 'Flute', 'trompete': 'Trumpet', 'posaune': 'Trombone',
    'pokal': 'Cup', 'becher': 'Beaker', 'krug': 'Jug', 'becken': 'Bowl',
    'uhr': 'Clock', 'dose': 'Box', 'schale': 'Dish'
  };
  
  for (const [key, type] of Object.entries(types)) {
    if (t.includes(key)) return type;
  }
  return 'Artwork';
}

function printStats(artworks) {
  const total = artworks.length;
  
  console.log('═══════════════════════════════════════════');
  console.log('📊 FINAL STATISTICS');
  console.log('═══════════════════════════════════════════\n');
  
  console.log(`Total: ${total} artworks\n`);
  console.log('Data Quality:');
  console.log(`   Images: ${artworks.filter(a => a.imageUrl).length}/${total} (${Math.round(artworks.filter(a => a.imageUrl).length/total*100)}%)`);
  console.log(`   Culture: ${artworks.filter(a => a.culture).length}/${total} (${Math.round(artworks.filter(a => a.culture).length/total*100)}%)`);
  console.log(`   Dates: ${artworks.filter(a => a.date).length}/${total} (${Math.round(artworks.filter(a => a.date).length/total*100)}%)`);
  console.log(`   Medium: ${artworks.filter(a => a.medium).length}/${total} (${Math.round(artworks.filter(a => a.medium).length/total*100)}%)`);
  console.log(`   Dimensions: ${artworks.filter(a => a.dimensions).length}/${total} (${Math.round(artworks.filter(a => a.dimensions).length/total*100)}%)`);
  console.log(`   Description: ${artworks.filter(a => a.description).length}/${total} (${Math.round(artworks.filter(a => a.description).length/total*100)}%)`);
  
  const classes = {};
  artworks.forEach(a => classes[a.classification] = (classes[a.classification] || 0) + 1);
  console.log(`\nClassifications:`);
  Object.entries(classes).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => 
    console.log(`   ${c}: ${n}`)
  );
  
  console.log(`\nSample (first 3):`);
  artworks.slice(0, 3).forEach((art, i) => {
    console.log(`\n${i + 1}. ${art.title}`);
    console.log(`   Date: ${art.date || 'N/A'}`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
  });
  
  console.log(`\n═══════════════════════════════════════════\n`);
}

scrapeKHMBrowser().catch(console.error);
