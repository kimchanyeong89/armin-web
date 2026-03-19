const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

(async () => {
    console.log("Checking if Anubis bypass works using Puppeteer...");
    const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const page = await browser.newPage();
    try {
        const testUrl = "https://online-sammlung.hamburger-kunsthalle.de/sites/default/files/multimedia-files/61328.jpg";
        const viewSource = await page.goto(testUrl);
        const buffer = await viewSource.buffer();
        console.log(`Puppeteer downloaded buffer size: ${buffer.length} bytes for image!`);
        
        let meta = await sharp(buffer).metadata();
        console.log(`Image properties -> Width: ${meta.width}, Height: ${meta.height}`);
        
        if (meta.width > 200 && meta.height > 200) {
            console.log("Success! We got the REAL painting using Headless browser, bypassing the anime girl challenge.");
        } else {
            console.log("Warning: Image might still be a placeholder or small icon.");
        }
    } catch(e) {
        console.log("Error fetching:", e.message);
    }
    await browser.close();
})();
