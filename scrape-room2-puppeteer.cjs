const puppeteer = require('puppeteer');

async function scrapeRoom2Artworks() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2', { waitUntil: 'networkidle2' });

    // Wait for artworks to load
    await page.waitForSelector('.artwork-item, .painting-item, a[href*="/paintings/"]', { timeout: 10000 });

    const artworks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/paintings/"]'));
      return links.map(link => ({
        title: link.textContent?.trim() || '',
        url: link.href
      })).filter(item => item.title && !item.title.includes('Search') && !item.title.includes('Highlights'));
    });

    return artworks;
  } catch (error) {
    console.error('Error scraping room 2:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeImageUrl(pageUrl) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });

    const imageUrl = await page.evaluate(() => {
      // Look for main artwork image
      const img = document.querySelector('img[data-src], .artwork-image img, .painting-image img');
      if (img) {
        return img.getAttribute('data-src') || img.src;
      }

      // Alternative: look for meta og:image
      const meta = document.querySelector('meta[property="og:image"]');
      return meta ? meta.getAttribute('content') : null;
    });

    return imageUrl;
  } catch (error) {
    console.error(`Error scraping ${pageUrl}:`, error.message);
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('Scraping Room 2 artworks with Puppeteer...');
  const artworks = await scrapeRoom2Artworks();
  console.log(`Found ${artworks.length} artworks`);

  for (const artwork of artworks.slice(0, 5)) { // Limit to 5 for testing
    console.log(`Scraping: ${artwork.title}`);
    const imageUrl = await scrapeImageUrl(artwork.url);
    if (imageUrl) {
      console.log(`${artwork.title}: ${imageUrl}`);
    } else {
      console.log(`No image found for ${artwork.title}`);
    }
  }
}

main();
