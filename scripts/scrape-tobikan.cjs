const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const URL = 'https://www.tobikan.jp/en/archives/collection.html';
const OUTPUT_FILE = path.join(__dirname, '../public/data/tobikan-collection.json');

async function scrape() {
  console.log(`Fetching ${URL}...`);
  const response = await fetch(URL);
  const html = await response.text();
  const $ = cheerio.load(html);

  const items = [];
  const imageSet = new Set();
  
  // The items are in <li> elements containing a header div and a content div
  // The structure seems to be:
  // <ul>
  //   <li>
  //      <div class="expand-btn ..."> ...metadata... </div>
  //      <div class="expand-box ..."> ...image... </div>
  //   </li>
  // </ul>
  
  $('li').each((i, li) => {
    const $li = $(li);
    const $btn = $li.find('.expand-btn');
    const $box = $li.find('.expand-box');

    // Skip list headers or empty lis
    if ($btn.length === 0) return;

    // Metadata extraction
    // Text usually starts with "1. Artist Name", need to clean the number.
    let artist = $btn.find('p[class*="-artist"]').text().trim();
    const title = $btn.find('p[class*="-title"]').text().trim();
    const date = $btn.find('p[class*="-year"]').text().trim();
    let material = $btn.find('p[class*="-material"]').text().trim();
    let category = $btn.find('p[class*="-category"]').text().trim();

    // Cleaning artist name: "1. IGARASHI Haruo" -> "IGARASHI Haruo"
    // Also "12/13. Joseph-Antoine BERNARD"
    artist = artist.replace(/^[\d\/]+\.\s*/, '');

    // Image extraction
    // src="../../media/img/archives/collection_01.jpg?211007"
    let imgRel = $box.find('img').attr('src');
    let imageUrl = '';
    
    if (imgRel) {
      // Resolve path relative to https://www.tobikan.jp/en/archives/collection.html
      // ../../media -> https://www.tobikan.jp/media
      // or just manual replace
      // base is /en/archives/
      // ../../ goes to root
      // so ../../media is /media
      const cleanRel = imgRel.split('?')[0]; // remove query param
      if (cleanRel.startsWith('../../')) {
        imageUrl = 'https://www.tobikan.jp' + cleanRel.replace('../..', '');
      } else {
        imageUrl = new URL(cleanRel, 'https://www.tobikan.jp/en/archives/').href;
      }
    }

    // Default category if missing (Calligraphy section might not have it explicitly in the summary row?)
    // In the HTML I saw earlier:
    // Calligraphy headers: Artist, Title, Date, Materials... Category is empty in header row?
    // <p class="-category"></p> is empty in header row for calligraphy.
    // I might need to infer it from the Section Title if empty?
    // The previous section h3 was "Sculpture & Relief".
    // This section h3 is "List of Calligraphic Works".
    
    if (!category) {
       // Check previous header? This is hard in .each loop if not tracking structure.
       // However, the calligraphic works are likely "Calligraphy"
       // The HTML example for calligraphy item:
       // <p class="-category"></p> is missing inside the btn div?
       // Let's check the HTML output again.
       // The header row for calligraphy has <p class="-category"></p> but it's empty.
       // I can assume if category is empty, it's Calligraphy, or try to find relevant section.
       // But wait, the first section items explicitly had <p class="-category">Sculpture</p>.
       category = 'Calligraphy'; // fallback
    }

    if (material.toLowerCase().includes('sculpture')) category = 'Sculpture'; // Just in case

    if (artist && title) {
        // Generate a unique ID (the site doesn't provide one, maybe slugify title+artist)
        // Or usage of index is fine if list is static.
        // Let's use a simple hash or slug.
        const id = `tobikan-${items.length + 1}`;
        
        // Clean material (sometimes has " Materials and Techniques..." in header)
        if (material.includes('Materials and Techniques')) return; // Header row detection fallback

        items.push({
          id,
          title,
          artist,
          date,
          material,
          category,
          imageUrl,
          source: 'Tokyo Metropolitan Art Museum'
        });
    }
  });

  console.log(`Found ${items.length} items.`);
  
  if (items.length > 0) {
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
    console.log(`Saved to ${OUTPUT_FILE}`);
  }
}

scrape().catch(console.error);
