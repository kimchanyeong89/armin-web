const { chromium } = require('playwright');

async function scrapeRoom2Artworks() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to Room 2 page...');
    await page.goto('https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2', { waitUntil: 'domcontentloaded' });

    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);

    // Try to find artwork links
    const artworks = await page.evaluate(() => {
      const links = [];

      // Look for various selectors that might contain artwork links
      const selectors = [
        'a[href*="/paintings/"]',
        '.artwork-link a',
        '.painting-link a',
        '.room-artwork a',
        'a[href*="paintings"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(elem => {
          const href = elem.getAttribute('href');
          const text = elem.textContent?.trim();
          if (href && text && href.includes('/paintings/') && text.length > 3) {
            const fullUrl = href.startsWith('http') ? href : `https://www.nationalgallery.org.uk${href}`;
            links.push({ title: text, url: fullUrl });
          }
        });
      }

      // Remove duplicates
      const unique = links.filter((item, index, self) =>
        index === self.findIndex(t => t.url === item.url)
      );

      return unique;
    });

    console.log(`Found ${artworks.length} potential artworks`);
    return artworks;
  } catch (error) {
    console.error('Error scraping room 2:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeImageUrl(pageUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`Scraping image from: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const imageUrl = await page.evaluate(() => {
      // Try multiple selectors for the main artwork image
      const selectors = [
        'img[data-src]',
        '.artwork-image img',
        '.painting-image img',
        '.main-image img',
        'img[alt*="painting"]',
        'img[alt*="artwork"]',
        'meta[property="og:image"]'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          if (selector.includes('meta')) {
            return element.getAttribute('content');
          } else {
            return element.getAttribute('data-src') || element.src;
          }
        }
      }

      return null;
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
  console.log('Starting Room 2 artwork scraping with Playwright...');

  const artworks = await scrapeRoom2Artworks();

  if (artworks.length === 0) {
    console.log('No artworks found. Trying alternative approach...');
    // Try to get the page HTML and parse it
    const { execSync } = require('child_process');
    try {
      const html = execSync('curl -s "https://www.nationalgallery.org.uk/visiting/floorplans/level-2/room-2"', { encoding: 'utf8' });
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);

      const links = [];
      $('a[href*="/paintings/"]').each((i, elem) => {
        const href = $(elem).attr('href');
        const text = $(elem).text().trim();
        if (href && text && text.length > 3) {
          const fullUrl = href.startsWith('http') ? href : `https://www.nationalgallery.org.uk${href}`;
          links.push({ title: text, url: fullUrl });
        }
      });

      console.log(`Found ${links.length} artworks via curl`);
      artworks.push(...links);
    } catch (e) {
      console.error('Alternative approach failed:', e.message);
    }
  }

  // Process first 5 artworks
  const results = [];
  for (let i = 0; i < Math.min(5, artworks.length); i++) {
    const artwork = artworks[i];
    console.log(`\nProcessing ${i + 1}/${Math.min(5, artworks.length)}: ${artwork.title}`);

    const imageUrl = await scrapeImageUrl(artwork.url);
    if (imageUrl) {
      console.log(`✓ Image found: ${imageUrl}`);
      results.push({
        id: artwork.url.split('/').pop().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
        name: artwork.title,
        artist: 'Unknown', // Will need to extract from page
        image: imageUrl,
        roomId: '2',
        exhibitionTitle: 'European Paintings',
        exhibitionId: 'ng-1',
        sourceUrl: artwork.url
      });
    } else {
      console.log(`✗ No image found`);
    }
  }

  // Save results to file
  const fs = require('fs');
  fs.writeFileSync('room2-artworks.json', JSON.stringify(results, null, 2));
  console.log(`\nSaved ${results.length} artworks to room2-artworks.json`);

  // Also update the upload script
  if (results.length > 0) {
    const uploadScript = `#!/usr/bin/env node
// Upload Room 2 artworks to Firestore

const admin = require('firebase-admin');
const fs = require('fs');

// Service account JSON path
const serviceAccountPath = '/Users/kietzsche/Downloads/armin-web-firebase-adminsdk-fbsvc-ee83756740.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'armin-web'
});

const db = admin.firestore();

const room2Data = ${JSON.stringify(results, null, 2)};

async function upload() {
  console.log('Uploading Room 2 artworks to Firestore...');
  for (const item of room2Data) {
    await db.collection('artworks').doc(item.id).set(item, { merge: true });
    console.log('Saved:', item.id);
  }
  console.log('All Room 2 artworks uploaded successfully!');
}

upload().catch(err => {
  console.error('Error uploading:', err);
  process.exit(1);
});
`;

    fs.writeFileSync('upload-room2-updated.cjs', uploadScript);
    console.log('Created upload-room2-updated.cjs script');
  }
}

main().catch(console.error);
