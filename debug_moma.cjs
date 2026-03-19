const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URLS = [
    { cat: 'Painting', url: 'https://www.moma.org/collection/?classifications=6&date_begin=Pre-1850&date_end=2026&with_images=true' },
    { cat: 'Drawing', url: 'https://www.moma.org/collection/?classifications=9&date_begin=Pre-1850&date_end=2026&with_images=true' },
    { cat: 'Sculpture', url: 'https://www.moma.org/collection/?classifications=48&date_begin=Pre-1850&date_end=2026&with_images=true' }
];

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // MOMA typically uses a "Load More" button or infinite scroll, OR pagination.
    // Let's check the first page of one category to see structure.
    
    console.log('Checking MoMA page structure...');
    await page.goto(URLS[0].url, { waitUntil: 'networkidle0' });

    // Check for "Works" grid
    const works = await page.evaluate(() => {
        const items = document.querySelectorAll('.grid-item');
        return Array.from(items).map(i => {
             const title = i.querySelector('.card-title')?.innerText;
             const subtitle = i.querySelector('.card-subtitle')?.innerText;
             const img = i.querySelector('img')?.src;
             return { title, subtitle, img };
        });
    });

    console.log('Found works:', works.length);
    if (works.length > 0) console.log('Sample:', works[0]);

    // Check for hydration data (common in modern apps)
    // MoMA used to just be Rails with server rendered HTML, maybe React now?
    
    await browser.close();
})();
