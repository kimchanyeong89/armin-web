const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

const COLLECTION_URL = 'https://coleccion.caixaforum.org/en/explora';
const OUTPUT_FILE = path.join(__dirname, '../public/data/caixaforum-collection.json');
const LIST_ITEMS_FILE = path.join(__dirname, '../public/data/caixaforum-list-items.json');
const MAX_PAGES = 1000; // Full scrape: all pages
const DELAY_BETWEEN_PAGES = 2000;

async function fetchListWithPlaywright() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  try {
    console.log(`Navigating to ${COLLECTION_URL}...`);
    await page.goto(COLLECTION_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for cookie consent and click if present
    try {
      await page.waitForTimeout(2000);
      const cookieBtn = await page.locator('button:has-text("Accept"), button:has-text("Aceptar"), [id*="cookie"], [class*="cookie"]').first();
      if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cookieBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // No cookie button
    }
    
    // Wait for content to load
    await page.waitForTimeout(10000);
    
    // Check if maintenance page
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('maintenance') || bodyText.includes('mantenimiento')) {
      console.log('⚠️ Warning: Maintenance page detected, but continuing...');
    }
    
    const allArtworks = [];
    
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      console.log(`\nProcessing page ${pageNum}/${MAX_PAGES}...`);
      
      if (pageNum > 1) {
        // Try different pagination patterns
        const pageUrl = `${COLLECTION_URL}?page=${pageNum}`;
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
      }
      
      // Scroll to trigger lazy loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      
      // Extract artworks from current page - try multiple patterns
      const pageArtworks = await page.evaluate((baseUrl) => {
        const items = [];
        const seenUrls = new Set();
        
        // Strategy 1: Find links with images (artwork cards)
        const linksWithImages = Array.from(document.querySelectorAll('a')).filter(a => {
          const img = a.querySelector('img') || a.closest('[class*="card"], [class*="item"], article')?.querySelector('img');
          return img && img.src && !img.src.includes('logo') && !img.src.includes('icon') && !img.src.startsWith('data:');
        });
        
        linksWithImages.forEach((link) => {
          const href = link.getAttribute('href');
          if (!href || href.includes('#') || href.includes('javascript:')) return;
          
          // Convert to absolute URL
          let detailUrl;
          try {
            detailUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
          } catch (e) {
            return;
          }
          
          // Filter for CaixaForum URLs (not just /obra/)
          if (!detailUrl.includes('caixaforum.org')) return;
          if (detailUrl === baseUrl || detailUrl === baseUrl + '/') return;
          if (detailUrl.includes('/en/explora') && !detailUrl.includes('/obra')) return;
          if (seenUrls.has(detailUrl)) return;
          
          seenUrls.add(detailUrl);
          
          // Find image
          const container = link.closest('article, [class*="card"], [class*="item"], div') || link.parentElement;
          const img = link.querySelector('img') || container.querySelector('img[src], img[data-src]');
          
          if (!img) return;
          
          const imgSrc = img.getAttribute('src') || img.getAttribute('data-src');
          if (!imgSrc || imgSrc.startsWith('data:')) return;
          
          // Convert image URL to absolute
          let imageUrl;
          try {
            imageUrl = imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, baseUrl).toString();
          } catch (e) {
            return;
          }
          
          // Filter out icons/logos
          if (imageUrl.toLowerCase().match(/icon|logo|avatar|cookie|button|badge|arrow/i)) return;
          if (imageUrl.endsWith('.svg')) return;
          
          // Extract title from image alt, link text, or URL
          let title = img.getAttribute('alt') || link.textContent.trim() || '';
          
          // If no title, try to extract from URL (last part of URL path)
          if (!title && detailUrl) {
            const urlParts = detailUrl.split('/').filter(p => p);
            const lastPart = urlParts[urlParts.length - 1];
            if (lastPart && lastPart !== 'FullSpace' && lastPart.length > 2) {
              // Decode URL and format title
              title = decodeURIComponent(lastPart).replace(/([A-Z])/g, ' $1').trim();
            }
          }
          
          items.push({
            detailUrl: detailUrl,
            thumbnailUrl: imageUrl,
            titleFromList: title || '',
            artistFromList: ''
          });
        });
        
        return items;
      }, COLLECTION_URL);
      
      console.log(`  Found ${pageArtworks.length} artworks on page ${pageNum}`);
      allArtworks.push(...pageArtworks);
      
      if (pageNum < MAX_PAGES) {
        await page.waitForTimeout(DELAY_BETWEEN_PAGES);
      }
    }
    
    console.log(`\nTotal artworks found: ${allArtworks.length}`);
    return allArtworks;
    
  } finally {
    await browser.close();
  }
}

async function parseDetailPage(html, detailUrl, listItem = null) {
  const $ = cheerio.load(html);
  const artwork = {
    detailUrl,
    title: '',
    artist: '',
    date: '',
    objectType: '',
    category: '',
    medium: '',
    dimensions: '',
    description: '',
    location: '',
    categories: [],
    images: [],
    metadata: {},
    jsonLd: null,
    scrapedAt: new Date().toISOString()
  };
  
  // Add thumbnail from list item if available
  if (listItem && listItem.thumbnailUrl) {
    artwork.images.push({ url: listItem.thumbnailUrl, type: 'thumbnail', sourcePageUrl: detailUrl, alt: listItem.titleFromList || '' });
  }
  
  // Extract JSON-LD structured data
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const jsonLd = JSON.parse($(el).html());
      if (jsonLd['@type'] === 'VisualArtwork' || jsonLd['@type'] === 'Artwork' || jsonLd.name) {
        artwork.jsonLd = jsonLd;
        if (!artwork.title && jsonLd.name) artwork.title = jsonLd.name;
        if (!artwork.artist && jsonLd.creator) {
          artwork.artist = typeof jsonLd.creator === 'string' ? jsonLd.creator : (jsonLd.creator.name || jsonLd.creator[0]?.name || '');
        }
        if (!artwork.date && jsonLd.dateCreated) artwork.date = jsonLd.dateCreated;
      }
    } catch (e) {
      // Invalid JSON, skip
    }
  });
  
  // Extract title
  if (!artwork.title) {
    artwork.title = $('h1').first().text().trim() ||
                    $('title').text().replace(/\s*\|\s*.*$/, '').trim() ||
                    $('.title, .artwork-title').first().text().trim() ||
                    '';
  }
  
  // Extract artist
  if (!artwork.artist) {
    artwork.artist = $('.artist, .author, [class*="creator"], [class*="artist"]').first().text().trim() ||
                     $('meta[property="article:author"]').attr('content') ||
                     '';
  }
  
  // Extract metadata from text pattern (CaixaForum format)
  // Format: Title on one line, Artist name in ALL CAPS, Year (4 digits), Medium description, "Medidas: ... cm"
  const bodyText = $('body').text();
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Extract artist (line with ALL CAPS, not CAIXA, VEGAP, etc.)
  if (!artwork.artist) {
    for (const line of lines) {
      if (/^[A-Z][A-Z\s]{3,}$/.test(line) && 
          !line.includes('CAIXA') && 
          !line.includes('VEGAP') && 
          !line.includes('Barcelona') &&
          !line.includes('ACCESO') &&
          !line.includes('Navegación') &&
          !line.includes('OBRAS') &&
          !line.includes('ARTISTAS')) {
        artwork.artist = line;
        break;
      }
    }
  }
  
  // Extract date (4-digit year on its own line)
  if (!artwork.date) {
    for (const line of lines) {
      if (/^\d{4}$/.test(line)) {
        artwork.date = line;
        break;
      }
    }
  }
  
  // Extract medium (line before "Medidas:")
  if (!artwork.medium) {
    const medidasIndex = lines.findIndex(l => l.includes('Medidas:'));
    if (medidasIndex > 0) {
      artwork.medium = lines[medidasIndex - 1];
    }
  }
  
  // Extract dimensions (line containing "Medidas: ... cm")
  if (!artwork.dimensions) {
    for (const line of lines) {
      if (line.includes('Medidas:') || (line.includes('cm') && line.match(/\d+\s*x\s*\d+/))) {
        artwork.dimensions = line.replace(/Medidas:\s*/i, '').trim();
        break;
      }
    }
  }
  
  // Extract metadata from common patterns (fallback)
  $('.field, .metadata, .artwork-info, [class*="detail"], dt').each((i, el) => {
    const $el = $(el);
    const label = $el.find('.label, [class*="label"], strong, dt').first().text().toLowerCase().trim() || $el.text().toLowerCase().trim();
    const value = $el.find('.value, [class*="value"], dd, p').first().text().trim();
    
    if (!value || value.length < 2) return;
    
    if (label.includes('date') || label.includes('year') || label.includes('production')) {
      if (!artwork.date) artwork.date = value;
    } else if (label.includes('medium') || label.includes('technique') || label.includes('material')) {
      if (!artwork.medium) artwork.medium = value;
    } else if (label.includes('dimension') || label.includes('size') || label.includes('measure')) {
      if (!artwork.dimensions) artwork.dimensions = value;
    } else if (label.includes('location') || label.includes('collection')) {
      if (!artwork.location) artwork.location = value;
    }
  });
  
  // Extract description (usually after dimensions)
  if (!artwork.description) {
    const descriptionLines = [];
    const startIndex = lines.findIndex(l => l.includes('cm') || l.includes('Referencia:'));
    if (startIndex >= 0) {
      for (let i = startIndex + 1; i < Math.min(startIndex + 10, lines.length); i++) {
        const line = lines[i];
        if (line.length > 20 && 
            !line.includes('Añadir') && 
            !line.includes('Imprimir') &&
            !line.includes('VOLVER') &&
            !line.includes('Lightbox')) {
          descriptionLines.push(line);
        }
      }
      artwork.description = descriptionLines.join(' ').substring(0, 500);
    }
  }
  
  if (!artwork.description) {
    artwork.description = $('.description, .artwork-description, [class*="description"]').first().text().trim() ||
                          $('p').not('.meta, .metadata').first().text().trim() ||
                          '';
  }
  
  return artwork;
}

async function main() {
  console.log('Starting CaixaForum collection scraper...');
  console.log(`Scraping up to ${MAX_PAGES} pages (full collection)`);
  
  try {
    // Fetch list of artworks (or use saved list if available)
    let listItems = [];
    try {
      const savedListData = await fs.readFile(LIST_ITEMS_FILE, 'utf-8');
      const savedList = JSON.parse(savedListData);
      if (savedList.items && savedList.items.length > 0) {
        console.log(`Found saved list items: ${savedList.items.length} artworks`);
        console.log(`Saved at: ${savedList.savedAt || 'unknown'}`);
        const useSaved = process.argv.includes('--use-saved') || process.argv.includes('--resume');
        if (useSaved) {
          listItems = savedList.items;
          console.log('Using saved list items. To re-scrape list, run without --use-saved flag.');
        } else {
          console.log('Re-scraping list (use --use-saved to use saved list)');
          listItems = await fetchListWithPlaywright();
          // Save list items
          await fs.mkdir(path.dirname(LIST_ITEMS_FILE), { recursive: true });
          await fs.writeFile(LIST_ITEMS_FILE, JSON.stringify({ items: listItems, savedAt: new Date().toISOString() }, null, 2), 'utf-8');
          console.log(`Saved ${listItems.length} list items to ${LIST_ITEMS_FILE}`);
        }
      } else {
        listItems = await fetchListWithPlaywright();
        // Save list items
        await fs.mkdir(path.dirname(LIST_ITEMS_FILE), { recursive: true });
        await fs.writeFile(LIST_ITEMS_FILE, JSON.stringify({ items: listItems, savedAt: new Date().toISOString() }, null, 2), 'utf-8');
        console.log(`Saved ${listItems.length} list items to ${LIST_ITEMS_FILE}`);
      }
    } catch (e) {
      // File doesn't exist or is invalid, fetch fresh list
      console.log('No saved list items found, fetching fresh list...');
      listItems = await fetchListWithPlaywright();
      // Save list items
      await fs.mkdir(path.dirname(LIST_ITEMS_FILE), { recursive: true });
      await fs.writeFile(LIST_ITEMS_FILE, JSON.stringify({ items: listItems, savedAt: new Date().toISOString() }, null, 2), 'utf-8');
      console.log(`Saved ${listItems.length} list items to ${LIST_ITEMS_FILE}`);
    }
    
    if (listItems.length === 0) {
      console.log('No artworks found in list. Exiting.');
      return;
    }
    
    console.log(`\nProcessing ${listItems.length} artworks...`);
    
    const browser = await chromium.launch({ headless: true });
    const artworks = [];
    const progress = {
      total: listItems.length,
      processed: 0,
      errors: 0,
      skipped: 0
    };
    
    for (let i = 0; i < listItems.length; i++) {
      const item = listItems[i];
      progress.processed = i + 1;
      
      try {
        console.log(`[${progress.processed}/${progress.total}] Fetching: ${item.detailUrl}`);
        
        const page = await browser.newPage();
        await page.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for page to actually load (not maintenance page)
        // Use shorter timeout to avoid taking too long
        let attempts = 0;
        let isLoaded = false;
        while (attempts < 20 && !isLoaded) {
          await page.waitForTimeout(1000);
          const bodyText = await page.evaluate(() => document.body.innerText);
          // Check if we have actual content (not maintenance message)
          if (!bodyText.includes('mantenimiento') && 
              !bodyText.includes('maintenance') && 
              bodyText.length > 500) {
            // Check for actual artwork data patterns
            if (bodyText.match(/\d{4}/) || bodyText.match(/[A-Z][A-Z\s]{4,}/)) {
              isLoaded = true;
              break;
            }
          }
          attempts++;
        }
        
        // Additional wait for full rendering if loaded
        if (isLoaded) {
          await page.waitForTimeout(2000);
        }
        const html = await page.content();
        await page.close();
        
        const artwork = await parseDetailPage(html, item.detailUrl, item);
        
        if (artwork && artwork.images.length > 0) {
          // Use list data as fallback (since detail pages may be under maintenance)
          if (!artwork.title || artwork.title.includes('Fundación')) {
            if (item.titleFromList) {
              artwork.title = item.titleFromList;
            } else {
              // Extract title from URL as last resort
              const urlParts = item.detailUrl.split('/').filter(p => p);
              const lastPart = urlParts[urlParts.length - 1];
              if (lastPart) {
                artwork.title = decodeURIComponent(lastPart).replace(/([A-Z])/g, ' $1').trim();
              }
            }
          }
          if (!artwork.artist && item.artistFromList) artwork.artist = item.artistFromList;
          
          artworks.push(artwork);
        } else {
          console.log(`  Skipping: No valid images found`);
          progress.skipped++;
        }
      } catch (error) {
        console.error(`  Error processing ${item.detailUrl}:`, error.message);
        progress.errors++;
      }
    }
    
    await browser.close();
    
    console.log(`\nScraping complete!`);
    console.log(`  Total processed: ${progress.processed}`);
    console.log(`  Successful: ${artworks.length}`);
    console.log(`  Skipped (no images): ${progress.skipped}`);
    console.log(`  Errors: ${progress.errors}`);
    
    // Save to file
    const output = {
      artworks,
      scrapedAt: new Date().toISOString(),
      totalCount: artworks.length
    };
    
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\nData saved to: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fetchListWithPlaywright, parseDetailPage };
