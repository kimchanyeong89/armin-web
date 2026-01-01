/**
 * Scrape Palazzo Ducale (Doge's Palace) Venice - MUVE Foundation
 * https://www.archiviodellacomunicazione.it/sicap/list/ArtWorks/LDCM:Palazzo%20Ducale/?WEB=MuseiVE
 * 420 artworks
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.archiviodellacomunicazione.it';
const LIST_URL = `${BASE_URL}/sicap/list/ArtWorks/LDCM:Palazzo%20Ducale/?WEB=MuseiVE`;
const PROGRESS_FILE = path.join(__dirname, '../downloads/palazzo-ducale-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../public/data/palazzo-ducale-collection.json');

const TEST_MODE = process.argv.includes('--test');
const TEST_PAGES = 2;

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📂 Resuming from page ${data.lastPage + 1}, ${data.artworks.length} items collected`);
      return data;
    } catch (e) {
      console.log('⚠️ Failed to load progress, starting fresh');
    }
  }
  return { artworks: [], lastPage: 0, seenUrls: [], done: false };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  
  // Also save to public/data for modal visibility
  const output = {
    museum: "Palazzo Ducale",
    museumFull: "Palazzo Ducale - Doge's Palace, Venice",
    description: "The Doge's Palace is a palace built in Venetian Gothic style and one of the main landmarks of Venice. It housed the Doge and was the seat of Venetian government.",
    website: "https://palazzoducale.visitmuve.it/en/home/",
    totalItems: progress.artworks.length,
    lastUpdated: new Date().toISOString(),
    artworks: progress.artworks
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

async function getTotalPages(page) {
  try {
    // Look for pagination links like page:84 (last page)
    const paginationLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="page:"]').forEach(a => {
        const match = a.getAttribute('href').match(/page:(\d+)/);
        if (match) links.push(parseInt(match[1]));
      });
      return links;
    });
    
    if (paginationLinks.length > 0) {
      return Math.max(...paginationLinks);
    }
    
    // Try counting by finding "Files found: 420"
    const filesText = await page.textContent('body');
    const filesMatch = filesText.match(/Files found:\s*(\d+)/i);
    if (filesMatch) {
      const totalFiles = parseInt(filesMatch[1]);
      return Math.ceil(totalFiles / 5); // ~5 items per page
    }
    
    return 84; // Default based on observed pagination
  } catch (e) {
    return 84;
  }
}

async function scrapeListPage(page, pageNum) {
  const url = pageNum === 1 ? LIST_URL : `${BASE_URL}/sicap/list/ArtWorks/LDCM:Palazzo%20Ducale/page:${pageNum}/?WEB=MuseiVE`;
  console.log(`📄 Scraping page ${pageNum}: ${url}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  
  // Get all artwork links - pattern is ../../../ENG/ArtWorks/ID/?WEB=MuseiVE
  const artworkLinks = await page.evaluate(() => {
    const links = [];
    const allLinks = document.querySelectorAll('a[href*="ENG/ArtWorks/"]');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        // Extract artwork ID from relative URL pattern ../../../ENG/ArtWorks/1234/?WEB=MuseiVE
        const match = href.match(/ENG\/ArtWorks\/(\d+)\//);
        if (match) {
          const fullUrl = `https://www.archiviodellacomunicazione.it/sicap/ENG/ArtWorks/${match[1]}/?WEB=MuseiVE`;
          if (!links.includes(fullUrl)) {
            links.push(fullUrl);
          }
        }
      }
    });
    return links;
  });
  
  console.log(`  Found ${artworkLinks.length} artwork links`);
  
  return artworkLinks;
}

async function scrapeArtworkDetail(page, url) {
  try {
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    
    const artwork = await page.evaluate((currentUrl) => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : '';
      };
      
      const getTableValue = (label) => {
        const rows = document.querySelectorAll('table tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          for (let i = 0; i < cells.length - 1; i++) {
            if (cells[i].textContent.trim().toLowerCase().includes(label.toLowerCase())) {
              return cells[i + 1]?.textContent.trim() || '';
            }
          }
        }
        // Try looking in th elements
        const ths = document.querySelectorAll('th, td');
        for (let i = 0; i < ths.length - 1; i++) {
          if (ths[i].textContent.trim().toLowerCase().includes(label.toLowerCase())) {
            const next = ths[i + 1] || ths[i].parentElement?.querySelector('td:last-child');
            if (next) return next.textContent.trim();
          }
        }
        return '';
      };
      
      // Get all table content for parsing
      const pageText = document.body.innerText;
      
      // Extract author - look for actual artist name, not labels
      let author = '';
      // Try to find author in table cells
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          for (let i = 0; i < cells.length; i++) {
            const cellText = cells[i].textContent.trim();
            if (cellText === 'Author' && cells[i + 1]) {
              const nextText = cells[i + 1].textContent.trim();
              if (nextText && nextText !== 'Author' && !nextText.includes('AUTHOR')) {
                author = nextText;
                break;
              }
            }
          }
          if (author) break;
        }
        if (author) break;
      }
      
      // Fallback: regex pattern
      if (!author || author === 'Author') {
        // Look for patterns like "Author\nCatena, Vincenzo" or similar
        const authorPatterns = [
          /Author\s*\n+\s*([A-Z][a-zàèìòù]+(?:,\s*[A-Z][a-zàèìòù]+)?(?:\s+[A-Z][a-zàèìòù]+)*)/,
          /Author\s*([A-Z][a-z]+,\s*[A-Z][a-z]+)/
        ];
        for (const pattern of authorPatterns) {
          const match = pageText.match(pattern);
          if (match && match[1] && !match[1].includes('AMBITO')) {
            author = match[1].trim();
            break;
          }
        }
      }
      
      // Clean up author
      if (author === 'Author' || author.includes('OGGETTO') || author.includes('Definizione')) {
        author = '';
      }
      // Handle "AMBITO CULTURALE" as "Unknown (Venetian school)"
      if (author.includes('AMBITO') || author.includes('Ambito')) {
        author = author.replace('AMBITO CULTURALE', 'Venetian School').replace('Ambito veneto', 'Venetian School');
      }
      
      // Extract subject/title
      let title = '';
      const identMatch = pageText.match(/Identificazione\s*\n*\s*([^\n]+)/i);
      if (identMatch) title = identMatch[1].trim();
      if (!title) {
        const subjMatch = pageText.match(/Subject\s*[:\n]+\s*([^\n]+)/i);
        if (subjMatch) title = subjMatch[1].trim();
      }
      
      // Extract object type
      let objectType = '';
      const defMatch = pageText.match(/Definizione\s*\n*\s*([^\n]+)/i);
      if (defMatch) objectType = defMatch[1].trim();
      
      // Extract technique
      let technique = '';
      const techMatch = pageText.match(/Media and Technique\s*\n*\s*([^\n]+)/i);
      if (techMatch) technique = techMatch[1].trim();
      
      // Extract dimensions
      let dimensions = '';
      const heightMatch = pageText.match(/Altezza\s*\n*\s*([\d,\.]+)/i);
      const widthMatch = pageText.match(/Larghezza\s*\n*\s*([\d,\.]+)/i);
      if (heightMatch && widthMatch) {
        dimensions = `${heightMatch[1]} x ${widthMatch[1]}`;
      }
      
      // Extract date
      let date = '';
      const centuryMatch = pageText.match(/Century\s*\n*\s*([XVILC]+)/i);
      const beginMatch = pageText.match(/Beginning of Work\s*\n*\s*(\d+)/i);
      if (beginMatch) {
        date = beginMatch[1];
      } else if (centuryMatch) {
        date = `${centuryMatch[1]} century`;
      }
      
      // Get image - look for viewer links
      let image = '';
      const viewerLinks = document.querySelectorAll('a[href*="/viewer/OA/"]');
      if (viewerLinks.length > 0) {
        const viewerHref = viewerLinks[0].getAttribute('href');
        const idMatch = viewerHref.match(/\/viewer\/OA\/(\d+)\//);
        if (idMatch) {
          image = `https://www.archiviodellacomunicazione.it/sicap/viewer/OA/${idMatch[1]}/?WEB=MuseiVE&Ext=jpg`;
        }
      }
      
      // Fallback: try thumbnail image
      if (!image) {
        const thumbImgs = document.querySelectorAll('img[src*="ThumbGif.ashx"]');
        if (thumbImgs.length > 0) {
          image = thumbImgs[0].getAttribute('src');
          if (image && !image.startsWith('http')) {
            image = 'https://www.archiviodellacomunicazione.it' + image;
          }
        }
      }
      
      // Extract inventory number from URL
      const urlMatch = currentUrl.match(/ArtWorks\/(\d+)\//);
      const inventoryId = urlMatch ? urlMatch[1] : '';
      
      return {
        title: title || objectType || 'Untitled',
        artist: author || 'Unknown',
        date: date || '',
        technique: technique || '',
        dimensions: dimensions || '',
        objectType: objectType || '',
        image: image || '',
        inventoryId: inventoryId,
        sourceUrl: currentUrl,
        museum: 'Palazzo Ducale'
      };
    }, fullUrl);
    
    return artwork;
  } catch (e) {
    console.error(`  ⚠️ Error scraping ${url}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('🏛️ Starting Palazzo Ducale (Venice) scraper...');
  console.log(`📍 Mode: ${TEST_MODE ? 'TEST' : 'FULL'}`);
  
  const progress = loadProgress();
  
  if (progress.done && !TEST_MODE) {
    console.log('✅ Scraping already completed!');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    // Get total pages
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    const totalPages = await getTotalPages(page);
    console.log(`📊 Total pages to scrape: ${totalPages}`);
    
    const pagesToScrape = TEST_MODE ? Math.min(TEST_PAGES, totalPages) : totalPages;
    const startPage = progress.lastPage + 1;
    
    const seenUrls = new Set(progress.seenUrls || []);
    
    for (let pageNum = startPage; pageNum <= pagesToScrape; pageNum++) {
      console.log(`\n📃 Processing page ${pageNum}/${pagesToScrape}`);
      
      const artworkLinks = await scrapeListPage(page, pageNum);
      
      for (const link of artworkLinks) {
        if (seenUrls.has(link)) {
          console.log(`  ⏭️ Skipping duplicate: ${link}`);
          continue;
        }
        
        const artwork = await scrapeArtworkDetail(page, link);
        if (artwork && artwork.title) {
          // Skip if no valid data
          if (artwork.title === 'Untitled' && !artwork.artist && !artwork.image) {
            console.log(`  ⏭️ Skipping empty artwork`);
            continue;
          }
          
          progress.artworks.push(artwork);
          seenUrls.add(link);
          console.log(`  ✅ ${progress.artworks.length}: ${artwork.title} by ${artwork.artist}`);
        }
        
        await page.waitForTimeout(500);
      }
      
      progress.lastPage = pageNum;
      progress.seenUrls = Array.from(seenUrls);
      
      if (progress.artworks.length % 20 === 0 || pageNum === pagesToScrape) {
        saveProgress(progress);
        console.log(`💾 Saved progress: ${progress.artworks.length} items`);
      }
    }
    
    progress.done = true;
    saveProgress(progress);
    
    console.log(`\n🎉 Scraping complete!`);
    console.log(`📊 Total artworks collected: ${progress.artworks.length}`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    saveProgress(progress);
  } finally {
    await browser.close();
  }
}

main();
