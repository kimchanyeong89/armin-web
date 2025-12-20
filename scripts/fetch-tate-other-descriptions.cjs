/**
 * Fetch descriptions for Tate Britain, Liverpool, St Ives exhibitions
 * Similar to fetch-tate-descriptions.cjs but for other Tate galleries
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WHATS_ON_URL = 'https://www.tate.org.uk/whats-on?date_range=from_now&event_type=display&event_type=exhibition&event_type=film&gallery_group=tate-britain&gallery_group=tate-liverpool&gallery_group=tate-st-ives';

async function run() {
  console.log('Fetching Tate Britain/Liverpool/St Ives exhibition descriptions...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  // First, get the list of exhibitions from the main page
  console.log('Loading exhibitions list...');
  await page.goto(WHATS_ON_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Click "Load more" to get all exhibitions
  for (let i = 0; i < 3; i++) {
    try {
      const loadMoreBtn = await page.$('button:has-text("Load"), a:has-text("Load more")');
      if (loadMoreBtn) {
        await loadMoreBtn.click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      break;
    }
  }
  
  // Extract all exhibition links
  const exhibitions = await page.evaluate(() => {
    const links = [];
    const seen = new Set();
    
    // Find all exhibition links
    const allLinks = document.querySelectorAll('a[href*="/whats-on/tate-britain"], a[href*="/whats-on/tate-liverpool"], a[href*="/whats-on/tate-st-ives"], a[href*="/visit/tate-britain/display"], a[href*="/visit/tate-liverpool/display"], a[href*="/visit/tate-st-ives"]');
    
    for (const link of allLinks) {
      const href = link.href;
      // Skip if already seen or if it's just the gallery page
      if (seen.has(href)) continue;
      if (href.match(/\/visit\/tate-(britain|liverpool|st-ives)\/?$/)) continue;
      if (href.match(/\/whats-on\?/)) continue;
      
      seen.add(href);
      
      // Determine gallery
      let gallery = 'unknown';
      if (href.includes('tate-britain')) gallery = 'tate-britain';
      else if (href.includes('tate-liverpool')) gallery = 'tate-liverpool';
      else if (href.includes('tate-st-ives')) gallery = 'tate-st-ives';
      
      // Get title from link text or heading
      const heading = link.querySelector('h2, h3, h4');
      const title = heading ? heading.textContent.trim() : link.textContent.trim().split('\n')[0];
      
      if (title && title.length > 2) {
        links.push({ url: href, title, gallery });
      }
    }
    
    return links;
  });
  
  console.log(`Found ${exhibitions.length} exhibitions\n`);
  
  // Group by gallery
  const byGallery = {
    'tate-britain': [],
    'tate-liverpool': [],
    'tate-st-ives': []
  };
  
  for (const ex of exhibitions) {
    if (byGallery[ex.gallery]) {
      byGallery[ex.gallery].push(ex);
    }
  }
  
  // Process each gallery
  for (const [galleryId, items] of Object.entries(byGallery)) {
    if (items.length === 0) continue;
    
    console.log(`\n=== ${galleryId.toUpperCase()} (${items.length} exhibitions) ===\n`);
    
    const jsonPath = path.join(__dirname, '..', 'public', 'data', `${galleryId}.json`);
    let data = { items: [], scrapedAt: new Date().toISOString() };
    
    // Try to load existing data
    try {
      if (fs.existsSync(jsonPath)) {
        data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (!Array.isArray(data.items)) data.items = [];
      }
    } catch (e) {
      console.log(`  Creating new ${galleryId}.json`);
    }
    
    let updated = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`[${i + 1}/${items.length}] ${item.title}`);
      console.log(`  URL: ${item.url}`);
      
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
        
        // Extract description HTML
        const descriptionHtml = await page.evaluate(() => {
          const seenSrcs = new Set();
          let content = '';
          
          // Get all paragraphs from main content
          const allPs = document.querySelectorAll('main p, article p, [class*="article"] p');
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
            
            const parent = p.parentElement;
            if (parent) {
              const parentClass = parent.className || '';
              if (parentClass.includes('footer') || parentClass.includes('header') || parentClass.includes('nav')) continue;
            }
            
            content += p.outerHTML;
          }
          
          // Get figures (images) and iframes (videos) - avoid duplicates
          const media = document.querySelectorAll('main figure, main iframe, article figure, article iframe, [class*="article"] figure, [class*="article"] iframe');
          let mediaHtml = '';
          
          for (const el of media) {
            const img = el.querySelector('img');
            const iframe = el.tagName === 'IFRAME' ? el : el.querySelector('iframe');
            
            if (img && img.src && !img.src.includes('data:')) {
              if (seenSrcs.has(img.src)) continue;
              seenSrcs.add(img.src);
              mediaHtml += el.outerHTML;
            } else if (iframe && iframe.src) {
              if (seenSrcs.has(iframe.src)) continue;
              seenSrcs.add(iframe.src);
              mediaHtml += iframe.outerHTML;
            }
          }
          
          if (mediaHtml && content) {
            return content + mediaHtml;
          }
          
          return content || '';
        });
        
        // Clean up HTML
        const cleanedHtml = descriptionHtml
          .replace(/\s+/g, ' ')
          .replace(/>\s+</g, '><')
          .trim();
        
        // Extract plain text
        const plainText = await page.evaluate((html) => {
          const div = document.createElement('div');
          div.innerHTML = html;
          return div.textContent.trim().substring(0, 500);
        }, cleanedHtml);
        
        if (cleanedHtml && cleanedHtml.length > 20) {
          // Find or create item in data
          let existingItem = data.items.find(it => it.url === item.url || it.title === item.title);
          
          if (!existingItem) {
            existingItem = {
              title: item.title,
              url: item.url,
              gallery: galleryId
            };
            data.items.push(existingItem);
          }
          
          existingItem.descriptionHtml = cleanedHtml;
          existingItem.description = plainText;
          updated++;
          
          console.log(`  ✓ Description: ${plainText.substring(0, 60)}...`);
          console.log(`  ✓ HTML length: ${cleanedHtml.length} chars`);
        } else {
          console.log(`  ✗ No description found`);
        }
        
        await page.waitForTimeout(500);
        
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
    
    // Save JSON
    data.scrapedAt = new Date().toISOString();
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n  Saved ${jsonPath} (${updated} updated)`);
  }
  
  await browser.close();
  console.log('\n=== Done! ===');
}

run().catch(console.error);
