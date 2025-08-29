const { chromium } = require('playwright');

async function scrapeRoom2Artworks() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('Loading National Gallery Room 2 page...');
    await page.goto('https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2', {
      waitUntil: 'networkidle'
    });

    // Wait for artworks to load
    await page.waitForTimeout(3000);

    // Extract artwork information from the page
    const artworks = await page.evaluate(() => {
      const artworkElements = document.querySelectorAll('[data-testid="artwork-card"], .artwork-card, .room-artwork, [class*="artwork"]');
      const results = [];

      artworkElements.forEach((element, index) => {
        try {
          // Try different selectors for artwork information
          const titleElement = element.querySelector('h3, .title, [data-testid="artwork-title"], .artwork-title');
          const artistElement = element.querySelector('.artist, [data-testid="artwork-artist"], .artwork-artist');
          const linkElement = element.querySelector('a[href*="/artworks/"]');

          if (titleElement && artistElement) {
            const title = titleElement.textContent?.trim();
            const artist = artistElement.textContent?.trim();
            const link = linkElement?.href;

            if (title && artist && link) {
              results.push({
                name: title,
                artist: artist,
                url: link,
                index: index + 1
              });
            }
          }
        } catch (error) {
          console.log('Error parsing artwork element:', error);
        }
      });

      return results;
    });

    console.log(`Found ${artworks.length} artworks on Room 2 page:`);
    artworks.forEach((artwork, index) => {
      console.log(`${index + 1}. ${artwork.name} - ${artwork.artist}`);
      console.log(`   URL: ${artwork.url}`);
      console.log('');
    });

    return artworks;

  } catch (error) {
    console.error('Error scraping Room 2:', error);
    return [];
  } finally {
    await browser.close();
  }
}

scrapeRoom2Artworks().catch(console.error);
