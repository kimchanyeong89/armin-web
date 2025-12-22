/**
 * MAM Paris Debug - Check iframe content
 */

const { chromium } = require('playwright');

async function debug() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const url = 'https://www.mam.paris.fr/en/online-collections#/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture?page=1&sort=random&layout=box';
  
  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  
  // Find iframe and get its source
  const iframeSrc = await page.evaluate(() => {
    const iframe = document.querySelector('iframe');
    return iframe ? iframe.src : 'No iframe found';
  });
  console.log('Iframe src:', iframeSrc);
  
  // Get all frames
  const frames = page.frames();
  console.log(`\nTotal frames: ${frames.length}`);
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    console.log(`\nFrame ${i}: ${frame.url()}`);
    
    if (frame.url().includes('navigart') || frame.url().includes('videomuseum') || frame.url() !== page.url()) {
      console.log('Checking frame content...');
      
      try {
        await frame.waitForTimeout(3000);
        
        // Check for artwork elements
        const artworkInfo = await frame.evaluate(() => {
          // Look for any elements with these patterns
          const patterns = [
            '[class*="artwork"]',
            '[class*="notice"]',
            '[class*="card"]',
            '[class*="item"]',
            '[class*="result"]',
            '[class*="grid"]',
            'figure',
            '.thumb',
            '.thumbnail'
          ];
          
          const results = {};
          patterns.forEach(sel => {
            try {
              const els = document.querySelectorAll(sel);
              if (els.length > 0) {
                results[sel] = {
                  count: els.length,
                  sample: els[0].className,
                  html: els[0].outerHTML.slice(0, 200)
                };
              }
            } catch (e) {}
          });
          
          // All images
          const imgs = Array.from(document.querySelectorAll('img')).slice(0, 5).map(i => ({
            src: i.src,
            class: i.className
          }));
          
          // All links
          const links = Array.from(document.querySelectorAll('a[href*="notice"], a[href*="artwork"]')).slice(0, 5).map(a => ({
            href: a.href,
            class: a.className,
            text: a.textContent?.trim()?.slice(0, 50)
          }));
          
          return { patterns: results, images: imgs, links, bodyLength: document.body?.innerHTML?.length || 0 };
        });
        
        console.log('Frame content:', JSON.stringify(artworkInfo, null, 2));
      } catch (e) {
        console.log('Error accessing frame:', e.message);
      }
    }
  }
  
  await page.waitForTimeout(5000);
  await browser.close();
}

debug();
