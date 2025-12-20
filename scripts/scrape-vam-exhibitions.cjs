const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeVAMExhibitions() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to V&A exhibitions page...');
    await page.goto('https://www.vam.ac.uk/whatson', { waitUntil: 'networkidle' });

    // Wait for page to load
    await page.waitForTimeout(2000);

    const exhibitions = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/exhibitions/"]');
      const results = [];

      links.forEach((link) => {
        const href = link.href;
        const text = link.textContent.trim();
        if (text && href.includes('/exhibitions/')) {
          // Extract title, dates, venue from text
          const titleMatch = text.match(/Exhibition\s+(.+?)\s+Closes/);
          const title = titleMatch ? titleMatch[1].trim() : text.split(' Closes')[0].replace(/^(Exhibition|Display)\s*/, '').trim();
          const dateMatch = text.match(/Closes\s+(.+?)\s+V&A/);
          const endDate = dateMatch ? dateMatch[1].trim() : '';
          const venueMatch = text.match(/V&A\s+(.+?)\s/);
          const venue = venueMatch ? venueMatch[1].trim() : '';

          const imageEl = link.querySelector('img');
          const image = imageEl ? imageEl.src : '';

          if (title && !results.some(r => r.title === title)) {
            results.push({
              id: `vam-${results.length + 1}`,
              name: title,
              title: title,
              description: `Exhibition at V&A ${venue}`,
              startDate: 'Current',
              endDate: endDate,
              image: image,
              url: href
            });
          }
        }
      });

      return results;
    });

    console.log(`Found ${exhibitions.length} exhibitions`);

    // Categorize into permanent, temporary, past
    const permanent = exhibitions.filter(e => e.startDate.includes('Permanent') || e.description.toLowerCase().includes('permanent'));
    const temporary = exhibitions.filter(e => !e.startDate.includes('Permanent') && e.endDate);
    const past = exhibitions.filter(e => e.endDate && new Date(e.endDate) < new Date());

    const data = {
      permanentExhibitions: permanent,
      temporaryExhibitions: temporary,
      pastExhibitions: past
    };

    const outputPath = path.join(__dirname, '..', 'public', 'data', 'vam-exhibitions.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log('V&A exhibitions saved to', outputPath);

  } catch (error) {
    console.error('Error scraping V&A:', error);
  } finally {
    await browser.close();
  }
}

scrapeVAMExhibitions();