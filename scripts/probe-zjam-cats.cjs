const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=IsolateOrigins,site-per-process'],
    ignoreHTTPSErrors: true
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    console.log('Navigating to HoldList.aspx...');
    await page.goto('https://www.zjam.org.cn/Site_En/Holding/HoldList.aspx', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await new Promise(r => setTimeout(r, 2000));

    const extractLinks = async () => {
      return page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="classid="]'));
        return links.map(a => {
          const m = a.href.match(/classid=(\d+)/);
          return {
            text: a.innerText.trim(),
            id: m ? parseInt(m[1]) : null,
          };
        });
      });
    };

    console.log('--- Page 1 Categories ---');
    let p1 = await extractLinks();
    p1 = p1.filter(x => x.text && x.id);
    p1.forEach(c => console.log(`${c.id}: ${c.text}`));

    const clicked = await page.evaluate(async () => {
        const as = Array.from(document.querySelectorAll('a'));
        const link = as.find(a => a.innerText.trim() === '2');
        if (link) {
            link.click();
            return true;
        }
        return false;
    });

    if (clicked) {
        console.log('Found Page 2 link, clicking...');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Nav timeout ignored'));
        await new Promise(r => setTimeout(r, 3000));
        
        console.log('--- Page 2 Categories ---');
        const p2 = await extractLinks();
        p2.filter(x => x.text && x.id).forEach(c => console.log(`${c.id}: ${c.text}`));
    } else {
        console.log('Page 2 link not found.');
    }

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
