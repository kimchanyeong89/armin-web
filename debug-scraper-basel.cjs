const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    // Kunstmuseum Basel main collection page
    const targetUrl = 'https://sammlungonline.kunstmuseumbasel.ch/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=en';
    
    console.log(`Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Current URL:', page.url());
    
    
    // Dump inputs to understand the form
    const inputs = await page.$$eval('input, select', els => els.map(e => ({ 
        tag: e.tagName, 
        id: e.id, 
        name: e.name, 
        type: e.type, 
        placeholder: e.placeholder,
        options: e.tagName === 'SELECT' ? Array.from(e.options).map(o => ({ text: o.text, value: o.value })) : undefined 
    })).slice(0, 30));
    console.log('Inputs:', JSON.stringify(inputs, null, 2));


    await browser.close();
})();
