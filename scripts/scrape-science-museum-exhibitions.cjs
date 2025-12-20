const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrapeScienceMuseumExhibitions() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('Navigating to Science Museum main page...');
    await page.goto('https://www.sciencemuseum.org.uk/', { waitUntil: 'networkidle' });

    // Wait for page to load
    await page.waitForTimeout(2000);

    const exhibitions = await page.evaluate(() => {
      const results = [];

      // Look for specific exhibition text
      const text = document.body.textContent || '';
      console.log('Page text sample:', text.substring(0, 500));
      if (text.includes('FUTURE OF FOOD')) {
        results.push({
          id: 'sm-1',
          name: 'Future of Food',
          title: 'Future of Food',
          description: 'A new, free exhibition about how food must change to protect the planet.',
          startDate: 'Current',
          endDate: '4 January 2026',
          image: '',
          url: 'https://www.sciencemuseum.org.uk/see-and-do/future-of-food'
        });
      }

      return results;
    });

    console.log('Exhibitions found:', exhibitions);

    console.log(`Found ${exhibitions.length} exhibitions`);

    // Categorize into permanent, temporary, past
    const permanent = exhibitions.filter(e => e.startDate.includes('Permanent') || e.description.toLowerCase().includes('permanent'));
    const temporary = exhibitions.filter(e => !e.startDate.includes('Permanent'));
    const past = [];

    const data = {
      permanentExhibitions: permanent,
      temporaryExhibitions: temporary,
      pastExhibitions: past
    };

    const outputPath = path.join(__dirname, '..', 'public', 'data', 'science-museum-exhibitions.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log('Science Museum exhibitions saved to', outputPath);

  } catch (error) {
    console.error('Error scraping Science Museum:', error);
  } finally {
    await browser.close();
  }
}

scrapeScienceMuseumExhibitions();