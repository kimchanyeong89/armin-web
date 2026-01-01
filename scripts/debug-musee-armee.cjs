/**
 * Debug script for Musée de l'Armée collection database
 * Explores the site structure and available collections
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://basedescollections.musee-armee.fr';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // 1. Check the homepage for available parcours/collections
    console.log('='.repeat(60));
    console.log('EXPLORING MUSÉE DE L\'ARMÉE COLLECTION DATABASE');
    console.log('='.repeat(60));
    
    await page.goto(`${BASE_URL}/accueil`, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(2000);
    
    // Take screenshot
    await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/musee-armee-home.png', fullPage: true });
    console.log('\n📸 Screenshot saved: musee-armee-home.png');
    
    // Get all parcours/thematic links
    const homeLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a').forEach(a => {
        const href = a.href;
        const text = a.innerText?.trim() || '';
        if (href && (href.includes('/search/') || href.includes('/notice') || href.includes('/query'))) {
          links.push({ text, href });
        }
      });
      return links;
    });
    
    console.log('\n📋 Found links on homepage:');
    homeLinks.forEach((link, i) => {
      console.log(`  ${i + 1}. ${link.text || '(no text)'} -> ${link.href}`);
    });
    
    // 2. Visit the given search URL 
    console.log('\n' + '='.repeat(60));
    console.log('EXPLORING SEARCH PAGE');
    console.log('='.repeat(60));
    
    const searchUrl = 'https://basedescollections.musee-armee.fr/search/88fee4f5-9d88-4d9e-8ec6-17e68311b477';
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    // Take screenshot
    await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/musee-armee-search.png', fullPage: true });
    console.log('\n📸 Screenshot saved: musee-armee-search.png');
    
    // Get page title and content
    const pageInfo = await page.evaluate(() => {
      const title = document.querySelector('h1, h2, .title')?.innerText || '';
      const resultCount = document.body.innerText.match(/(\d+)\s*résultats?/i);
      
      // Get all artwork cards/links
      const artworkLinks = [];
      document.querySelectorAll('a[href*="/notice"]').forEach(a => {
        const href = a.href;
        const text = a.innerText?.trim().substring(0, 100) || '';
        const img = a.querySelector('img') || a.closest('div, article')?.querySelector('img');
        const imgSrc = img?.src || '';
        if (!artworkLinks.find(l => l.href === href)) {
          artworkLinks.push({ text, href, imgSrc });
        }
      });
      
      return {
        title,
        resultCount: resultCount ? resultCount[1] : 'unknown',
        artworkLinks: artworkLinks.slice(0, 20) // First 20
      };
    });
    
    console.log(`\n📊 Page Info:`);
    console.log(`   Title: ${pageInfo.title}`);
    console.log(`   Result count: ${pageInfo.resultCount}`);
    console.log(`\n   Sample artworks (${pageInfo.artworkLinks.length}):`);
    pageInfo.artworkLinks.slice(0, 10).forEach((art, i) => {
      console.log(`   ${i + 1}. ${art.text.substring(0, 60) || '(no text)'}`);
      console.log(`      URL: ${art.href}`);
      if (art.imgSrc) console.log(`      IMG: ${art.imgSrc.substring(0, 80)}...`);
    });
    
    // 3. Check if there's pagination
    const paginationInfo = await page.evaluate(() => {
      const body = document.body.innerText;
      const pageNum = body.match(/page\s*(\d+)/i);
      const totalPages = body.match(/sur\s*(\d+)\s*pages?/i);
      
      // Look for pagination buttons or links
      const paginationLinks = [];
      document.querySelectorAll('button, a').forEach(el => {
        const text = el.innerText?.trim() || '';
        if (text.match(/^\d+$/) || text === 'Suivant' || text === 'Next' || text === '>' || text === '»') {
          paginationLinks.push(text);
        }
      });
      
      // Check for scroll-to-load
      const hasInfiniteScroll = !!document.querySelector('.infinite-scroll, [data-infinite-scroll]');
      
      return {
        currentPage: pageNum ? pageNum[1] : 'unknown',
        totalPages: totalPages ? totalPages[1] : 'unknown',
        paginationLinks: paginationLinks.slice(0, 20),
        hasInfiniteScroll
      };
    });
    
    console.log(`\n📄 Pagination:`);
    console.log(`   Current page: ${paginationInfo.currentPage}`);
    console.log(`   Total pages: ${paginationInfo.totalPages}`);
    console.log(`   Pagination controls: ${paginationInfo.paginationLinks.join(', ') || 'none found'}`);
    console.log(`   Infinite scroll: ${paginationInfo.hasInfiniteScroll}`);
    
    // 4. Visit one detail page to understand structure
    if (pageInfo.artworkLinks.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('EXPLORING DETAIL PAGE');
      console.log('='.repeat(60));
      
      const detailUrl = pageInfo.artworkLinks[0].href;
      console.log(`\nVisiting: ${detailUrl}`);
      
      await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 60000 });
      await sleep(2000);
      
      await page.screenshot({ path: '/Users/kietzsche/armin-web-main/downloads/musee-armee-detail.png', fullPage: true });
      console.log('📸 Screenshot saved: musee-armee-detail.png');
      
      const detailInfo = await page.evaluate(() => {
        const getText = (selector) => document.querySelector(selector)?.innerText?.trim() || '';
        const getAttr = (selector, attr) => document.querySelector(selector)?.getAttribute(attr) || '';
        
        // Get all field labels and values
        const fields = [];
        document.querySelectorAll('.field, .detail-field, [class*="field"], tr').forEach(el => {
          const label = el.querySelector('label, th, .label, [class*="label"]')?.innerText?.trim() || '';
          const value = el.querySelector('.value, td, [class*="value"]')?.innerText?.trim() || 
                        el.innerText?.replace(label, '').trim() || '';
          if (label && value && label !== value) {
            fields.push({ label, value: value.substring(0, 100) });
          }
        });
        
        // Get images
        const images = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.src;
          if (src && !src.includes('logo') && !src.includes('icon') && src.length > 50) {
            images.push(src);
          }
        });
        
        // Get title
        const title = getText('h1') || getText('h2') || getText('.title');
        
        // Get page HTML structure hints
        const html = document.body.innerHTML;
        const hasInventory = html.includes("inventaire") || html.includes("Numéro");
        const hasAuthor = html.includes("Auteur") || html.includes("Exécutant");
        const hasDate = html.includes("Date") || html.includes("Période");
        
        return {
          title,
          fields: fields.slice(0, 20),
          images: images.slice(0, 5),
          structureHints: { hasInventory, hasAuthor, hasDate }
        };
      });
      
      console.log(`\n📦 Detail Page Info:`);
      console.log(`   Title: ${detailInfo.title}`);
      console.log(`\n   Fields found:`);
      detailInfo.fields.forEach(f => {
        console.log(`   - ${f.label}: ${f.value.substring(0, 60)}`);
      });
      console.log(`\n   Images found: ${detailInfo.images.length}`);
      detailInfo.images.forEach((img, i) => {
        console.log(`   ${i + 1}. ${img.substring(0, 80)}...`);
      });
      console.log(`\n   Structure hints:`, detailInfo.structureHints);
      
      // Save the page HTML for analysis
      const html = await page.content();
      fs.writeFileSync('/Users/kietzsche/armin-web-main/downloads/musee-armee-detail.html', html);
      console.log('\n💾 HTML saved: musee-armee-detail.html');
    }
    
    // 5. Check for API endpoints in network
    console.log('\n' + '='.repeat(60));
    console.log('LOOKING FOR API ENDPOINTS');
    console.log('='.repeat(60));
    
    // Reload with network monitoring
    const apiCalls = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/rest/') || url.includes('/api/') || url.includes('.json')) {
        apiCalls.push({ url, method: request.method() });
      }
    });
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(3000);
    
    console.log('\n🔌 API calls detected:');
    apiCalls.slice(0, 10).forEach((api, i) => {
      console.log(`   ${i + 1}. [${api.method}] ${api.url.substring(0, 100)}...`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
