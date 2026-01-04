/**
 * Museo Archeologico Nazionale di Napoli (MANN) Scraper
 * 17 Collections with artwork metadata from data-title, data-caption attributes
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COLLECTIONS = [
  { id: 'egyptian', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/egyptian-collection/', name: 'Egyptian Collection' },
  { id: 'farnese', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/farnese-collection/', name: 'Farnese Collection' },
  { id: 'mosaics', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/mosaics/', name: 'Mosaics' },
  { id: 'frescoes', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/frescoes/', name: 'Frescoes' },
  { id: 'secret-room', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/secret-room/', name: 'Secret Room' },
  { id: 'prehistory', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/prehistory/', name: 'Prehistory' },
  { id: 'cumae', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/cumae/', name: 'Cumae' },
  { id: 'villa-dei-papiri', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/villa-of-the-papyri/', name: 'Villa of the Papyri' },
  { id: 'isis-temple', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/temple-of-isis/', name: 'Temple of Isis' },
  { id: 'glass', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/glass/', name: 'Glass Collection' },
  { id: 'silverware', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/silverware/', name: 'Silverware' },
  { id: 'weapons', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/weapons-and-gladiators/', name: 'Weapons and Gladiators' },
  { id: 'model-pompeii', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/model-of-pompeii/', name: 'Model of Pompeii' },
  { id: 'numismatics', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/numismatic-collection/', name: 'Numismatic Collection' },
  { id: 'epigraphic', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/epigraphic-collection/', name: 'Epigraphic Collection' },
  { id: 'gemme', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/gemme-farnese/', name: 'Gemme Farnese' },
  { id: 'bronzes', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/bronzes/', name: 'Bronzes' }
];

const PROGRESS_FILE = path.join(__dirname, '../downloads/napoli-scrape-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-archeologico-napoli-collection.json');

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { completedCollections: [], artworks: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function saveFinalOutput(artworks) {
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  console.log(`\nSaved ${artworks.length} artworks to ${OUTPUT_FILE}`);
}

function parseArtwork(item, collection, index) {
  const title = item.dataTitle || '';
  const caption = item.dataCaption || '';
  const imageUrl = item.href || '';
  
  // Parse date/period from caption (e.g., "26th Dynasty (664-525 BC) inv. 1046")
  let date = '';
  let inventoryNumber = '';
  
  // Extract inventory number
  const invMatch = caption.match(/inv\.?\s*([\d,\s]+)/i);
  if (invMatch) {
    inventoryNumber = invMatch[1].trim();
  }
  
  // Extract date/period (everything before inv.)
  if (caption.includes('inv')) {
    date = caption.split(/inv\.?\s*/i)[0].trim();
  } else {
    date = caption;
  }
  
  // Clean up date - remove trailing punctuation
  date = date.replace(/[,\s]+$/, '');
  
  return {
    id: `mann-${collection.id}-${String(index + 1).padStart(4, '0')}`,
    title: title.trim(),
    artist: '', // Archaeological pieces don't have individual artists
    date: date,
    medium: '', // Will try to extract from context if available
    dimensions: '',
    inventoryNumber: inventoryNumber,
    type: collection.name,
    collection: collection.name,
    imageUrl: imageUrl,
    sourceUrl: collection.url,
    museum: 'Museo Archeologico Nazionale di Napoli',
    museumShortName: 'MANN'
  };
}

async function scrapeCollection(browser, collection) {
  console.log(`\nScraping: ${collection.name}`);
  console.log(`URL: ${collection.url}`);
  
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(120000);
  
  try {
    await page.goto(collection.url, { waitUntil: 'networkidle2', timeout: 120000 });
    
    // Scroll to load all content
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Extract artwork data from lightbox links
    const items = await page.evaluate(() => {
      const links = document.querySelectorAll('a[data-title]');
      return Array.from(links).map(el => ({
        dataTitle: el.getAttribute('data-title'),
        dataCaption: el.getAttribute('data-caption'),
        href: el.href
      })).filter(item => item.dataTitle && item.dataTitle.length > 2);
    });
    
    console.log(`Found ${items.length} artworks in ${collection.name}`);
    
    const artworks = items.map((item, i) => parseArtwork(item, collection, i));
    
    await page.close();
    return artworks;
    
  } catch (error) {
    console.error(`Error scraping ${collection.name}:`, error.message);
    await page.close();
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  
  console.log('=== Museo Archeologico Nazionale di Napoli Scraper ===');
  console.log(`Mode: ${testMode ? 'TEST (first 2 collections)' : 'FULL'}`);
  
  const progress = loadProgress();
  console.log(`Previously scraped: ${progress.artworks.length} artworks`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const collectionsToScrape = testMode 
    ? COLLECTIONS.slice(0, 2) 
    : COLLECTIONS.filter(c => !progress.completedCollections.includes(c.id));
  
  console.log(`Collections to scrape: ${collectionsToScrape.length}`);
  
  for (const collection of collectionsToScrape) {
    const artworks = await scrapeCollection(browser, collection);
    
    if (artworks.length > 0) {
      progress.artworks.push(...artworks);
      progress.completedCollections.push(collection.id);
      saveProgress(progress);
      console.log(`Progress saved: ${progress.artworks.length} total artworks`);
    }
    
    // Delay between collections
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await browser.close();
  
  // Save final output
  if (progress.artworks.length > 0) {
    saveFinalOutput(progress.artworks);
  }
  
  // Print statistics
  console.log('\n=== Final Statistics ===');
  console.log(`Total artworks: ${progress.artworks.length}`);
  console.log(`Collections completed: ${progress.completedCollections.length}/${COLLECTIONS.length}`);
  
  const withImage = progress.artworks.filter(a => a.imageUrl).length;
  const withDate = progress.artworks.filter(a => a.date).length;
  const withInventory = progress.artworks.filter(a => a.inventoryNumber).length;
  
  console.log(`With image: ${withImage} (${Math.round(withImage/progress.artworks.length*100)}%)`);
  console.log(`With date/period: ${withDate} (${Math.round(withDate/progress.artworks.length*100)}%)`);
  console.log(`With inventory #: ${withInventory} (${Math.round(withInventory/progress.artworks.length*100)}%)`);
  
  // Sample artworks
  console.log('\n=== Sample Artworks ===');
  progress.artworks.slice(0, 5).forEach(a => {
    console.log(`- ${a.title}`);
    console.log(`  Date: ${a.date || 'N/A'}`);
    console.log(`  Inv: ${a.inventoryNumber || 'N/A'}`);
    console.log(`  Collection: ${a.collection}`);
  });
}

main().catch(console.error);
