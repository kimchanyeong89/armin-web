/**
 * Musée de l'Orangerie Collection Scraper - 테스트 버전 (1페이지)
 * 
 * - 2D/3D 구분: 매체(medium) 정보로 자동 분류
 * - 고화질 이미지: 상세 페이지에서 추출
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.musee-orangerie.fr';
const SEARCH_URL = 'https://www.musee-orangerie.fr/en/collections/search?search=&sort_by=search_api_relevance&items_per_page=15&search_type=simple_search&display_type=grid';

const OUTPUT_DIR = path.join(__dirname, '../public/data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'orangerie-collection.json');

// 테스트: 1페이지만
const MAX_PAGES = 1;

// 2D 매체 키워드
const MEDIUM_2D = [
  'huile', 'peinture', 'toile', 'papier', 'aquarelle', 'pastel', 
  'encre', 'gouache', 'dessin', 'gravure', 'lithographie', 'estampe',
  'oil', 'canvas', 'paper', 'watercolor', 'ink', 'drawing', 'print',
  'photographie', 'photograph', 'carte postale'
];

// 3D 매체 키워드
const MEDIUM_3D = [
  'bois', 'bronze', 'pierre', 'marbre', 'terre', 'céramique', 'verre',
  'métal', 'laiton', 'cuivre', 'fer', 'plâtre', 'argile', 'ivoire',
  'wood', 'stone', 'marble', 'ceramic', 'glass', 'metal', 'brass',
  'sculpture', 'masque', 'mask', 'ronde-bosse', 'gobelet', 'médaille'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(str) {
  return str?.replace(/\s+/g, ' ').trim() || '';
}

function formatDimensions(raw) {
  if (!raw) return '';
  const match = raw.match(/H\.?\s*([\d,.]+)\s*[;,]?\s*L\.?\s*([\d,.]+)\s*cm/i);
  if (match) {
    const height = match[1].replace(',', '.');
    const width = match[2].replace(',', '.');
    return `${height} x ${width} cm`;
  }
  return raw.replace(/\s+/g, ' ').trim();
}

// 매체 정보로 2D/3D 구분
function classifyArtworkType(medium) {
  if (!medium) return 'unknown';
  const lowerMedium = medium.toLowerCase();
  
  // 3D 우선 체크 (조각, 마스크 등)
  for (const keyword of MEDIUM_3D) {
    if (lowerMedium.includes(keyword)) {
      return '3D';
    }
  }
  
  // 2D 체크
  for (const keyword of MEDIUM_2D) {
    if (lowerMedium.includes(keyword)) {
      return '2D';
    }
  }
  
  return 'unknown';
}

async function scrapeOrangerieTest() {
  console.log('🍊 Musée de l\'Orangerie Scraper (Test: 1 page)\n');
  
  ensureDir(OUTPUT_DIR);
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  const artworks = [];
  
  try {
    console.log('📄 Scraping list page...');
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Cookie banner
    try {
      const cookieBtn = await page.$('#onetrust-accept-btn-handler');
      if (cookieBtn) {
        await cookieBtn.click();
        await delay(1000);
      }
    } catch (e) {}
    
    // Extract list items
    const listItems = await page.$$eval('article.artwork-masonry', articles => {
      return articles.map(article => {
        const link = article.querySelector('a');
        const h2 = article.querySelector('h2');
        const dateDiv = article.querySelector('.date');
        
        let artist = '';
        let title = '';
        
        if (h2) {
          const h2Html = h2.innerHTML;
          const italicMatch = h2Html.match(/<i[^>]*>([^<]+)<\/i>/);
          if (italicMatch) {
            title = italicMatch[1].trim();
            const textContent = h2.textContent || '';
            const commaIdx = textContent.indexOf(',');
            if (commaIdx > 0) {
              artist = textContent.substring(0, commaIdx).trim();
            }
          }
        }
        
        return {
          href: link?.getAttribute('href') || '',
          artist,
          title,
          year: dateDiv?.textContent?.trim() || ''
        };
      });
    });
    
    console.log(`   Found ${listItems.length} artworks\n`);
    
    // Process each detail page
    let successCount = 0;
    let count2D = 0;
    let count3D = 0;
    let countUnknown = 0;
    
    for (let i = 0; i < listItems.length; i++) {
      const item = listItems[i];
      if (!item.href) continue;
      
      const detailUrl = item.href.startsWith('http') ? item.href : `${BASE_URL}${item.href}`;
      const urlParts = item.href.split('/');
      const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      
      console.log(`   [${i + 1}/${listItems.length}] ${cleanText(item.title).substring(0, 35)}...`);
      
      try {
        await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(500);
        
        const details = await page.evaluate(() => {
          const mainFigure = document.querySelector('figure.main-image');
          let imageUrl = '';
          let medium = '';
          
          if (mainFigure) {
            const img = mainFigure.querySelector('img');
            if (img && img.src && img.src.includes('cdn.mediatheque')) {
              imageUrl = img.src;
            }
            
            // Get medium from aria-label
            const ariaLabel = mainFigure.getAttribute('aria-label') || '';
            // Format: "Artist Title Year Medium"
            const parts = ariaLabel.split(/\d{4}|\b[IXV]+e siècle\b/i);
            if (parts.length > 1) {
              medium = parts[parts.length - 1].trim();
            }
          }
          
          // Also try to get medium from dedicated div
          const mediumDiv = document.querySelector('.field--name-field-medium, .artwork-medium');
          if (mediumDiv && !medium) {
            medium = mediumDiv.textContent?.trim() || '';
          }
          
          // Get dimensions
          const bodyText = document.body.innerText;
          const dimMatch = bodyText.match(/H\.?\s*[\d,.]+\s*[;,]?\s*L\.?\s*[\d,.]+\s*cm/i);
          
          return {
            imageUrl,
            medium: medium.substring(0, 150),
            dimensionsRaw: dimMatch ? dimMatch[0] : ''
          };
        });
        
        if (!details.imageUrl) {
          console.log(`      ⚠️ No image, skipping`);
          continue;
        }
        
        const dimensions = formatDimensions(details.dimensionsRaw);
        const artworkType = classifyArtworkType(details.medium);
        
        // Count by type
        if (artworkType === '2D') count2D++;
        else if (artworkType === '3D') count3D++;
        else countUnknown++;
        
        console.log(`      ✓ [${artworkType}] ${dimensions || '-'} | ${(details.medium || '-').substring(0, 30)}`);
        
        artworks.push({
          id: `orangerie-${slug}`,
          title: cleanText(item.title) || 'Untitled',
          artist: cleanText(item.artist) || 'Unknown',
          year: cleanText(item.year),
          image: details.imageUrl,
          dimensions,
          medium: details.medium,
          type: artworkType,
          source: 'Musée de l\'Orangerie'
        });
        
        successCount++;
        
      } catch (error) {
        console.log(`      ⚠️ Error: ${error.message}`);
      }
      
      await delay(800);
    }
    
    // Build final collection JSON
    const collection = {
      museum: 'Musée de l\'Orangerie',
      museumId: 'musee-orangerie',
      collectionName: 'Musée de l\'Orangerie Collection',
      scrapedAt: new Date().toISOString(),
      totalObjects: artworks.length,
      coverImage: artworks[0]?.image || '',
      objects: artworks
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
    
    console.log(`\n✅ Scraping complete!`);
    console.log(`📊 Total: ${successCount} artworks`);
    console.log(`   🖼️  2D: ${count2D} | 🗿 3D: ${count3D} | ❓ Unknown: ${countUnknown}`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

scrapeOrangerieTest().catch(console.error);
