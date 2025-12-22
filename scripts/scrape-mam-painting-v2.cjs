/**
 * MAM Paris - Painting Collection Full Scraper v2
 * 
 * 개선 사항:
 * 1. 이미지 lazy-loading 대기 (실제 이미지 URL 확보)
 * 2. 아티스트/제목 추출 로직 개선
 * 3. 신뢰할 수 있는 selector 기반 파싱
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.navigart.fr/mamparis/artworks/checkbox:withimage/Avec%20image/tree_domain_all/Peinture';
const OUTPUT_DIR = path.join(__dirname, '../public/data');
const PROGRESS_DIR = path.join(__dirname, '../downloads/mam');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'mam-painting-collection.json');
const PROGRESS_FILE = path.join(PROGRESS_DIR, 'painting-scrape-progress-v2.json');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(PROGRESS_DIR)) fs.mkdirSync(PROGRESS_DIR, { recursive: true });

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('Progress file error:', e.message);
  }
  return { processedUrls: [], artworks: [], lastPage: 0 };
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  // Also save to final output
  const output = {
    museum: 'Musée d\'Art Moderne de Paris',
    museumId: 'mam-paris',
    collectionName: 'Painting Collection',
    scrapedAt: new Date().toISOString(),
    totalObjects: data.artworks.length,
    coverImage: data.artworks[0]?.image || '',
    objects: data.artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

/**
 * Wait for real image to load (not lazy-loading placeholder)
 */
async function waitForRealImage(page, imgSelector, timeout = 5000) {
  try {
    await page.waitForFunction(
      (selector) => {
        const img = document.querySelector(selector);
        if (!img) return false;
        const src = img.src || img.getAttribute('data-src') || '';
        // Not a placeholder and contains navigart
        return src.includes('navigart.fr') && !src.includes('data:image');
      },
      { timeout },
      imgSelector
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Scrape artwork detail page with improved parsing
 */
async function scrapeDetailPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Wait for image to load properly
    await waitForRealImage(page, 'img[src*="navigart"], img[data-src*="navigart"]', 5000);
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(1500);
    
    const data = await page.evaluate(() => {
      // === IMAGE ===
      let image = null;
      const imgElements = Array.from(document.querySelectorAll('img'));
      for (const img of imgElements) {
        // Check src
        const src = img.src || '';
        if (src.includes('images.navigart.fr') && !src.includes('data:image')) {
          // Try to get higher resolution
          image = src.replace('/400/', '/800/').replace('/200/', '/800/');
          break;
        }
        // Check data-src
        const dataSrc = img.getAttribute('data-src') || '';
        if (dataSrc.includes('images.navigart.fr')) {
          image = dataSrc.replace('/400/', '/800/').replace('/200/', '/800/');
          break;
        }
      }
      
      // === STRUCTURED DATA EXTRACTION ===
      // MAM navigart uses structured info blocks
      
      let artist = null;
      let title = null;
      let year = null;
      let medium = null;
      let dimensions = null;
      
      // Try to find the structured info container
      const infoContainer = document.querySelector('.notice-details, .artwork-info, .single-artwork-ua, .details, aside');
      
      if (infoContainer) {
        // Artist: Look for author/artist specific elements
        const authorEl = infoContainer.querySelector('.notice-author, .author, [class*="author"], [class*="artist"]');
        if (authorEl) {
          artist = authorEl.textContent.trim().replace(/^[-–—]\s*/, '');
        }
        
        // Title: Look for title in italics or title class
        const titleEl = infoContainer.querySelector('.notice-title, .title, em, i, [class*="title"]');
        if (titleEl) {
          title = titleEl.textContent.trim();
        }
      }
      
      // Parse from text content if structured selectors fail
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Look for patterns in lines
      for (let i = 0; i < Math.min(lines.length, 30); i++) {
        const line = lines[i];
        
        // Year pattern: "vers YYYY" or standalone "YYYY"
        if (!year && /^\s*(vers\s+)?\d{4}\s*$/.test(line)) {
          year = line.trim();
        }
        
        // Medium pattern: starts with painting-related terms
        if (!medium && /^(Peinture|Huile|Acrylique|Tempera|Gouache|Aquarelle|Encaustique|Fresque)/i.test(line)) {
          medium = line;
        }
        
        // Dimensions pattern: contains "x" with "cm"
        if (!dimensions && /\d+\s*[x×]\s*\d+\s*cm/i.test(line)) {
          dimensions = line;
        }
      }
      
      // Try to get artist from h2 or specific pattern
      if (!artist) {
        // Look for h2 which often contains artist
        const h2 = document.querySelector('h2');
        if (h2) {
          const h2Text = h2.textContent.trim();
          // Check if it's a name (not a title)
          if (h2Text && !h2Text.includes(',') && h2Text.split(' ').length <= 5) {
            artist = h2Text;
          }
        }
      }
      
      // Get title from h1 if not found
      if (!title) {
        const h1 = document.querySelector('h1');
        if (h1) {
          title = h1.textContent.trim();
        }
      }
      
      // Clean artist name - remove photo credits, copyright notices
      if (artist) {
        // If artist contains "Domaine public" or "photo" or long text, it's likely metadata
        if (artist.length > 80 || 
            artist.toLowerCase().includes('domaine public') || 
            artist.toLowerCase().includes('photo :') ||
            artist.toLowerCase().includes('photographie')) {
          artist = null;
        }
      }
      
      return { 
        image, 
        artist, 
        title, 
        year, 
        medium, 
        dimensions,
        debug: { 
          foundImage: !!image,
          foundArtist: !!artist,
          firstLines: lines.slice(0, 5)
        }
      };
    });
    
    return data;
    
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return null;
  }
}

/**
 * Get list items from a page
 */
async function getListItems(page) {
  return await page.$$eval('a.box-item, a[class*="box-item"], .artwork-box a, article a', elements => {
    return elements
      .filter(el => el.href && el.href.includes('/artwork/'))
      .map(el => {
        const img = el.querySelector('img');
        let listImage = null;
        
        if (img) {
          const src = img.src || '';
          const dataSrc = img.getAttribute('data-src') || '';
          if (src.includes('images.navigart.fr') && !src.includes('data:image')) {
            listImage = src.replace('/400/', '/800/');
          } else if (dataSrc.includes('images.navigart.fr')) {
            listImage = dataSrc.replace('/400/', '/800/');
          }
        }
        
        return {
          detailUrl: el.href,
          listImage
        };
      });
  });
}

async function scrape() {
  console.log('🎨 MAM Paris - Painting Collection Scraper v2');
  console.log('='.repeat(50));
  console.log('개선 사항:');
  console.log('  - 이미지 lazy-loading 대기');
  console.log('  - 아티스트/제목 추출 로직 개선');
  console.log('='.repeat(50) + '\n');
  
  const progress = loadProgress();
  console.log(`📌 재개: ${progress.artworks.length}개 작품 수집됨, 마지막 페이지: ${progress.lastPage}`);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  const processedSet = new Set(progress.processedUrls);
  let totalPages = 145; // Approximately 2167 / 15 per page
  
  try {
    // Get total count from first page
    console.log('\n📡 첫 페이지 로드 중...');
    await page.goto(`${BASE_URL}?page=1&layout=box&sort=random`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    const totalText = await page.evaluate(() => {
      const el = document.querySelector('.pagination-info, .total, [class*="total"], .results-count');
      return el?.textContent || '';
    });
    
    const match = totalText.match(/(\d[\d\s]*)/);
    if (match) {
      const total = parseInt(match[1].replace(/\s/g, ''), 10);
      if (total > 0) {
        totalPages = Math.ceil(total / 15);
        console.log(`✅ 총 작품 수: ${total}개, 페이지 수: ${totalPages}`);
      }
    }
    
    // Process each page
    for (let pageNum = progress.lastPage + 1; pageNum <= totalPages; pageNum++) {
      console.log(`\n📄 페이지 ${pageNum}/${totalPages}`);
      
      const url = `${BASE_URL}?page=${pageNum}&layout=box&sort=random`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      const items = await getListItems(page);
      console.log(`  ${items.length}개 항목 발견`);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (processedSet.has(item.detailUrl)) {
          process.stdout.write('·');
          continue;
        }
        
        // Create a separate page for detail scraping
        const detailPage = await context.newPage();
        const detail = await scrapeDetailPage(detailPage, item.detailUrl);
        await detailPage.close();
        
        if (detail) {
          // Use list image as fallback if detail page image failed
          const finalImage = detail.image || item.listImage;
          
          // Skip if no valid image
          if (!finalImage || finalImage.includes('data:image')) {
            console.log(`    ✗ 이미지 없음: ${item.detailUrl}`);
            continue;
          }
          
          const artwork = {
            id: `mam-painting-${progress.artworks.length + 1}`,
            title: detail.title || 'Sans titre',
            artist: detail.artist || 'Artiste inconnu',
            year: detail.year || null,
            image: finalImage,
            medium: detail.medium || 'Peinture',
            dimensions: detail.dimensions || null,
            source: 'Musée d\'Art Moderne de Paris',
            collectionArea: 'Painting',
            detailUrl: item.detailUrl
          };
          
          progress.artworks.push(artwork);
          processedSet.add(item.detailUrl);
          progress.processedUrls.push(item.detailUrl);
          
          process.stdout.write('✓');
        } else {
          process.stdout.write('✗');
        }
        
        // Small delay
        await new Promise(r => setTimeout(r, 300));
      }
      
      // Save progress after each page
      progress.lastPage = pageNum;
      saveProgress(progress);
      console.log(`\n  💾 저장: 총 ${progress.artworks.length}개 작품`);
      
      // Delay between pages
      await page.waitForTimeout(800);
    }
    
    console.log(`\n\n✅ 완료! 총 ${progress.artworks.length}개 작품 수집`);
    
  } catch (e) {
    console.error('\n❌ 오류:', e.message);
    saveProgress(progress);
  }
  
  await browser.close();
}

scrape();
