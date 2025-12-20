const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DISPLAY_URLS = {
  'jmw-turner': {
    name: 'JMW Turner',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner',
    rooms: [
      { slug: 'jmw-turner-rise-to-fame', name: 'JMW Turner: Rise to Fame', roomNumber: 'Room 31' },
      { slug: 'turner-and-his-critics', name: 'Turner and his Critics', roomNumber: 'Room 32' },
      { slug: 'cataloguing-turner-bequest', name: "Cataloguing Turner's Bequest", roomNumber: 'Room 33' },
      { slug: 'experiments-on-canvas', name: 'Experiments on Canvas', roomNumber: 'Room 34' },
      { slug: 'the-sea-toil-and-terror', name: 'Toil and Terror at Sea', roomNumber: 'Room 35' },
      { slug: 'travels-in-europe', name: 'Travels in Europe', roomNumber: 'Room 37' },
      { slug: 'john-constable-landscape-and-legacy', name: 'John Constable: Landscape and Legacy', roomNumber: 'Room 38' },
      { slug: 'jmw-turner-on-the-wing', name: 'JMW Turner: On the Wing', roomNumber: 'Room 39' }
    ]
  },
  'historic-early-modern': {
    name: 'Historic and Early Modern British Art',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/historic-early-modern-british-art',
    rooms: [
      { slug: '1545', name: 'Exiles and Dynasties', roomNumber: 'Room 1545' },
      { slug: '1640', name: 'Court versus Parliament', roomNumber: 'Room 1640' },
      { slug: '1720', name: 'Metropolis', roomNumber: 'Room 1720' },
      { slug: '1760-room', name: 'The Exhibition Age', roomNumber: 'Room 1760' },
      { slug: '1780-room', name: 'Revolution', roomNumber: 'Room 1780' },
      { slug: '1810', name: 'The Regency', roomNumber: 'Room 1810' },
      { slug: '1840', name: 'The Victorian Age', roomNumber: 'Room 1840' },
      { slug: '1860', name: 'The Pre-Raphaelites', roomNumber: 'Room 1860' },
      { slug: '1880', name: 'The Aesthetic Movement', roomNumber: 'Room 1880' },
      { slug: '1900', name: 'A New Century', roomNumber: 'Room 1900' },
      { slug: '1910', name: 'Camden Town', roomNumber: 'Room 1910' },
      { slug: '1920', name: 'Between the Wars', roomNumber: 'Room 1920' },
      { slug: '1930', name: 'Surrealism', roomNumber: 'Room 1930' },
      { slug: '1940', name: 'War', roomNumber: 'Room 1940' },
      { slug: 'the-walk-to-the-clore', name: 'Walk to the Clore', roomNumber: '' },
      { slug: 'william-blake', name: 'William Blake', roomNumber: '' }
    ]
  },
  'modern-contemporary': {
    name: 'Modern and Contemporary British Art',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/modern-and-contemporary-british-art',
    rooms: [
      { slug: '19401965', name: 'Fear and Freedom', roomNumber: '' },
      { slug: '19551965', name: 'Construction', roomNumber: '' },
      { slug: 'prunella-clough-urbscapes', name: 'Prunella Clough: Urbscapes', roomNumber: '' },
      { slug: '19601970', name: 'In Full Colour', roomNumber: '' },
      { slug: '19651975', name: 'Expanding Art', roomNumber: '' },
      { slug: '19751990', name: 'Living in the City', roomNumber: '' },
      { slug: '19801995', name: 'Thatcher Years', roomNumber: '' },
      { slug: '19902000', name: 'YBAs', roomNumber: '' },
      { slug: '20002010', name: 'New Millennium', roomNumber: '' },
      { slug: '20102020', name: 'Recent Acquisitions', roomNumber: '' },
      { slug: 'tracey-emin', name: 'Tracey Emin', roomNumber: '' },
      { slug: 'francis-bacon', name: 'Francis Bacon', roomNumber: '' },
      { slug: 'barbara-hepworth', name: 'Barbara Hepworth', roomNumber: '' },
      { slug: 'zineb-sedira', name: 'Zineb Sedira', roomNumber: '' }
    ]
  },
  'art-around-building': {
    name: 'Art Around the Building',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building',
    rooms: [
      { slug: 'martin-boyce', name: 'Martin Boyce', roomNumber: 'Outside' },
      { slug: 'richard-wright-no-title', name: 'Richard Wright: No Title', roomNumber: 'Millbank Foyer' },
      { slug: 'artists-international-first-decade', name: 'Artists International', roomNumber: '' },
      { slug: 'jacob-epstein', name: 'Jacob Epstein', roomNumber: 'Duveen Galleries' }
    ]
  }
};

async function scrapeRoom(page, displayKey, room) {
  const url = `${DISPLAY_URLS[displayKey].baseUrl}/${room.slug}`;
  console.log(`Scraping: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Get room description
    const description = await page.$eval('article p, .content p', el => el?.textContent?.trim() || '').catch(() => '');
    
    // Get artworks
    const artworks = await page.$$eval('section img[alt], .artwork img, [class*="artwork"] img', imgs => {
      return imgs.map(img => {
        const src = img.src || '';
        const alt = img.alt || '';
        return { image: src, title: alt };
      }).filter(a => a.image && a.image.includes('media.tate.org.uk'));
    }).catch(() => []);
    
    // Try alternative artwork extraction
    const artworkDetails = await page.$$eval('section a[href*="/art/artworks/"], .artwork a', links => {
      return links.map(link => {
        const img = link.querySelector('img');
        const text = link.textContent?.trim() || '';
        return {
          url: link.href,
          image: img?.src || '',
          title: text || img?.alt || ''
        };
      }).filter(a => a.image || a.title);
    }).catch(() => []);
    
    return {
      id: `tb-display-${displayKey}-${room.slug}`,
      name: room.name,
      roomNumber: room.roomNumber,
      description: description.slice(0, 500),
      url,
      artworks: artworkDetails.length > 0 ? artworkDetails : artworks
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return {
      id: `tb-display-${displayKey}-${room.slug}`,
      name: room.name,
      roomNumber: room.roomNumber,
      description: '',
      url,
      artworks: []
    };
  }
}

async function scrapeDisplayImage(page, displayKey) {
  const url = DISPLAY_URLS[displayKey].baseUrl;
  console.log(`Getting display image from: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Get main image
    const image = await page.$eval('article img, header img, .hero img, img[src*="media.tate.org.uk"]', img => img.src).catch(() => '');
    return image;
  } catch (error) {
    console.error(`Error getting display image:`, error.message);
    return '';
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const results = {};
  
  for (const [displayKey, display] of Object.entries(DISPLAY_URLS)) {
    console.log(`\n=== Scraping ${display.name} ===\n`);
    
    const displayImage = await scrapeDisplayImage(page, displayKey);
    
    const rooms = [];
    for (const room of display.rooms) {
      const roomData = await scrapeRoom(page, displayKey, room);
      rooms.push(roomData);
      console.log(`  - ${room.name}: ${roomData.artworks.length} artworks`);
    }
    
    results[displayKey] = {
      id: `tate-britain-display-${displayKey}`,
      name: display.name,
      title: display.name,
      description: `Free display at Tate Britain featuring ${rooms.length} rooms of artworks.`,
      startDate: 'Ongoing',
      endDate: '',
      image: displayImage,
      url: display.baseUrl,
      museumName: 'Tate Britain',
      museumLocation: 'Millbank, London SW1P 4RG, United Kingdom',
      rooms
    };
  }
  
  await browser.close();
  
  // Save results
  const outputPath = path.join(__dirname, '..', 'public', 'data', 'tate-britain-displays.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outputPath}`);
  
  // Summary
  console.log('\n=== Summary ===');
  for (const [key, display] of Object.entries(results)) {
    const totalArtworks = display.rooms.reduce((sum, r) => sum + r.artworks.length, 0);
    console.log(`${display.name}: ${display.rooms.length} rooms, ${totalArtworks} artworks`);
  }
}

main().catch(console.error);
