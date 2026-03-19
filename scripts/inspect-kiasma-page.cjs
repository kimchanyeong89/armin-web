const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const url = 'https://www.kansallisgalleria.fi/en/object/611183';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // evaluate
    const data = await page.evaluate(() => {
        const results = {};

        // Try DT/DD approach
        const dts = Array.from(document.querySelectorAll('dt'));
        const dtData = dts.map(dt => {
            const dd = dt.nextElementSibling;
            return { label: dt.innerText, value: dd ? dd.innerText : '' };
        });
        results.dtData = dtData;

        // Try getting all links/buttons that might be tags
        // Look for "Sculpture"
        // The pills in screenshot look like links
        const links = Array.from(document.querySelectorAll('a'));
        const linkTexts = links.map(a => ({ text: a.innerText, href: a.href }));
        results.possibleTags = linkTexts.filter(l => l.href.includes('classification') || l.href.includes('search'));

        // Try specific class
        const pillElements = Array.from(document.querySelectorAll('[class*="Keyword"], [class*="Tag"], [class*="Pill"]'));
        results.pills = pillElements.map(e => e.innerText);

        return results;
    });

    console.log(JSON.stringify(data, null, 2));
    await browser.close();
})();
