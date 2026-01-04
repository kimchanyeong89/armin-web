/**
 * Museo Archeologico Nazionale di Napoli (MANN) Full Scraper v2
 * Updated collection URLs as of 2026
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-archeologico-napoli-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/napoli-v2-progress.json');

// Updated collection URLs
const COLLECTIONS = [
  { id: 'egyptian', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/egyptian-collection/', name: 'Egyptian Collection' },
  { id: 'epigraphic', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/epigraphic-collection/', name: 'Epigraphic Collection' },
  { id: 'farnese', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/farnese-collection/', name: 'Farnese Collection' },
  { id: 'farnese-gems', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/farnese-gems/', name: 'Farnese Gems' },
  { id: 'campania-roman', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/campania-in-the-roman-period-sculptures-and-paintings-from-public-buildings/', name: 'Campania in the Roman Period' },
  { id: 'mosaics', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/mosaics/', name: 'Mosaics' },
  { id: 'secret-room', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/secret-room/', name: 'Secret Room' },
  { id: 'numismatic', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/numismatic-collection/', name: 'Numismatic Collection' },
  { id: 'daily-life', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/daily-life-objects-from-the-vesuvian-area/', name: 'Daily Life Objects' },
  { id: 'domus', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/domus-furnishings-from-pompeii/', name: 'Domus Furnishings from Pompeii' },
  { id: 'frescoes', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/frescoes/', name: 'Frescoes' },
  { id: 'isis-temple', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/temple-of-isis/', name: 'Temple of Isis' },
  { id: 'pompeii-model', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/scale-model-of-pompeii/', name: 'Scale Model of Pompeii' },
  { id: 'villa-papyri', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/villa-of-papyri/', name: 'Villa of Papyri' },
  { id: 'prehistory', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/prehistory-and-protohistory/', name: 'Prehistory and Protohistory' },
  { id: 'piana-campana', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/the-piana-campana-and-the-mann/', name: 'The Piana Campana and the MANN' },
  { id: 'magna-graecia', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/magna-graecia-collection/', name: 'Magna Graecia Collection' }
];

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function saveOutput(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  console.log(`\nSaved ${artworks.length} artworks to ${OUTPUT_FILE}`);
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { completedCollections: [], artworks: [] };
}

async function scrapeCollection(page, collection) {
  console.log(`\n=== ${collection.name} ===`);
  
  try {
    await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    // Scroll to load content
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
    }
    
    // Extract artwork data - multiple methods
    const items = await page.evaluate(() => {
      const results = [];
      
      // Method 1: data-title attributes in lightbox links
      const dataTitleLinks = document.querySelectorAll('a[data-title]');
      dataTitleLinks.forEach(link => {
        const title = link.getAttribute('data-title');
        const caption = link.getAttribute('data-caption') || '';
        const imageUrl = link.href;
        
        if (title && title.length > 2 && imageUrl && imageUrl.match(/\.(jpg|jpeg|png|webp)/i)) {
          results.push({ title, caption, imageUrl });
        }
      });
      
      // Method 2: Carousel slides with title/inv format (like screenshot shows)
      if (results.length === 0) {
        const slides = document.querySelectorAll('.wpex-carousel-slide, .slick-slide, .swiper-slide');
        slides.forEach(slide => {
          const img = slide.querySelector('img');
          const titleEl = slide.querySelector('.entry-title, .wpex-carousel-entry-title, h3, h4, figcaption');
          const title = titleEl ? titleEl.textContent.trim() : '';
          const imageUrl = img ? (img.src || img.dataset.src) : '';
          
          // Also look for Inv. number
          const invEl = slide.querySelector('.entry-excerpt, .inv, p');
          const caption = invEl ? invEl.textContent.trim() : '';
          
          if (title && imageUrl && !imageUrl.includes('placeholder')) {
            results.push({ title, caption, imageUrl });
          }
        });
      }
      
      // Method 3: Figure elements
      if (results.length === 0) {
        const figures = document.querySelectorAll('figure.gallery-item, .gallery-icon');
        figures.forEach(fig => {
          const img = fig.querySelector('img');
          const caption = fig.querySelector('figcaption');
          const link = fig.querySelector('a');
          
          const title = caption ? caption.textContent.trim() : '';
          const imageUrl = link?.href || img?.src || '';
          
          if (title && imageUrl) {
            results.push({ title, caption: '', imageUrl });
          }
        });
      }
      
      return results;
    });
    
    console.log(`Found ${items.length} items`);
    
    // Convert to artwork objects
    const artworks = items.map((item, i) => {
      // Parse date/period and inventory from caption
      let date = '';
      let inventoryNumber = '';
      
      if (item.caption) {
        // Extract inventory number
        const invMatch = item.caption.match(/inv\.?\s*([\d,\s]+)/i);
        if (invMatch) inventoryNumber = invMatch[1].trim();
        
        // Date is everything before inv
        if (item.caption.includes('inv')) {
          date = item.caption.split(/inv\.?\s*/i)[0].trim().replace(/[,\s]+$/, '');
        } else {
          date = item.caption;
        }
      }
      
      return {
        id: `mann-${collection.id}-${String(i + 1).padStart(4, '0')}`,
        title: item.title.trim(),
        artist: '',
        date: date,
        medium: '',
        dimensions: '',
        inventoryNumber: inventoryNumber,
        type: collection.name,
        collection: collection.name,
        imageUrl: item.imageUrl,
        sourceUrl: collection.url,
        museum: 'Museo Archeologico Nazionale di Napoli',
        museumShortName: 'MANN'
      };
    });
    
    return artworks;
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('=== MANN Full Scraper v2 ===');
  console.log(`${COLLECTIONS.length} collections to scrape\n`);
  
  const progress = loadProgress();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const collectionsToScrape = COLLECTIONS.filter(c => !progress.completedCollections.includes(c.id));
  console.log(`Remaining: ${collectionsToScrape.length} collections`);
  
  for (const collection of collectionsToScrape) {
    const artworks = await scrapeCollection(page, collection);
    
    if (artworks.length > 0) {
      progress.artworks.push(...artworks);
      progress.completedCollections.push(collection.id);
      saveProgress(progress);
      console.log(`Total: ${progress.artworks.length} artworks`);
    } else {
      // Mark as completed even if 0 items
      progress.completedCollections.push(collection.id);
      saveProgress(progress);
    }
    
    await page.waitForTimeout(1500);
  }
  
  await browser.close();
  
  // Save final output
  saveOutput(progress.artworks);
  
  // Statistics
  console.log('\n=== Final Statistics ===');
  console.log(`Total artworks: ${progress.artworks.length}`);
  console.log(`With image: ${progress.artworks.filter(a => a.imageUrl).length}`);
  console.log(`With date: ${progress.artworks.filter(a => a.date).length}`);
  console.log(`With inventory: ${progress.artworks.filter(a => a.inventoryNumber).length}`);
  
  // By collection
  console.log('\n=== By Collection ===');
  const byCollection = {};
  progress.artworks.forEach(a => {
    byCollection[a.collection] = (byCollection[a.collection] || 0) + 1;
  });
  Object.entries(byCollection).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
    console.log(`${name}: ${count}`);
  });
}

main().catch(console.error);
