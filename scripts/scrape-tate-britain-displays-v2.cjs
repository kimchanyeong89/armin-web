const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Display exhibitions to scrape
const DISPLAYS = [
  {
    id: 'tate-britain-display-jmw-turner',
    name: 'JMW Turner',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner',
    image: '/images/tate-britain-displays/tate-britain-jmw-turner.jpg'
  },
  {
    id: 'tate-britain-display-historic-early-modern',
    name: 'Historic and Early Modern British Art',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/historic-early-modern-british-art',
    image: '/images/tate-britain-displays/tate-britain-historic-early-modern.jpg'
  },
  {
    id: 'tate-britain-display-modern-contemporary',
    name: 'Modern and Contemporary British Art',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/modern-and-contemporary-british-art',
    image: '/images/tate-britain-displays/tate-britain-modern-contemporary.jpg'
  },
  {
    id: 'tate-britain-display-art-around-building',
    name: 'Art Around the Building',
    baseUrl: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building',
    image: '/images/tate-britain-displays/tate-britain-art-around-building.jpg'
  }
];

async function scrapeDisplayRooms(page, display) {
  console.log(`\n=== Scraping ${display.name} ===`);
  await page.goto(display.baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Click "Load all rooms" button if exists
  try {
    const loadAllBtn = await page.$('button:has-text("Load all")');
    if (loadAllBtn) {
      await loadAllBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {}

  // Get all room links
  const roomLinks = await page.$$eval('a[href*="/display/"]', links => {
    return links
      .filter(a => a.href.includes('/display/') && a.textContent.includes('Go to room'))
      .map(a => {
        const container = a.closest('div') || a.parentElement;
        const title = container?.querySelector('strong, h3, h4')?.textContent?.trim() || '';
        return { url: a.href, title };
      })
      .filter(r => r.url && r.title);
  });

  // Remove duplicates
  const uniqueRooms = [];
  const seenUrls = new Set();
  for (const room of roomLinks) {
    if (!seenUrls.has(room.url)) {
      seenUrls.add(room.url);
      uniqueRooms.push(room);
    }
  }

  console.log(`Found ${uniqueRooms.length} rooms`);

  const rooms = [];
  for (const room of uniqueRooms) {
    console.log(`  Scraping room: ${room.title}`);
    const roomData = await scrapeRoom(page, room.url, room.title);
    if (roomData.artworks.length > 0) {
      rooms.push(roomData);
    }
  }

  return {
    id: display.id,
    name: display.name,
    title: display.name,
    description: `Free display at Tate Britain featuring ${rooms.length} rooms of artworks.`,
    startDate: 'Ongoing',
    endDate: '',
    image: display.image,
    url: display.baseUrl,
    museumName: 'Tate Britain',
    museumLocation: 'Millbank, London SW1P 4RG, United Kingdom',
    rooms
  };
}

async function scrapeRoom(page, url, roomTitle) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Click "Load more" buttons to get all artworks
  for (let i = 0; i < 5; i++) {
    try {
      const loadMoreBtn = await page.$('button:has-text("Load"), button:has-text("more")');
      if (loadMoreBtn && await loadMoreBtn.isVisible()) {
        await loadMoreBtn.click();
        await page.waitForTimeout(1000);
      } else {
        break;
      }
    } catch (e) { break; }
  }

  // Get room description
  const description = await page.$eval('article > p, .content > p', el => el?.textContent?.trim() || '').catch(() => '');

  // Get artworks with images
  const artworks = await page.$$eval('img[src*="media.tate.org.uk/art/images"]', imgs => {
    return imgs.map(img => {
      const src = img.src || '';
      const alt = img.alt || '';
      const container = img.closest('a') || img.closest('figure') || img.parentElement;
      const link = container?.closest('a')?.href || container?.querySelector('a')?.href || '';
      
      // Extract artwork ID from image URL (e.g., N00458 from .../N/N00/N00458_9.jpg)
      const idMatch = src.match(/\/([A-Z]\d{5})_/i) || src.match(/\/([A-Z]\d+)_/i);
      const artworkId = idMatch ? idMatch[1].toUpperCase() : '';
      
      // Get title and artist from nearby text
      const textContainer = img.closest('figure') || img.closest('div') || img.parentElement?.parentElement;
      const allText = textContainer?.textContent || '';
      
      return {
        id: artworkId,
        image: src,
        title: alt || '',
        url: link,
        rawText: allText.substring(0, 300)
      };
    }).filter(a => a.id && a.image);
  });

  // Get additional artwork info from links
  const linkArtworks = await page.$$eval('a[href*="/art/artworks/"]', links => {
    return links.map(a => {
      const href = a.href || '';
      const text = a.textContent?.trim() || '';
      const img = a.querySelector('img');
      const imgSrc = img?.src || '';
      
      // Extract ID from URL
      const urlMatch = href.match(/artworks\/[^/]+-([a-z]\d+)$/i);
      const artworkId = urlMatch ? urlMatch[1].toUpperCase() : '';
      
      return {
        id: artworkId,
        url: href,
        title: text.replace('More on this artwork', '').trim(),
        image: imgSrc
      };
    }).filter(a => a.id);
  });

  // Merge artwork data
  const artworkMap = new Map();
  
  for (const art of artworks) {
    if (art.id) artworkMap.set(art.id, art);
  }
  
  for (const art of linkArtworks) {
    if (art.id && !artworkMap.has(art.id)) {
      // Build image URL from ID
      const prefix = art.id.charAt(0);
      const mid = art.id.substring(0, 3);
      const imageUrl = `https://media.tate.org.uk/art/images/work/${prefix}/${mid}/${art.id}_10.jpg`;
      artworkMap.set(art.id, { ...art, image: imageUrl });
    } else if (art.id && art.title && artworkMap.get(art.id)?.title === '') {
      const existing = artworkMap.get(art.id);
      artworkMap.set(art.id, { ...existing, title: art.title });
    }
  }

  const finalArtworks = Array.from(artworkMap.values()).map(a => ({
    id: a.id,
    title: a.title || 'Untitled',
    image: a.image,
    url: a.url
  }));

  console.log(`    Found ${finalArtworks.length} artworks`);

  return {
    id: `room-${roomTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: roomTitle,
    description: description.substring(0, 500),
    url,
    artworks: finalArtworks
  };
}

async function fetchArtworkDetails(page, artworkUrl) {
  try {
    await page.goto(artworkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);

    const details = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || '';
      const dateArtist = document.querySelector('h1 + p, .artwork-caption')?.textContent || '';
      
      // Parse "c.1799, More by Joseph Mallord William Turner"
      const dateMatch = dateArtist.match(/(c?\.\s*\d{4}|\d{4})/);
      const artistMatch = dateArtist.match(/(?:More by\s+)?([A-Z][a-z]+ (?:[A-Z][a-z]+ )*[A-Z][a-z]+)/);
      
      const imgEl = document.querySelector('img[src*="media.tate.org.uk"]');
      const image = imgEl?.src || '';

      return {
        title,
        date: dateMatch ? dateMatch[1] : '',
        artist: artistMatch ? artistMatch[1] : '',
        image
      };
    });

    return details;
  } catch (e) {
    return null;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  const allDisplays = [];

  for (const display of DISPLAYS) {
    const displayData = await scrapeDisplayRooms(page, display);
    allDisplays.push(displayData);
    
    // Fetch detailed info for first few artworks of each room
    console.log(`  Fetching artwork details...`);
    for (const room of displayData.rooms) {
      for (const artwork of room.artworks.slice(0, 20)) {
        if (artwork.url && (!artwork.title || artwork.title === 'Untitled')) {
          const details = await fetchArtworkDetails(page, artwork.url);
          if (details) {
            if (details.title) artwork.title = details.title;
            if (details.artist) artwork.artist = details.artist;
            if (details.date) artwork.date = details.date;
            if (details.image) artwork.image = details.image;
          }
        }
      }
    }
  }

  await browser.close();

  // Load existing tate-britain.json and update
  const britainPath = path.join(__dirname, '..', 'public', 'data', 'tate-britain.json');
  const britainJson = JSON.parse(fs.readFileSync(britainPath, 'utf8'));
  
  // Remove old display entries
  britainJson.items = britainJson.items.filter(item => !item.id.startsWith('tate-britain-display-'));
  
  // Add new display entries
  for (const display of allDisplays) {
    britainJson.items.push(display);
  }

  fs.writeFileSync(britainPath, JSON.stringify(britainJson, null, 2));
  console.log(`\nUpdated tate-britain.json`);

  // Summary
  console.log('\n=== Summary ===');
  for (const display of allDisplays) {
    const totalArtworks = display.rooms.reduce((sum, r) => sum + r.artworks.length, 0);
    console.log(`${display.name}: ${display.rooms.length} rooms, ${totalArtworks} artworks`);
  }
}

main().catch(console.error);
