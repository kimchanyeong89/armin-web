const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const url = 'https://artsandculture.google.com/asset/the-lantern-bearers/5AH_BltdeMfSVA';
    
    await page.goto(url, { waitUntil: 'networkidle' });
    
    // Dump full text
    const text = await page.evaluate(() => document.body.innerText);
    console.log('--- TEXT CONTENT ---');
    console.log(text.slice(0, 2000)); // First 2000 chars

    // Dump HTML
    const html = await page.content();
    fs.writeFileSync('crystal-gac-probe.html', html);
    
    // Try to find specific sections
    const metadata = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const lines = bodyText.split('\n');
        
        const debug = [];
        const findValue = (label) => {
            const re = new RegExp(`^${label}[:\\s]*(.*)`, 'i');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const match = line.match(re);
                if (match && line.toLowerCase().startsWith(label.toLowerCase())) {
                    debug.push(`Matched ${label} at line ${i}: "${line}"`);
                    if (match[1] && match[1].trim()) {
                        let val = match[1].trim();
                        if (val.startsWith(':')) val = val.substring(1).trim();
                        return val;
                    }
                    if (lines[i+1]) return lines[i+1].trim();
                }
            }
            return '';
        };

        return {
            medium: findValue('Medium'),
            material: findValue('Material'),
            artist: findValue('Creator'),
            debug,
            sampleLines: lines.slice(0, 50)
        };
    });
    
    console.log('--- METADATA PROBE ---');
    console.log(metadata);


    await browser.close();
})();
