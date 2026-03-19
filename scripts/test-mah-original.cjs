const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET_COUNT = 5; // Minimal test
const SEARCH_BASE_URL = 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=collections%3A57484';

async function scrape() {
    console.log('Starting Test Original Scraper...');
    
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    try {
        const collectedUrls = [];
        let pageIndex = 0;

        while (collectedUrls.length < TARGET_COUNT) {
            const listUrl = `${SEARCH_BASE_URL}&page=${pageIndex}`;
            console.log(`Fetching Search Page ${pageIndex}: ${listUrl}`);
            
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Check content
            const html = await page.content();
            if (html.includes('Erreur 500')) {
                 console.log('Saw 500 Error!');
                 fs.writeFileSync('debug-mah-original.html', html);
                 break;
            }

            const newUrls = await page.evaluate(() => {
                const settings = document.querySelector('[data-drupal-selector="drupal-settings-json"]');
                if (!settings) return [];
                try {
                    const json = JSON.parse(settings.textContent);
                    if (json.artwork_navigator && json.artwork_navigator.search_results) {
                        return json.artwork_navigator.search_results.map(item => item.url);
                    }
                } catch (e) { return []; }
                return [];
            });

            console.log(`Found ${newUrls.length} items on page ${pageIndex}`);
            break; // Stop after one page
        }
    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}
scrape();