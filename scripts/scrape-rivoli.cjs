/**
 * Castello di Rivoli Museum Scraper
 * Scrapes artworks from https://www.castellodirivoli.org/en/collections/
 * 
 * Extracts: title, artist, year, medium, dimensions, image
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ CONFIGURATION ============
const CONFIG = {
  collectionUrl: 'https://www.castellodirivoli.org/en/collections/',
  outputPath: path.join(__dirname, '../public/data/castello-di-rivoli-collection.json'),
  progressPath: path.join(__dirname, '../downloads/castello-di-rivoli-progress.json'),
  logPath: path.join(__dirname, '../downloads/castello-di-rivoli-scrape-log.json'),
  
  concurrency: 5,
  saveInterval: 50,
  testMode: false,
  testLimit: 3,
  
  retryAttempts: 3,
  pageTimeout: 30000,
  scrollDelay: 500
};

// ============ HELPER FUNCTIONS ============

function loadProgress() {
  if (fs.existsSync(CONFIG.progressPath)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG.progressPath, 'utf8'));
    } catch (e) {
      console.log('Could not load progress, starting fresh');
    }
  }
  return { completed: [], failed: [], artworks: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(CONFIG.progressPath, JSON.stringify(progress, null, 2));
}

function saveResults(artworks, log) {
  // Ensure output directory exists
  const outputDir = path.dirname(CONFIG.outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save artworks
  fs.writeFileSync(CONFIG.outputPath, JSON.stringify(artworks, null, 2));
  console.log(`Saved ${artworks.length} artworks to ${CONFIG.outputPath}`);
  
  // Save log
  const logDir = path.dirname(CONFIG.logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG.logPath, JSON.stringify(log, null, 2));
}

function parseArtworkMetadata(text, title) {
  /**
   * Parse structured text like:
   * "Title Artist Name Name 1972 medium description dimensions..."
   */
  const result = {
    title: title || '',
    artist: '',
    date: '',
    medium: '',
    dimensions: '',
    description: ''
  };
  
  if (!text) return result;
  
  // Clean up the text
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Look for "Artist" keyword followed by name and year
  // Pattern: "Artist [Name(s)] [Year]"
  const artistYearPattern = /Artist\s+([A-Za-zÀ-ÿ\s\-'\.]+?)\s+(\d{4})/i;
  const artistMatch = cleanText.match(artistYearPattern);
  
  if (artistMatch) {
    result.artist = artistMatch[1].trim();
    result.date = artistMatch[2];
    
    // Extract medium - text after year until we hit ownership or dimensions
    const afterYear = cleanText.split(artistMatch[2])[1] || '';
    
    // Look for where medium ends (usually at ownership info or dimensions)
    let mediumEnd = afterYear.length;
    const endMarkers = [
      'Castello di Rivoli',
      'Fondazione',
      'Collection',
      'on loan',
      'Purchased',
      'Gift',
      'Acquired'
    ];
    
    for (const marker of endMarkers) {
      const idx = afterYear.indexOf(marker);
      if (idx !== -1 && idx < mediumEnd) {
        mediumEnd = idx;
      }
    }
    
    result.medium = afterYear.substring(0, mediumEnd).trim();
    
    // Clean up medium - remove leading/trailing punctuation
    result.medium = result.medium.replace(/^[\s,;:]+|[\s,;:]+$/g, '');
  } else {
    // Alternative: Look for year separately if no "Artist" keyword
    const yearMatch = cleanText.match(/\b(19\d{2}|20[0-2]\d)\b/);
    if (yearMatch) {
      result.date = yearMatch[1];
    }
  }
  
  // Look for dimensions (contains measurements like "x" or units)
  const dimPatterns = [
    /(\d+\s*(?:\/\d+)?\s*x\s*\d+[^A-Za-z]*(?:x\s*\d+[^A-Za-z]*)?(?:in\.|cm|mm)?)/gi,
    /(\d+\s*(?:\/\d+)?\s*x\s*\d+\s*(?:\/\d+)?\s*in\.)/gi
  ];
  
  for (const pattern of dimPatterns) {
    const dimMatch = cleanText.match(pattern);
    if (dimMatch) {
      result.dimensions = dimMatch[0].trim();
      break;
    }
  }
  
  return result;
}

// ============ MAIN SCRAPING FUNCTIONS ============

async function collectArtworkUrls(page) {
  console.log('Collecting artwork URLs from collection page...');
  
  await page.goto(CONFIG.collectionUrl, { waitUntil: 'networkidle', timeout: CONFIG.pageTimeout });
  
  // Scroll to load all content
  let previousHeight = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 20;
  
  while (scrollAttempts < maxScrollAttempts) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    if (currentHeight === previousHeight) break;
    
    previousHeight = currentHeight;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(CONFIG.scrollDelay);
    scrollAttempts++;
  }
  
  // Collect unique artwork URLs
  const urls = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/en/opera/"]');
    return [...new Set(Array.from(links).map(a => a.href))];
  });
  
  console.log(`Found ${urls.length} unique artwork URLs`);
  return urls;
}

async function scrapeArtworkPage(page, url, retryCount = 0) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: CONFIG.pageTimeout });
    
    const data = await page.evaluate(() => {
      // Get title from h1
      const h1 = document.querySelector('h1');
      const title = h1 ? h1.textContent.trim() : '';
      
      // Check for 404
      if (title.includes('404') || title.includes('not found')) {
        return null;
      }
      
      // Get the article or main content area
      const article = document.querySelector('article');
      let contentText = '';
      
      if (article) {
        // Get all paragraph and div text within the article, but exclude navigation/related sections
        const contentElements = article.querySelectorAll('.entry-content p, .entry-content > div:not(.related), .post-content p');
        if (contentElements.length > 0) {
          contentText = Array.from(contentElements).map(el => el.textContent.trim()).join(' ');
        }
        
        // If no specific content found, try to get text that includes "Artist"
        if (!contentText.includes('Artist')) {
          // Get the full article text
          const fullText = article.innerText;
          // Find the section that contains metadata
          const lines = fullText.split('\n').filter(l => l.trim());
          
          // Look for the line with "Artist" and get surrounding lines
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Artist')) {
              // Get title, artist line, and next few lines for medium/dimensions
              contentText = lines.slice(Math.max(0, i-1), i+5).join(' ');
              break;
            }
          }
          
          // If still not found, get all text before "The complete works"
          if (!contentText.includes('Artist')) {
            const beforeComplete = fullText.split('The complete works')[0];
            contentText = beforeComplete.replace(/\s+/g, ' ').trim();
          }
        }
      }
      
      // Get main image
      const imgs = document.querySelectorAll('img[src*="uploads"]');
      let mainImage = '';
      for (const img of imgs) {
        const src = img.src;
        if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('-150x') && !src.includes('-300x')) {
          mainImage = src;
          break;
        }
      }
      
      return {
        title,
        contentText: contentText.replace(/\s+/g, ' ').trim().substring(0, 2000),
        image: mainImage
      };
    });
    
    if (!data) {
      return { error: '404 or content not found' };
    }
    
    // Parse metadata from content text
    const metadata = parseArtworkMetadata(data.contentText, data.title);
    
    return {
      title: metadata.title,
      artist: metadata.artist,
      date: metadata.date,
      medium: metadata.medium,
      dimensions: metadata.dimensions,
      image: data.image,
      url: url,
      rawText: data.contentText.substring(0, 500)
    };
    
  } catch (error) {
    if (retryCount < CONFIG.retryAttempts) {
      console.log(`  Retry ${retryCount + 1} for ${url}`);
      await page.waitForTimeout(2000);
      return scrapeArtworkPage(page, url, retryCount + 1);
    }
    return { error: error.message, url };
  }
}

async function scrapeArtworks(browser, urls, progress) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(CONFIG.pageTimeout);
  
  const artworks = progress.artworks || [];
  const completedUrls = new Set(progress.completed || []);
  const failedUrls = progress.failed || [];
  
  // Filter out already completed URLs
  const urlsToProcess = urls.filter(url => !completedUrls.has(url));
  
  // Apply test limit if in test mode
  const processUrls = CONFIG.testMode ? urlsToProcess.slice(0, CONFIG.testLimit) : urlsToProcess;
  
  console.log(`\nProcessing ${processUrls.length} artworks...`);
  if (CONFIG.testMode) {
    console.log(`(TEST MODE - limiting to ${CONFIG.testLimit} items)`);
  }
  
  for (let i = 0; i < processUrls.length; i++) {
    const url = processUrls[i];
    const slug = url.split('/opera/')[1]?.replace('/', '') || url;
    
    console.log(`[${i + 1}/${processUrls.length}] Scraping: ${slug}`);
    
    const result = await scrapeArtworkPage(page, url);
    
    if (result.error) {
      console.log(`  ❌ Failed: ${result.error}`);
      failedUrls.push({ url, error: result.error });
    } else {
      console.log(`  ✓ ${result.artist || 'Unknown Artist'} - ${result.title}`);
      artworks.push(result);
      completedUrls.add(url);
    }
    
    // Save progress periodically
    if ((i + 1) % CONFIG.saveInterval === 0) {
      console.log(`\n--- Saving progress (${artworks.length} artworks) ---\n`);
      saveProgress({
        completed: Array.from(completedUrls),
        failed: failedUrls,
        artworks: artworks
      });
    }
  }
  
  await context.close();
  
  return { artworks, completed: Array.from(completedUrls), failed: failedUrls };
}

// ============ MAIN ============

async function main() {
  const args = process.argv.slice(2);
  CONFIG.testMode = args.includes('--test');
  
  if (args.includes('--limit')) {
    const limitIdx = args.indexOf('--limit');
    CONFIG.testLimit = parseInt(args[limitIdx + 1]) || 3;
  }
  
  console.log('='.repeat(60));
  console.log('Castello di Rivoli Museum Scraper');
  console.log('='.repeat(60));
  console.log(`Test Mode: ${CONFIG.testMode}`);
  if (CONFIG.testMode) {
    console.log(`Test Limit: ${CONFIG.testLimit} items`);
  }
  console.log('');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(CONFIG.pageTimeout);
  
  try {
    // Load previous progress
    const progress = loadProgress();
    console.log(`Loaded progress: ${progress.completed?.length || 0} completed, ${progress.failed?.length || 0} failed`);
    
    // Collect artwork URLs
    const urls = await collectArtworkUrls(page);
    
    if (urls.length === 0) {
      console.log('No artwork URLs found!');
      await browser.close();
      return;
    }
    
    // Scrape artworks
    const results = await scrapeArtworks(browser, urls, progress);
    
    // Save final results
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total artworks: ${results.artworks.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    // Create final output
    const output = results.artworks.map((item, idx) => ({
      id: `rivoli-${idx + 1}`,
      title: item.title || '',
      artist: item.artist || '',
      date: item.date || '',
      medium: item.medium || '',
      dimensions: item.dimensions || '',
      imageUrl: item.image || '',
      sourceUrl: item.url || ''
    }));
    
    const log = {
      museum: 'Castello di Rivoli',
      scrapedAt: new Date().toISOString(),
      totalArtworks: output.length,
      failedUrls: results.failed,
      testMode: CONFIG.testMode
    };
    
    saveResults(output, log);
    saveProgress(results);
    
  } catch (error) {
    console.error('Scraping error:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
