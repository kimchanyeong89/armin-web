const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const BASE_URL = 'https://fine-arts-museum.be/fr/la-collection';

async function checkCounts() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  console.log('Navigating to collection page...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // 1. Get General Count
  const bodyText = await page.evaluate(() => document.body.innerText);
  const countMatch = bodyText.match(/recense actuellement plus de ([\d\s\.]+)/);
  if (countMatch) {
      console.log(`Global Online Count Text: ${countMatch[0]}`);
  }

  // 2. Try to find "Peinture" count
  // Look for search input
  console.log('Searching for "Peinture"...');
  const searchInputSelector = 'input[type="text"][name="search_term"]'; // Guessing selector, let's check generic input
  
  // Try to find search form
  // From previous context: <input type="text" class="main" placeholder="Wyszukaj..." ...> was Wawel. 
  // Fine Arts BE context showed: 
  // ## Œuvres \n #### RECHERCHER \n OK
  
  // Let's inspect the page structure for search
  const filters = await page.evaluate(() => {
      // Look for any sidebar links or checkboxes that mention "Peinture"
      const elements = Array.from(document.querySelectorAll('a, label, button'));
      return elements
        .filter(el => el.innerText.toLowerCase().includes('peinture'))
        .map(el => ({ text: el.innerText, tag: el.tagName, href: el.href }));
  });
  
  console.log('Potential "Peinture" filters:', filters.slice(0, 5));

  // If there is a search box, try using it
  // Selector based on common patterns or previous read
  // Let's try to type into the search box if we find one
  
  // Actually, let's just try to navigate to a search URL if we can guess it
  // https://fine-arts-museum.be/fr/la-collection?search_term=Peinture&submit=OK ?
  
  // Let's try to fetch the page with "Peinture" query
  const searchUrl = 'https://fine-arts-museum.be/fr/la-collection?search_query=Peinture';
  console.log(`Navigating to ${searchUrl}...`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  
  // Check if we get a count
  const bodyTextSearch = await page.evaluate(() => document.body.innerText);
  // Often search results say "X results found"
  // Look for numbers near "résultat" or "œuvres"
  
  // Let's dump the first few lines of text or look for specific count patterns
  const searchCountMatch = bodyTextSearch.match(/(\d+)\s+résultat/i) || bodyTextSearch.match(/(\d+)\s+œuvres/i);
  if (searchCountMatch) {
      console.log(`Search "Peinture" Count: ${searchCountMatch[0]}`);
  } else {
      console.log('Could not find explicit count for "Peinture" search.');
  }

  await browser.close();
}

checkCounts();
