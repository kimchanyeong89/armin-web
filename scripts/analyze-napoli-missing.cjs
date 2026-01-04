/**
 * Analyze Napoli missing collections (Cumae, Villa of Papyri, Glass, etc.)
 * These use a different structure with title and Inv number shown below image
 */
const { chromium } = require('playwright');

const MISSING_COLLECTIONS = [
  { id: 'cumae', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/cumae/', name: 'Cumae' },
  { id: 'villa-dei-papiri', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/villa-of-the-papyri/', name: 'Villa of the Papyri' },
  { id: 'glass', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/glass/', name: 'Glass Collection' },
  { id: 'silverware', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/silverware/', name: 'Silverware' },
  { id: 'weapons', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/weapons-and-gladiators/', name: 'Weapons and Gladiators' },
  { id: 'model-pompeii', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/model-of-pompeii/', name: 'Model of Pompeii' },
  { id: 'bronzes', url: 'https://www.museoarcheologiconapoli.it/en/portfolio-item/bronzes/', name: 'Bronzes' }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  for (const col of MISSING_COLLECTIONS) {
    console.log(`\n=== Analyzing: ${col.name} ===`);
    console.log(`URL: ${col.url}`);
    
    try {
      await page.goto(col.url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      // Scroll to load all content
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
      }
      
      const data = await page.evaluate(() => {
        const results = {};
        
        // Method 1: data-title attributes (like other collections)
        const dataTitleLinks = document.querySelectorAll('a[data-title]');
        results.dataTitleCount = dataTitleLinks.length;
        
        // Method 2: Figure elements with caption (like screenshot)
        const figures = document.querySelectorAll('figure, .gallery-item');
        results.figuresCount = figures.length;
        
        // Method 3: Carousel slides
        const slides = document.querySelectorAll('.wpex-carousel-slide');
        results.slidesCount = slides.length;
        results.sampleSlides = Array.from(slides).slice(0, 3).map(s => ({
          text: s.textContent.trim().substring(0, 200),
          html: s.innerHTML.substring(0, 500)
        }));
        
        // Method 4: Look for artwork cards with title and Inv
        const allText = document.body.innerText;
        const invMatches = allText.match(/Inv\.\s*\d+/gi) || [];
        results.invMatches = invMatches.length;
        
        // Method 5: Check for specific artwork patterns
        const artworkCards = document.querySelectorAll('.artwork-card, .gallery-card, .portfolio-item');
        results.artworkCards = artworkCards.length;
        
        // Method 6: Look for image links with nearby text
        const allLinks = document.querySelectorAll('a[href*=".jpg"], a[href*=".png"]');
        results.imageLinks = allLinks.length;
        results.sampleImageLinks = Array.from(allLinks).slice(0, 5).map(l => ({
          href: l.href,
          text: l.closest('div')?.textContent?.trim().substring(0, 100) || ''
        }));
        
        // Get page HTML structure sample
        const gallery = document.querySelector('.wpex-carousel, .gallery, .portfolio-gallery');
        results.galleryHTML = gallery ? gallery.innerHTML.substring(0, 1000) : 'No gallery found';
        
        return results;
      });
      
      console.log('Data-title links:', data.dataTitleCount);
      console.log('Figures:', data.figuresCount);
      console.log('Carousel slides:', data.slidesCount);
      console.log('Inv matches:', data.invMatches);
      console.log('Image links:', data.imageLinks);
      
      if (data.sampleSlides?.length > 0) {
        console.log('Sample slide text:', data.sampleSlides[0].text);
      }
      if (data.sampleImageLinks?.length > 0) {
        console.log('Sample image link:', data.sampleImageLinks[0]);
      }
      
    } catch (error) {
      console.log('Error:', error.message);
    }
  }
  
  await browser.close();
  console.log('\nDone!');
})();
