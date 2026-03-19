const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const url = "https://www.kansallisgalleria.fi/en/object/6031738";

    console.log("Navigating to", url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Dump visible text
    const text = await page.evaluate(() => document.body.innerText);
    console.log("Body Text Snippet:", text.substring(0, 500));
    console.log("------------------------------------------------");

    // Check if we can find "tempera"
    console.log("Contains 'tempera'?", text.includes("tempera"));

    await browser.close();
})();
