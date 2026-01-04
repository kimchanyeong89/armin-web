/**
 * Napoli Missing Collections Scraper
 * For collections that use carousel slides with title/inv format
 * (Cumae, Villa of Papyri, Glass, Silverware, Weapons, Model of Pompeii, Bronzes)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EXISTING_FILE = path.join(__dirname, '../public/data/museo-archeologico-napoli-collection.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/museo-archeologico-napoli-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/napoli-missing-progress.json');

const MISSING_COLLECTIONS = [
  { id: 'cumae', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/cumae/', name: 'Cumae' },
  { id: 'villa-dei-papiri', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/villa-of-the-papyri/', name: 'Villa of the Papyri' },
  { id: 'glass', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/glass/', name: 'Glass Collection' },
  { id: 'silverware', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/silverware/', name: 'Silverware' },
  { id: 'weapons', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/weapons-and-gladiators/', name: 'Weapons and Gladiators' },
  { id: 'model-pompeii', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/model-of-pompeii/', name: 'Model of Pompeii' },
  { id: 'bronzes', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/bronzes/', name: 'Bronzes' }
];

function loadExisting() {
  try {
    if (fs.existsSync(EXISTING_FILE)) {
      return JSON.parse(fs.readFileSync(EXISTING_FILE, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveOutput(artworks) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  console.log(`Saved ${artworks.length} total artworks`);
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

async function scrapeCollection(page, collection, startIndex) {
  console.log(`\n=== Scraping: ${collection.name} ===`);
  
  await page.goto(collection.url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  
  // Scroll to load everything
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
  }
  
  // Try multiple methods to extract artwork data
  const items = await page.evaluate(() => {
    const results = [];
    
    // Method 1: Carousel slides with wpex-carousel-slide
    const carouselSlides = document.querySelectorAll('.wpex-carousel-slide');
    carouselSlides.forEach(slide => {
      const img = slide.querySelector('img');
      const link = slide.querySelector('a');
      const textDiv = slide.querySelector('.wpex-carousel-entry-title, .entry-title, figcaption, .caption');
      
      // Extract text from slide content
      const slideText = slide.textContent.trim();
      const lines = slideText.split('\n').map(l => l.trim()).filter(l => l);
      
      // Title is usually first line, Inv is usually second
      let title = '';
      let inv = '';
      
      if (lines.length >= 1) title = lines[0];
      if (lines.length >= 2 && lines[1].toLowerCase().includes('inv')) {
        inv = lines[1];
      } else {
        const invMatch = slideText.match(/Inv\.\s*([\d,\s]+)/i);
        if (invMatch) inv = invMatch[0];
      }
      
      const imageUrl = img ? (img.src || img.dataset.src || img.dataset.lazySrc) : '';
      
      if (title && imageUrl) {
        results.push({ title, inv, imageUrl });
      }
    });
    
    // Method 2: Lightbox gallery links (alternative)
    if (results.length === 0) {
      const lightboxLinks = document.querySelectorAll('a[data-fancybox], a.lightbox, a[rel="lightbox"]');
      lightboxLinks.forEach(link => {
        const img = link.querySelector('img');
        const title = link.getAttribute('data-caption') || link.getAttribute('title') || '';
        const imageUrl = link.href || (img ? img.src : '');
        
        if (title && imageUrl) {
          results.push({ title, inv: '', imageUrl });
        }
      });
    }
    
    // Method 3: Figure elements with figcaption
    if (results.length === 0) {
      const figures = document.querySelectorAll('figure');
      figures.forEach(fig => {
        const img = fig.querySelector('img');
        const caption = fig.querySelector('figcaption');
        const title = caption ? caption.textContent.trim() : '';
        const imageUrl = img ? img.src : '';
        
        if (title && imageUrl) {
          results.push({ title, inv: '', imageUrl });
        }
      });
    }
    
    return results;
  });
  
  console.log(`Found ${items.length} items`);
  
  // Convert to artwork objects
  const artworks = items.map((item, i) => {
    // Parse inventory number
    let inventoryNumber = '';
    const invMatch = item.inv?.match(/[\d,\s]+/) || item.title.match(/Inv\.\s*([\d,\s]+)/i);
    if (invMatch) inventoryNumber = invMatch[0].trim();
    
    // Clean title (remove inv number if included)
    let cleanTitle = item.title.replace(/Inv\.\s*[\d,\s]+/i, '').trim();
    
    return {
      id: `mann-${collection.id}-${String(i + 1).padStart(4, '0')}`,
      title: cleanTitle || item.title,
      artist: '',
      date: '',
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
}

async function main() {
  console.log('=== Napoli Missing Collections Scraper ===');
  
  // Load existing artworks
  const existingArtworks = loadExisting();
  console.log(`Existing artworks: ${existingArtworks.length}`);
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const newArtworks = [];
  
  for (const collection of MISSING_COLLECTIONS) {
    try {
      const artworks = await scrapeCollection(page, collection, existingArtworks.length + newArtworks.length);
      newArtworks.push(...artworks);
      
      saveProgress({ 
        collection: collection.name, 
        count: artworks.length,
        total: newArtworks.length 
      });
      
    } catch (error) {
      console.error(`Error with ${collection.name}:`, error.message);
    }
  }
  
  await browser.close();
  
  // Merge and save
  const allArtworks = [...existingArtworks, ...newArtworks];
  saveOutput(allArtworks);
  
  console.log('\n=== Summary ===');
  console.log(`Previous artworks: ${existingArtworks.length}`);
  console.log(`New artworks: ${newArtworks.length}`);
  console.log(`Total artworks: ${allArtworks.length}`);
}

main().catch(console.error);
