const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const dataPath = path.join(__dirname, '../public/data/marmottan-collection.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let changed = 0;
  for (const obj of data.objects) {
    if (obj.title && obj.title.match(/^\d{4}\s*[;\-]\s*\d{4}$/)) {
      console.log(`Fixing: ${obj.artist} | ${obj.title} | ${obj.year}`);
      const realTitle = obj.year;
      obj.title = realTitle;
      obj.year = '';

      if (obj.detailUrl) {
        try {
          await page.goto(obj.detailUrl, { waitUntil: 'domcontentloaded' });
          const text = await page.evaluate(() => {
            const el = document.querySelector('.main-content') || document.querySelector('.notice-details') || document.body;
            // Let's just find anything matching 4 digits for the year
            // It's safer if we find specific fields, but let's grab text
            return el.innerText;
          });
          
          if (text) {
             const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
             
             // Look for a year just after the title or elsewhere
             for(let l of lines) {
                if (l.match(/^(14|15|16|17|18|19)\d{2}$/)) {
                   obj.year = l;
                }
             }
          }
          console.log(`-> New Title: ${obj.title}, New Year: ${obj.year}`);
          changed++;
        } catch(e) {
          console.error(e.message);
        }
      }
    }
  }

  await browser.close();

  if (changed > 0) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    console.log(`Fixed ${changed} items. Saved to ${dataPath}`);
  }
}
main();
