const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

const COLLECTION_URL = 'https://www.salvador-dali.org/en/artwork/collection/online-collection/';
const OUTPUT_FILE = path.join(__dirname, '../public/data/dali-foundation-collection.json');
const MAX_SHOW_MORE_CLICKS = 1000; // 전체 스크래핑: Show more 버튼이 없을 때까지 클릭
const DELAY_BETWEEN_CLICKS = 2000; // 클릭 사이 대기 시간 (ms)

async function fetchListWithPlaywright() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log(`Navigating to ${COLLECTION_URL}...`);
    await page.goto(COLLECTION_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for the list to load - try multiple selectors
    await page.waitForSelector('article, [class*="artwork"], [class*="item"], h2, h3', { timeout: 30000 }).catch(() => {
      console.log('Warning: Could not find expected list selector');
    });
    
    // Additional wait for dynamic content
    await page.waitForTimeout(3000);
    
    console.log('Clicking "Show more" link until all artworks are loaded...');
    let clickCount = 0;
    for (let i = 0; i < MAX_SHOW_MORE_CLICKS; i++) {
      try {
        // Look for the "Show more" link with class coeli-more-results
        const showMoreLink = await page.locator('a.coeli-more-results, a.coeli-more-results.next-page').first();
        
        const isVisible = await showMoreLink.isVisible({ timeout: 2000 }).catch(() => false);
        if (!isVisible) {
          console.log(`  "Show more" link not found after ${clickCount} clicks, all artworks loaded.`);
          break;
        }
        
        clickCount++;
        console.log(`  Clicking "Show more" link (click ${clickCount})...`);
        await showMoreLink.scrollIntoViewIfNeeded();
        await showMoreLink.click({ timeout: 5000 });
        await page.waitForTimeout(DELAY_BETWEEN_CLICKS);
      } catch (error) {
        console.log(`  Error clicking "Show more" link (click ${clickCount + 1}):`, error.message);
        break;
      }
    }
    
    if (clickCount > 0) {
      console.log(`  Total "Show more" clicks: ${clickCount}`);
    }
    
    // Wait for final load
    await page.waitForTimeout(2000);
    
    console.log('Extracting artwork links...');
    
    // Extract artworks from list page (with thumbnails and links)
    console.log('Extracting artworks from list page...');
    
    // Wait a bit more for content to load
    await page.waitForTimeout(2000);
    
    // Debug: check what images and links are on the page
    const pageDebug = await page.evaluate(() => {
      const allImgs = Array.from(document.querySelectorAll('img[src]'));
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      const imgLinks = allImgs.map(img => {
        const link = img.closest('a');
        return link ? {
          href: link.href,
          imgSrc: img.src || img.getAttribute('data-src') || '',
          hasText: (link.textContent || '').trim().length > 3
        } : null;
      }).filter(Boolean);
      return {
        totalImgs: allImgs.length,
        imgLinks: imgLinks.length,
        sample: imgLinks.slice(0, 10)
      };
    });
    console.log(`Debug: Found ${pageDebug.totalImgs} images, ${pageDebug.imgLinks} images with links`);
    if (pageDebug.sample.length > 0) {
      console.log('Sample image links:', pageDebug.sample.slice(0, 5));
    }
    
    const artworks = await page.evaluate((baseUrl) => {
      const items = [];
      const seenUrls = new Set();
      
      // Strategy: Find all images first, then find their parent links
      const allImgs = Array.from(document.querySelectorAll('img[src], img[data-src], img[data-lazy-src]'));
      const imageLinkMap = new Map();
      
      allImgs.forEach((img) => {
        const imgSrc = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (!imgSrc) return;
        
        // Filter out icons/logos
        const imgLower = imgSrc.toLowerCase();
        if (imgLower.match(/icon|logo|avatar|cookie|button|badge|arrow|close|menu/i)) return;
        if (imgLower.endsWith('.svg')) return;
        
        // Check image size
        const imgWidth = img.getAttribute('width') || img.naturalWidth || 0;
        const imgHeight = img.getAttribute('height') || img.naturalHeight || 0;
        if (imgWidth > 0 && imgWidth < 80 && imgHeight > 0 && imgHeight < 80) return;
        
        // Find parent link
        const link = img.closest('a[href]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        if (!href) return;
        
        // Convert to absolute URL
        let detailUrl;
        try {
          detailUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        } catch (e) {
          return;
        }
        
        // Convert image URL to absolute
        let imageUrl;
        try {
          imageUrl = imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, baseUrl).toString();
        } catch (e) {
          return;
        }
        
        // Store the mapping (link URL -> image URL)
        if (!imageLinkMap.has(detailUrl) || !imageLinkMap.get(detailUrl).thumbnailUrl) {
          imageLinkMap.set(detailUrl, {
            thumbnailUrl: imageUrl,
            link: link,
            img: img
          });
        }
      });
      
      // Process all unique links
      imageLinkMap.forEach((data, detailUrl) => {
        // Filter URLs
        if (seenUrls.has(detailUrl)) return;
        if (!detailUrl.includes('salvador-dali.org')) return;
        if (detailUrl.includes('?offset=') || detailUrl.includes('?page=')) return;
        if (detailUrl.includes('#primary') || detailUrl.includes('#')) return;
        
        // Must be a heritageobject detail page
        const heritageObjectMatch = detailUrl.match(/\/heritageobject\/(\d+)/);
        if (!heritageObjectMatch) return;
        
        seenUrls.add(detailUrl);
        
        const link = data.link;
        const container = link.closest('article, li, [class*="item"], [class*="card"], [class*="artwork"], div') || link.parentElement;
        
        // Extract title and artist from container text
        const text = (container.textContent || '').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
        
        let title = '';
        let artist = '';
        
        // Try to find title (usually first meaningful line that's not navigation)
        for (const line of lines) {
          if (line.length > 3 && 
              !line.match(/^(Show more|Collection|Artwork|EN|ES|CA|FR|Search|Clear|Skip|Cookie|Duration|Description|Menu|Close)/i) &&
              !line.match(/^\d{4}/)) { // Not a year
            title = line;
            break;
          }
        }
        
        // Try to find artist (usually contains "Dalí" or artist name pattern)
        for (const line of lines) {
          if (line.includes('Dalí') || line.match(/^[A-Z][a-z]+ [A-Z]/)) {
            const artistMatch = line.match(/^([^,\n\(]+?)(?:\s*,\s*|\s+\()/);
            if (artistMatch && artistMatch[1]) {
              const candidate = artistMatch[1].trim();
              if (candidate.length > 3 && candidate !== title) {
                artist = candidate;
                break;
              }
            }
          }
        }
        
        // If no title found, try from link text or image alt
        if (!title) {
          title = link.textContent.trim() || data.img.getAttribute('alt') || '';
        }
        
        items.push({
          detailUrl: detailUrl,
          thumbnailUrl: data.thumbnailUrl,
          titleFromList: title || '',
          artistFromList: artist || ''
        });
      });
      
      return items;
    }, COLLECTION_URL);
    
    console.log(`Found ${artworks.length} artwork links`);
    return artworks;
    
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
    images: [], // Will be filled from list page thumbnail
    metadata: {},
    jsonLd: null,
    scrapedAt: new Date().toISOString()
  };
  
  // Add thumbnail from list item if available (this is the main image source)
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
  
  // Extract metadata from text pattern: "Label:\nValue"
  // Dalí Foundation uses format like:
  // Author:
  // Dou, Gerard (1613-1675)
  // Date:
  // 1660-1665
  // Object name:
  // Painting
  // Technique:
  // Oil on wood panel
  const bodyText = $('body').text();
  const metadataMap = {};
  
  // Try to extract Author, Date, Object name, Technique
  const authorMatch = bodyText.match(/Author:\s*\n\s*([^\n]+)/);
  if (authorMatch) {
    metadataMap.artist = authorMatch[1].trim();
  }
  
  const dateMatch = bodyText.match(/Date:\s*\n\s*([^\n]+)/);
  if (dateMatch) {
    metadataMap.date = dateMatch[1].trim();
  }
  
  const objectNameMatch = bodyText.match(/Object name:\s*\n\s*([^\n]+)/);
  if (objectNameMatch) {
    metadataMap.objectType = objectNameMatch[1].trim();
    metadataMap.category = objectNameMatch[1].trim();
  }
  
  const techniqueMatch = bodyText.match(/Technique:\s*\n\s*([^\n]+)/);
  if (techniqueMatch) {
    metadataMap.medium = techniqueMatch[1].trim();
  }
  
  // Apply extracted metadata
  if (!artwork.artist && metadataMap.artist) artwork.artist = metadataMap.artist;
  if (!artwork.date && metadataMap.date) artwork.date = metadataMap.date;
  if (!artwork.objectType && metadataMap.objectType) artwork.objectType = metadataMap.objectType;
  if (!artwork.category && metadataMap.category) artwork.category = metadataMap.category;
  if (!artwork.medium && metadataMap.medium) artwork.medium = metadataMap.medium;
  
  // Extract artist (fallback)
  if (!artwork.artist) {
    artwork.artist = $('.artist, .author, [class*="creator"]').first().text().trim() ||
                     $('meta[property="article:author"]').attr('content') ||
                     '';
  }
  
  // Extract metadata from common patterns (fallback)
  // Try to find label-value pairs
  $('.field, .metadata, .artwork-info, [class*="detail"]').each((i, el) => {
    const $el = $(el);
    const label = $el.find('.label, [class*="label"], strong, dt').first().text().toLowerCase().trim();
    const value = $el.find('.value, [class*="value"], dd, p').first().text().trim();
    
    if (!value) return;
    
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
  
  // Try to extract from structured data
  const metaTags = {
    'date': $('meta[property="article:published_time"], meta[name="date"]').attr('content'),
    'description': $('meta[name="description"], meta[property="og:description"]').attr('content')
  };
  
  if (metaTags.date && !artwork.date) {
    const yearMatch = metaTags.date.match(/\d{4}/);
    if (yearMatch) artwork.date = yearMatch[0];
  }
  
  if (metaTags.description && !artwork.description) {
    artwork.description = metaTags.description;
  }
  
  // Extract description
  if (!artwork.description) {
    artwork.description = $('.description, .artwork-description, [class*="description"]').first().text().trim() ||
                          $('p').not('.meta, .metadata').first().text().trim() ||
                          '';
  }
  
  // Extract images from img tags in main content
  $('main img, .content img, .artwork-image img, article img').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (!src) return;
    
    const fullUrl = src.startsWith('http') ? src : new URL(src, detailUrl).href;
    if (isValidArtworkImage(fullUrl) && !seenImageUrls.has(fullUrl)) {
      artwork.images.push({ url: fullUrl, type: 'content' });
      seenImageUrls.add(fullUrl);
    }
  });
  
  // Note: Images will be added from list page thumbnail in main()
  // We don't exclude artworks without images here since we use list page thumbnails
  
  return artwork;
}

async function main() {
  console.log('Starting Salvador Dalí Foundation collection scraper...');
  console.log('Full scrape mode: Clicking "Show more" until all artworks are loaded');
  
  try {
    // Fetch list of artworks
    const listItems = await fetchListWithPlaywright();
    
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
        await page.goto(item.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
        const html = await page.content();
        await page.close();
        
        const artwork = await parseDetailPage(html, item.detailUrl, item);
        
        if (artwork && artwork.images.length > 0) {
          // Use list data as fallback
          if (!artwork.title && item.titleFromList) artwork.title = item.titleFromList;
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
