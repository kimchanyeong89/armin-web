
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Intercept network requests
    await page.setRequestInterception(true);
    page.on('request', request => {
        const url = request.url();
        if (url.includes('api') || url.includes('json') || url.includes('solr') || url.includes('search')) {
            console.log('REQ:', url);
        }
        request.continue();
    });

    const targetUrl = 'https://collection.kunsthaus.ch/en/collection/?f=withImages&ff=%7B%22category_en_s%22%3A%5B%22mixed%20genre%22%2C%22painting%22%2C%22photograph%22%2C%22single-channel%20video%22%2C%22time-based%20medium%22%2C%22watercolour%22%2C%22multiple%22%2C%22performance%20art%22%2C%22photomontage%22%2C%22sketchbook%22%2C%22video%20art%22%2C%22object%22%2C%22photo%20collage%22%2C%22portfolio%22%2C%22single%20sheet%20from%20portfolio%22%2C%22textile%22%2C%22video%20installation%22%5D%7D';
    
    console.log('Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });

    // Also take a screenshot of the HTML to see where data is
    // const content = await page.content();
    // console.log(content.substring(0, 1000));

    await browser.close();
})();
