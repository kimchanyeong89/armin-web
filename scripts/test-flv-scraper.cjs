/**
 * Fondation Louis Vuitton Collection Scraper - TEST (3 pages)
 * 
 * 비디오 임베드 식별 및 가져오기 포함
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.fondationlouisvuitton.fr';
const COLLECTION_URL = 'https://www.fondationlouisvuitton.fr/en/collection/artworks';

async function main() {
  console.log('🏛️ Fondation Louis Vuitton Collection Scraper - TEST\n');
  
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('📡 Navigating to collection page...');
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Screenshot for debugging
    await page.screenshot({ path: 'downloads/flv-collection-debug.png', fullPage: false });
    console.log('📸 Screenshot saved: downloads/flv-collection-debug.png');
    
    // Get page title and check content
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Check for cookie consent
    try {
      const cookieBtn = await page.$('button[id*="accept"], button[class*="accept"], button:has-text("Accept")');
      if (cookieBtn) {
        await cookieBtn.click();
        console.log('🍪 Cookie banner dismissed');
        await page.waitForTimeout(1000);
      }
    } catch (e) {}
    
    // Analyze page structure
    console.log('\n🔍 Analyzing page structure...\n');
    
    const pageInfo = await page.evaluate(() => {
      const info = {
        url: window.location.href,
        artworkLinks: [],
        paginationInfo: null,
        totalCount: null,
        videoElements: []
      };
      
      // Find artwork links
      const linkPatterns = [
        'a[href*="/collection/"]',
        'a[href*="/artworks/"]',
        'a[href*="/artwork/"]',
        'a[href*="/oeuvre/"]',
        'article a',
        '.artwork a',
        '.card a'
      ];
      
      for (const pattern of linkPatterns) {
        const links = document.querySelectorAll(pattern);
        links.forEach(link => {
          if (link.href && !info.artworkLinks.includes(link.href)) {
            info.artworkLinks.push(link.href);
          }
        });
      }
      
      // Find pagination
      const paginationSelectors = [
        '.pagination',
        '[class*="pagination"]',
        'nav[aria-label*="page"]',
        '.page-numbers',
        'button:has-text("Next")',
        'a:has-text("Next")',
        '[class*="load-more"]',
        'button:has-text("Load more")'
      ];
      
      for (const sel of paginationSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          info.paginationInfo = { selector: sel, text: el.textContent?.slice(0, 100) };
          break;
        }
      }
      
      // Find total count
      const countMatch = document.body.innerText.match(/(\d+)\s*(artworks?|œuvres?|works?|results?)/i);
      if (countMatch) {
        info.totalCount = countMatch[0];
      }
      
      // Find video elements
      const videos = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"], [data-video], [class*="video"]');
      videos.forEach(v => {
        info.videoElements.push({
          tag: v.tagName,
          src: v.src || v.dataset?.video || '',
          className: v.className
        });
      });
      
      return info;
    });
    
    console.log('🔗 Current URL:', pageInfo.url);
    console.log('🖼️ Artwork links found:', pageInfo.artworkLinks.length);
    if (pageInfo.artworkLinks.length > 0) {
      console.log('   Sample links:');
      pageInfo.artworkLinks.slice(0, 5).forEach(link => console.log('   -', link));
    }
    console.log('📊 Total count text:', pageInfo.totalCount || 'Not found');
    console.log('📑 Pagination:', pageInfo.paginationInfo ? JSON.stringify(pageInfo.paginationInfo) : 'Not found');
    console.log('🎬 Video elements:', pageInfo.videoElements.length);
    
    // Try to find artwork cards/items
    console.log('\n🔍 Looking for artwork items...');
    
    const artworkItems = await page.evaluate(() => {
      const items = [];
      
      // Common artwork card selectors
      const cardSelectors = [
        'article',
        '[class*="artwork"]',
        '[class*="card"]',
        '[class*="item"]',
        '.grid > div',
        'ul li',
        '[class*="collection"] > div'
      ];
      
      for (const sel of cardSelectors) {
        const cards = document.querySelectorAll(sel);
        if (cards.length > 0 && cards.length < 200) {
          cards.forEach((card, i) => {
            if (i < 5) {
              const link = card.querySelector('a');
              const img = card.querySelector('img');
              const title = card.querySelector('h2, h3, h4, [class*="title"]');
              items.push({
                selector: sel,
                href: link?.href || '',
                imgSrc: img?.src || img?.dataset?.src || '',
                title: title?.textContent?.trim() || '',
                html: card.outerHTML?.slice(0, 300)
              });
            }
          });
          break;
        }
      }
      
      return items;
    });
    
    console.log('📦 Artwork items found:', artworkItems.length);
    artworkItems.forEach((item, i) => {
      console.log(`\n   Item ${i + 1}:`);
      console.log('   - Selector:', item.selector);
      console.log('   - Title:', item.title || 'N/A');
      console.log('   - Link:', item.href || 'N/A');
      console.log('   - Image:', item.imgSrc ? 'Yes' : 'No');
    });
    
    // If we found artwork links, test scraping one detail page
    if (pageInfo.artworkLinks.length > 0) {
      const testUrl = pageInfo.artworkLinks[0];
      console.log('\n\n🔍 Testing detail page:', testUrl);
      
      const detailPage = await context.newPage();
      await detailPage.goto(testUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await detailPage.waitForTimeout(2000);
      
      await detailPage.screenshot({ path: 'downloads/flv-detail-debug.png', fullPage: false });
      console.log('📸 Detail screenshot saved: downloads/flv-detail-debug.png');
      
      const detailData = await detailPage.evaluate(() => {
        const data = {
          title: '',
          artist: '',
          year: '',
          description: '',
          image: '',
          video: null,
          metadata: {}
        };
        
        // Title
        const h1 = document.querySelector('h1');
        data.title = h1?.textContent?.trim() || '';
        
        // Artist - various patterns
        const artistSelectors = [
          '[class*="artist"]',
          'a[href*="/artist/"]',
          'h2',
          '.subtitle'
        ];
        for (const sel of artistSelectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) {
            data.artist = el.textContent.trim();
            break;
          }
        }
        
        // Image
        const imgSelectors = [
          'main img',
          'article img',
          'figure img',
          '.artwork img',
          'img[src*="artwork"]'
        ];
        for (const sel of imgSelectors) {
          const img = document.querySelector(sel);
          if (img?.src) {
            data.image = img.src;
            break;
          }
        }
        
        // Video detection
        const videoEl = document.querySelector('video');
        if (videoEl) {
          data.video = {
            type: 'video',
            src: videoEl.src || videoEl.querySelector('source')?.src || ''
          };
        }
        
        const youtubeIframe = document.querySelector('iframe[src*="youtube"]');
        if (youtubeIframe) {
          const ytMatch = youtubeIframe.src.match(/embed\/([^?]+)/);
          data.video = {
            type: 'youtube',
            videoId: ytMatch ? ytMatch[1] : '',
            src: youtubeIframe.src
          };
        }
        
        const vimeoIframe = document.querySelector('iframe[src*="vimeo"]');
        if (vimeoIframe) {
          const vmMatch = vimeoIframe.src.match(/video\/(\d+)/);
          data.video = {
            type: 'vimeo',
            videoId: vmMatch ? vmMatch[1] : '',
            src: vimeoIframe.src
          };
        }
        
        // Description
        const descEl = document.querySelector('[class*="description"], .content p, article p');
        data.description = descEl?.textContent?.trim()?.slice(0, 500) || '';
        
        // Metadata from tables or definition lists
        document.querySelectorAll('dl, table').forEach(el => {
          if (el.tagName === 'DL') {
            const dts = el.querySelectorAll('dt');
            const dds = el.querySelectorAll('dd');
            dts.forEach((dt, i) => {
              if (dds[i]) {
                data.metadata[dt.textContent.trim()] = dds[i].textContent.trim();
              }
            });
          }
        });
        
        return data;
      });
      
      console.log('\n📋 Detail page data:');
      console.log('   Title:', detailData.title);
      console.log('   Artist:', detailData.artist);
      console.log('   Image:', detailData.image ? 'Yes' : 'No');
      console.log('   Video:', detailData.video ? JSON.stringify(detailData.video) : 'None');
      console.log('   Description:', detailData.description?.slice(0, 100) + '...');
      console.log('   Metadata:', Object.keys(detailData.metadata).length > 0 ? JSON.stringify(detailData.metadata) : 'None');
      
      await detailPage.close();
    }
    
    // Save HTML for further analysis
    const html = await page.content();
    fs.writeFileSync('downloads/flv-collection.html', html);
    console.log('\n💾 HTML saved: downloads/flv-collection.html');
    
  } finally {
    await browser.close();
    console.log('\n✅ Test complete!');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
