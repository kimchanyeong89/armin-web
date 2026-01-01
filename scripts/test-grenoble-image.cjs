#!/usr/bin/env node
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const testUrl = "https://www.navigart.fr/grenoble/artwork/emile-gilioli-babet";
  
  console.log("Testing:", testUrl);
  await page.goto(testUrl, { waitUntil: "load", timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.content();
  
  // Try different patterns
  const patterns = [
    /https:\/\/images\.navigart\.fr\/\d+\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Z0-9]+\.jpg/gi,
    /https:\/\/images\.navigart\.fr\/[^"'\s]+\.jpg/gi,
    /images\.navigart\.fr[^"'\s]+/gi
  ];
  
  for (const p of patterns) {
    const matches = html.match(p);
    console.log("Pattern:", p.source.substring(0, 40) + "...");
    console.log("Matches:", matches ? matches.slice(0, 3) : "none");
    console.log("");
  }
  
  await browser.close();
})();
