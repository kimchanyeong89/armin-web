const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TARGET_COUNT = 3573; // User specific target
const OUTPUT_FILE = path.resolve(__dirname, '../public/data/basel-collection.json');

async function scrape() {
    console.log('Launching browser...');
    // Use full headful browser if needed, but headless is faster.
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const mainPage = await browser.newPage();
    await mainPage.setViewport({ width: 1440, height: 1000 });

    // Optimization: Block heavy resources on the main navigation page
    await mainPage.setRequestInterception(true);
    mainPage.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });
    
    // 1. Search
    console.log('Navigating to home...');
    await mainPage.goto('https://sammlungonline.kunstmuseumbasel.ch/eMP/eMuseumPlus?service=ExternalInterface&module=collection&lang=de', { waitUntil: 'networkidle2' });

    // The user provided a link with sp=S10053 and sp=S1 (Bild?).
    // The previous test showed the link itself fails (session).
    // So we must RECREATE the search.
    // The link: ...&sp=1&sp=6&sp=3...
    // In eMuseumPlus, field_10303 is "Objektbezeichnung" (Object Type). "1" = Bild (Image/Painting).
    // The link has "sp=S10053". This might be the Artist or Collection ID.
    // "sp=SfieldValue&sp=1&sp=6" -> field 1, value 6? No.
    // Let's stick to "Bild" for now, but ensure we are getting "Paintings with Images".
    // Or we simply scrape ALL paintings.
    // User said "3573 items". That matches "Gemälde" (Paintings) often.
    
    console.log('Selecting "Bild" (Value 1)...');
    await mainPage.select('#field_10303', '1');

    console.log('Submitting search...');
    await Promise.all([
        mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
        mainPage.click('.startButton a')
    ]);

    // LOAD PREVIOUSLY COLLECTED ITEMS (Resume Capability)
    let collectedItems = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            collectedItems = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
            console.log(`Resuming... Loaded ${collectedItems.length} existing items.`);
        } catch (e) {
            console.log('Error reading existing file, starting fresh.');
        }
    }

    let pageNum = 1;
    // Calculate how many items to skip
    let skipCount = collectedItems.length;

    while (collectedItems.length < TARGET_COUNT) {
        console.log(`Processing List Page ${pageNum}...`);
        
        // Wait for list
        await mainPage.waitForSelector('.detailListItem', { timeout: 10000 });

        // Get all detail links on this page
        // We use the timestamp/index based links
        const itemLinks = await mainPage.evaluate(() => {
            return Array.from(document.querySelectorAll('.detailListItem .titleList a'))
                .map(a => a.href);
        });

        console.log(`Found ${itemLinks.length} items on page ${pageNum}.`);

        // RESUME LOGIC: Check if we need to skip this entire page
        if (skipCount >= itemLinks.length) {
            console.log(`Skipping Page ${pageNum} (Already collected).`);
            skipCount -= itemLinks.length; // Deduct this page's items from the skip counter
        } else {
             // We have items to scrape on this page
             const linksToScrape = itemLinks.slice(skipCount);
             if (skipCount > 0) console.log(`Skipping first ${skipCount} items on this page.`);
             skipCount = 0;

            for (const link of linksToScrape) {
                if (collectedItems.length >= TARGET_COUNT) break;

                // Open new tab
                const itemPage = await browser.newPage();
                
                // Optimization for item page: Block images/fonts (we get image from popup later)
                await itemPage.setRequestInterception(true);
            itemPage.on('request', (req) => {
                if (['image', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Copy cookies? Puppeteer shares cookies by default in same browser context.
            
            try {
                // Retry Logic for 503
                let retries = 3;
                let success = false;
                while(retries > 0 && !success) {
                    try {
                        const response = await itemPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        
                        // Check Status or Content
                        const title = await itemPage.title();
                        const content = await itemPage.content();
                        if (content.includes('Service Unavailable') || title.includes('Service Unavailable') || title.includes('503')) {
                            throw new Error('Service Unavailable (Soft 503 detected)');
                        }
                        
                        success = true;
                    } catch (navErr) {
                         // Only log if it's the 503 error, others might be noise
                         if (navErr.message.includes('Service Unavailable') || navErr.message.includes('Timeout')) {
                            console.log(`Navigation issue (${navErr.message}). Retrying in 10s...`);
                            retries--;
                            await new Promise(r => setTimeout(r, 10000));
                         } else {
                            throw navErr; // real error
                         }
                    }
                }
                
                if (!success) throw new Error('Failed to load page after retries (persistent 503)');

                // Scrape Detail
                const itemData = await itemPage.evaluate(() => {
                    const getText = (sel) => document.querySelector(sel)?.innerText.trim() || '';
                    
                    const referenceLink = document.querySelector('.tspReferenceLinkList .tspReferenceLink'); // Artist
                    const titleEl = document.querySelector('.objTitle .mainTitle .tspValue');
                    const dateEl = document.querySelector('.objTitle .mainTitle .normal .tspValue:nth-child(2)'); // roughly
                    
                    const objDataLis = Array.from(document.querySelectorAll('.objData li'));
                    const dimsEl = objDataLis.find(li => li.innerText.includes('cm') || li.innerText.includes('mm'));
                    const invEl = objDataLis.find(li => li.innerText.includes('Inv.'));
                    // Medium is usually the first element, or the one that isn't dims/inv/acquisition
                    const mediumEl = objDataLis.find(li => 
                        !li.innerText.includes('cm') && 
                        !li.innerText.includes('mm') && 
                        !li.innerText.includes('Inv.') && 
                        !li.innerText.includes('Kunstmuseum') && // Acquisition info
                        !li.innerText.includes('Schenkung')
                    );
                    
                    // Get popup URL for clean image
                    const imgLinkEl = document.querySelector('.listImg a');
                    let popupImageUrl = '';
                    if (imgLinkEl) {
                        let href = decodeURIComponent(imgLinkEl.href);
                        const match = href.match(/window\.open\('([^']+)'/);
                        if (match) {
                            popupImageUrl = window.location.origin + match[1];
                        }
                    }

                    // Get direct image (might have margins/low res)
                    const directImgEl = document.querySelector('.listImg img');
                    const directImage = directImgEl ? directImgEl.src : '';
                    
                    // Permalink / Object ID
                    // "Zitierfähige URL anzeigen" link: ...&objectId=2614...
                    const permalinkEl = document.querySelector('li.listBookmark a');
                    let objectId = '';
                    let url = '';
                    
                    if (permalinkEl) {
                        const href = permalinkEl.href;
                        const match = href.match(/objectId=(\d+)/);
                        if (match) {
                            objectId = match[1];
                            url = `https://sammlungonline.kunstmuseumbasel.ch/eMP/eMuseumPlus?service=ExternalInterface&module=collection&objectId=${objectId}&viewType=detailView`;
                        }
                    }

                    // Download Link
                    const downloadLinkEl = document.querySelector('.downloadLink a');
                    const downloadUrl = downloadLinkEl ? downloadLinkEl.href : '';

                    return {
                        title: titleEl ? titleEl.innerText : getText('h1'),
                        artist: referenceLink ? referenceLink.innerText : getText('.artist'),
                        date: dateEl ? dateEl.innerText : '',
                        medium: mediumEl ? mediumEl.innerText : '',
                        dimensions: dimsEl ? dimsEl.innerText : '',
                        inventoryNumber: invEl ? invEl.innerText.replace('Inv.', '').trim() : '',
                        popupImageUrl,
                        directImage,
                        rawUrl: window.location.href,
                        url,
                        objectId,
                        downloadUrl
                    };
                });
                
                // ENHANCEMENT: Fetch clean image from popup (no borders) as requested
                // We reuse itemPage to save resources instead of opening a new tab.
                if (itemData.popupImageUrl) {
                    try {
                        // Navigate the *existing* tab to the popup URL (we don't need to go back)
                        await itemPage.goto(itemData.popupImageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                        
                        const cleanImageUrl = await itemPage.evaluate(() => {
                            // The popup usually has a main image holder
                            const img = document.querySelector('.highResImage img, img');
                            return img ? img.src : '';
                        });
                        
                        if (cleanImageUrl) {
                            itemData.image = cleanImageUrl;
                        } else {
                            console.log('No image found in popup, using direct fallback.');
                            itemData.image = itemData.directImage || '';
                        }
                    } catch (popupErr) {
                        console.error(`Failed to fetch popup image for ${itemData.objectId}:`, popupErr.message);
                        itemData.image = itemData.directImage || ''; // Fallback
                    }
                } else {
                    itemData.image = itemData.directImage || '';
                }

                // Final check (if Title is somehow stuck as Service Unavailable)
                if (itemData.title === 'Service Unavailable') throw new Error('Captured Title is Service Unavailable');
                
                // Polite delay
                await new Promise(r => setTimeout(r, 200));

                /* 
                // Previous slow logic: fetch the clean image from the popup
                // REMOVED / MERGED ABOVE
                */
                
                // Clean up temporary field
                delete itemData.popupImageUrl;
                delete itemData.directImage;
                
                collectedItems.push(itemData);
                console.log(`Collected #${collectedItems.length}: ${itemData.title} (${itemData.objectId})`);

                // Incremental Save (Every 10 items)
                if (collectedItems.length % 10 === 0) {
                     fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedItems, null, 2));
                     console.log('--- Progress Saved ---');
                }

            } catch (err) {
                console.error(`Failed to scrape item ${link}:`, err.message);
            } finally {
                await itemPage.close();
            }
        }
        } // End of Resume/Skip else block

        if (collectedItems.length >= TARGET_COUNT) break;

        // Next Page
        console.log('Going to next page...');
        const nextButton = await mainPage.$('.elementNavigatorNext a');
        if (!nextButton) {
            console.log('No next page found.');
            break;
        }
        
        await Promise.all([
            mainPage.waitForNavigation({ waitUntil: 'networkidle2' }),
            nextButton.click()
        ]);
        pageNum++;
    }

    console.log(`Total collected: ${collectedItems.length}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedItems, null, 2));
    console.log('Done.');
    await browser.close();
}

scrape();