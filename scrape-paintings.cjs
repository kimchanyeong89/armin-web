const { chromium } = require('playwright');

async function scrapeImageFromUrl(paintingUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log(`Visiting: ${paintingUrl}`);
    await page.goto(paintingUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(8000); // Wait longer for images to load

    // Try to scroll down to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      // First, let's see all images on the page
      const allImages = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        dataSrc: img.getAttribute('data-src'),
        alt: img.alt,
        class: img.className,
        id: img.id,
        width: img.width,
        height: img.height
      }));

      console.log('All images found:', allImages);

      // Try to find the main artwork image with more specific selectors
      const imgSelectors = [
        'img[data-src]',
        '.artwork-image img',
        '.painting-image img',
        '.main-image img',
        '.hero-image img',
        '#main-image img',
        '.image-container img',
        'img[alt*="painting"]',
        'img[alt*="artwork"]',
        'img[alt*="Manchester"]',
        'img[alt*="Lazarus"]',
        'img[alt*="Leda"]',
        'img[alt*="Dream"]',
        'img[alt*="Holy"]',
        'img[src*="nationalgallery"]',
        'img[src*="NG"]',
        'img[src*="paintings"]',
        'img[src*="media"]'
      ];

      for (const selector of imgSelectors) {
        const imgs = document.querySelectorAll(selector);
        for (const img of imgs) {
          const src = img.getAttribute('data-src') || img.src;
          if (src && src.includes('nationalgallery.org.uk') && !src.includes('icon') && !src.includes('svg') && !src.includes('logo') && src.includes('media/')) {
            // Extract additional info
            const title = document.title || '';
            const date = extractDate();
            const dimension = extractDimension();

            return {
              imageUrl: src,
              title: title,
              alt: img.alt || '',
              selector: selector,
              date: date,
              dimension: dimension
            };
          }
        }
      }

      // Try meta tags
      const metaImage = document.querySelector('meta[property="og:image"]');
      if (metaImage) {
        const content = metaImage.getAttribute('content');
        if (content && content.includes('nationalgallery.org.uk') && !content.includes('icon')) {
          const title = document.title || '';
          const date = extractDate();
          const dimension = extractDimension();

          return {
            imageUrl: content,
            title: title,
            alt: '',
            selector: 'meta',
            date: date,
            dimension: dimension
          };
        }
      }

      function extractDate() {
        // Look for date in various formats
        const dateSelectors = [
          '.date',
          '.year',
          '.creation-date',
          '[data-label*="Date"]',
          '[data-label*="Year"]'
        ];

        for (const selector of dateSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element.textContent?.trim();
          }
        }

        // Look in structured data
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent || '');
            if (data.dateCreated) return data.dateCreated;
          } catch (e) {}
        }

        return '';
      }

      function extractDimension() {
        // Look for dimension info
        const dimSelectors = [
          '.dimensions',
          '.size',
          '.measurement',
          '[data-label*="Dimension"]',
          '[data-label*="Size"]'
        ];

        for (const selector of dimSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element.textContent?.trim();
          }
        }

        return '';
      }

      return null;
    });

    if (result && result.debug) {
      console.log(`All images on ${paintingUrl}:`, JSON.stringify(result.debug.slice(0, 10), null, 2));
      return null;
    }

    if (result) {
      console.log(`Found result for ${paintingUrl}:`, result);
      // Also log all images for debugging
      const allImages = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          dataSrc: img.getAttribute('data-src'),
          alt: img.alt,
          class: img.className,
          id: img.id
        }));
      });
      console.log(`All images on ${paintingUrl}:`, JSON.stringify(allImages, null, 2));
    } else {
      console.log(`No result for ${paintingUrl}`);
    }

    return result;
  } catch (error) {
    console.error(`Error scraping ${paintingUrl}:`, error.message);
    return null;
  } finally {
    await browser.close();
  }
}

async function main() {
const urls = [
  'https://www.nationalgallery.org.uk/paintings/NG2906',
  'https://www.nationalgallery.org.uk/paintings/NG1943',
  'https://www.nationalgallery.org.uk/paintings/NG2907'
];  const results = [];

  for (const url of urls) {
    const result = await scrapeImageFromUrl(url);
    if (result) {
      console.log(`✓ Found image: ${result.imageUrl}`);
      results.push({
        url: url,
        ...result
      });
    } else {
      console.log(`✗ No image found for: ${url}`);
    }
  }

  // Save results
  const fs = require('fs');
  fs.writeFileSync('painting-images.json', JSON.stringify(results, null, 2));
  console.log(`\nSaved ${results.length} results to painting-images.json`);

  // Generate updated upload script
  if (results.length > 0) {
    const artworks = results.map((r, i) => ({
      id: `room2-${i + 1}`,
      name: r.title.split(' | ')[0] || `Artwork ${i + 1}`,
      artist: r.title.split(' - ')[0] || 'Unknown',
      image: r.imageUrl,
      roomId: '2',
      exhibitionTitle: 'European Paintings',
      exhibitionId: 'ng-1',
      sourceUrl: r.url,
      createdAt: new Date().toISOString()
    }));

    const uploadScript = `#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccountPath = '/Users/kietzsche/Downloads/armin-web-firebase-adminsdk-fbsvc-ee83756740.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'armin-web'
});

const db = admin.firestore();

const room2Data = ${JSON.stringify(artworks, null, 2)};

async function upload() {
  console.log('Uploading Room 2 artworks to Firestore...');
  for (const item of room2Data) {
    await db.collection('artworks').doc(item.id).set(item, { merge: true });
    console.log('Saved:', item.id);
  }
  console.log('All Room 2 artworks uploaded successfully!');
}

upload().catch(console.error);
`;

    fs.writeFileSync('upload-room2-final.cjs', uploadScript);
    console.log('Created upload-room2-final.cjs script');
  }
}

main().catch(console.error);
