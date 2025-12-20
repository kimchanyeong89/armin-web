/**
 * Fetch descriptions (with embedded images/videos) for all Tate Modern exhibitions
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');

async function main() {
  console.log('Fetching Tate Modern exhibition descriptions...\n');
  
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  
  // Accept cookies first
  try {
    await page.goto('https://www.tate.org.uk', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1000);
    const acceptBtn = await page.$('button:has-text("Accept")');
    if (acceptBtn) {
      await acceptBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (e) {
    console.log('Cookie consent skip...');
  }
  
  let updated = 0;
  
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const url = item.url;
    
    if (!url) {
      console.log(`[${i+1}/${data.items.length}] SKIP - no URL: ${item.title || item.id}`);
      continue;
    }
    
    console.log(`\n[${i+1}/${data.items.length}] ${item.title || item.id}`);
    console.log(`  URL: ${url}`);
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      
      // Scroll to load lazy content
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(1000);
      
      let descriptionHtml = '';
      
      // Different selectors for exhibitions vs displays
      const isDisplay = url.includes('/display/');
      
      if (isDisplay) {
        // Display pages: get the intro text section
        descriptionHtml = await page.evaluate(() => {
          // Look for the descriptive text on display pages
          // Usually in a div after the hero image
          const candidates = [];
          
          // Try specific selectors for display pages
          const richText = document.querySelector('[class*="rich-text"], [class*="RichText"]');
          if (richText && richText.textContent.trim().length > 50) {
            candidates.push(richText.innerHTML);
          }
          
          // Get paragraphs from main content area
          const mainPs = document.querySelectorAll('main p, article p');
          let pContent = '';
          for (const p of mainPs) {
            const text = p.textContent.trim();
            // Skip navigation/search related text
            if (text.includes('Try searching') || text.includes('Cookie') || text.length < 30) continue;
            pContent += p.outerHTML;
            if (pContent.length > 1000) break;
          }
          if (pContent) candidates.push(pContent);
          
          // Return the longest valid candidate
          return candidates.sort((a, b) => b.length - a.length)[0] || '';
        });
      } else {
        // Exhibition pages: look for the exhibition description
        descriptionHtml = await page.evaluate(() => {
          const candidates = [];
          
          // Exhibition pages often have description in specific sections
          // Look for paragraphs that aren't navigation/search related
          const allPs = document.querySelectorAll('p');
          let content = '';
          
          for (const p of allPs) {
            const text = p.textContent.trim();
            // Skip common non-content text
            if (text.includes('Try searching')) continue;
            if (text.includes('Cookie')) continue;
            if (text.includes('Sign up to')) continue;
            if (text.includes('Terms of Service')) continue;
            if (text.includes('Games, quizzes')) continue;
            if (text.includes('for kids')) continue;
            if (text.includes('privacy policy')) continue;
            if (text.includes('reCAPTCHA')) continue;
            if (text.length < 30) continue;
            
            // Check if this looks like exhibition description
            // Usually longer paragraphs with exhibition-related content
            const parent = p.parentElement;
            if (parent) {
              const parentClass = parent.className || '';
              // Skip footer/header/nav areas
              if (parentClass.includes('footer') || parentClass.includes('header') || parentClass.includes('nav')) continue;
            }
            
            content += p.outerHTML;
            if (content.length > 2000) break;
          }
          
          if (content) candidates.push(content);
          
          // Also try to get figures (images) and iframes (videos)
          // Use Set to avoid duplicates
          const seenSrcs = new Set();
          const media = document.querySelectorAll('main figure, main iframe, article figure, article iframe, [class*="article"] figure, [class*="article"] iframe');
          let mediaHtml = '';
          for (const el of media) {
            // Only include if it has valid src and not a duplicate
            const img = el.querySelector('img');
            const iframe = el.tagName === 'IFRAME' ? el : el.querySelector('iframe');
            
            if (img && img.src && !img.src.includes('data:')) {
              // Skip if we've already seen this image
              if (seenSrcs.has(img.src)) continue;
              seenSrcs.add(img.src);
              mediaHtml += el.outerHTML;
            } else if (iframe && iframe.src) {
              // Skip if we've already seen this iframe
              if (seenSrcs.has(iframe.src)) continue;
              seenSrcs.add(iframe.src);
              mediaHtml += iframe.outerHTML;
            }
            // No length limit - get all media
          }
          
          if (mediaHtml && content) {
            return content + mediaHtml;
          }
          
          return candidates[0] || '';
        });
      }
      
      // Clean up the HTML
      descriptionHtml = descriptionHtml
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
      
      // Extract plain text for short description
      const plainText = await page.evaluate((html) => {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent.trim().substring(0, 500);
      }, descriptionHtml);
      
      if (descriptionHtml && descriptionHtml.length > 20) {
        item.descriptionHtml = descriptionHtml;
        item.description = plainText;
        updated++;
        console.log(`  ✓ Description: ${plainText.substring(0, 80)}...`);
        console.log(`  ✓ HTML length: ${descriptionHtml.length} chars`);
      } else {
        console.log(`  ✗ No description found`);
      }
      
      await page.waitForTimeout(500);
      
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }
  
  await browser.close();
  
  // Save
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log(`\n=== Done! Updated ${updated}/${data.items.length} exhibitions ===`);
}

main().catch(console.error);
