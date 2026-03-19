const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    
    console.log('Navigating to home...');
    await page.goto('https://sammlungonline.kunstmuseumbasel.ch/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=de', { waitUntil: 'networkidle2' });

    console.log('Selecting "Bild" (Value 1)...');
    try {
        await page.select('#field_10303', '1');
        console.log('Submitting search...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('.startButton a')
        ]);
    } catch (e) {
        console.log('Search interaction failed:', e.message);
        await browser.close();
        return;
    }

    console.log('List loaded. Clicking first item...');
    const firstItem = await page.$('.detailListItem .titleList a');
    if (!firstItem) {
        console.error('No items found (.detailListItem)!');
        await browser.close();
        return;
    }
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        firstItem.click()
    ]);
    
    console.log('Detail page loaded. Extracting...');
    
    const data = await page.evaluate(() => {
        const directImgEl = document.querySelector('.listImg img');
        const imgLinkEl = document.querySelector('.listImg a'); // Popup link
        const downloadLinkEl = document.querySelector('.downloadLink a');
        
        let popupUrl = '';
        if (imgLinkEl) {
            let href = decodeURIComponent(imgLinkEl.href);
            const match = href.match(/window\.open\('([^']+)'/);
            if (match) {
                popupUrl = window.location.origin + match[1];
            }
        }

        return {
            directSrc: directImgEl ? directImgEl.src : 'null',
            popupUrl: popupUrl || 'null',
            downloadUrl: downloadLinkEl ? downloadLinkEl.href : 'null',
            title: document.title
        };
    });
    
    console.log('DATA:', JSON.stringify(data, null, 2));

    if (data.popupUrl && data.popupUrl !== 'null') {
        console.log('Visiting popup:', data.popupUrl);
        const popupPage = await browser.newPage();
        
        try {
            await popupPage.goto(data.popupUrl, { waitUntil: 'domcontentloaded' });
            const popupImg = await popupPage.evaluate(() => {
                const img = document.querySelector('.highResImage img') || document.querySelector('img'); 
                return img ? img.src : 'null';
            });
            console.log('POPUP IMG SRC:', popupImg);
        } catch (e) {
            console.log('Popup navigation failed:', e.message);
        }
        await popupPage.close();
    }
    
    await browser.close();
})();
