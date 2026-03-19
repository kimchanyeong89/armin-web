const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHM100Complete() {
  console.log('🎨 KHM Museum - Complete 100 Artworks with Full Metadata\n');
  console.log('Strategy: Multiple search URLs + Detail page scraping\n');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // Comprehensive list of different search URLs to collect 100+ unique items
  const searchUrls = [
    // Main collections
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_tags=9479', // With images
    
    // Different classifications
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=48', // Paintings
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=49', // Decorative Arts
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=50', // Antiquities
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=51', // Musical Instruments
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=52', // Sculptures
    
    // Date ranges - Ancient
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=-1000&facet_date_end=0',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=0&facet_date_end=500',
    
    // Date ranges - Medieval to Renaissance
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=500&facet_date_end=1000',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1000&facet_date_end=1300',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1300&facet_date_end=1500',
    
    // Century searches
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1500&facet_date_end=1599',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1600&facet_date_end=1699',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1700&facet_date_end=1799',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1800&facet_date_end=1899',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_date_begin=1900&facet_date_end=2025',
    
    // Combined filters
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=48&facet_tags=9479',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=50&facet_tags=9479',
    'https://www.khm.at/en/artworks/search?tx_theme_objectlist[controller]=Object&facet_classification=51&facet_date_begin=1600&facet_date_end=1800',
  ];
  
  console.log(`📂 Will search ${searchUrls.length} different URLs\n`);
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    for (const [index, searchUrl] of searchUrls.entries()) {
      if (results.length >= 100) {
        console.log(`\n🎯 Reached 100 items! Stopping collection.\n`);
        break;
      }
      
      console.log(`[${index + 1}/${searchUrls.length}] Searching...`);
      
      try {
        await page.goto(searchUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        
        // Wait for items to load
        try {
          await page.waitForSelector('.object-gallery-item', { timeout: 5000 });
        } catch {
          console.log(`   ⚠️  No items found, skipping`);
          continue;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Extract all items from current page
        const items = await page.evaluate((baseUrl) => {
          const results = [];
          document.querySelectorAll('.grid-item .object-gallery-item').forEach(el => {
            const link = el.querySelector('a.detail');
            if (!link) return;
            
            const href = link.getAttribute('href');
            const objectId = link.getAttribute('data-id');
            const img = el.querySelector('img');
            const caption = el.querySelector('.object-caption p');
            const spans = caption?.querySelectorAll('span') || [];
            
            const title = spans[0]?.textContent?.trim() || img?.alt || 'Untitled';
            const culture = spans[1]?.querySelector('small')?.textContent?.trim() || '';
            const date = spans[2]?.querySelector('small')?.textContent?.trim() || '';
            const imageSrc = img?.src || '';
            
            results.push({
              id: objectId,
              url: href?.startsWith('http') ? href : baseUrl + href,
              title: title,
              culture: culture,
              date: date,
              imageUrl: imageSrc,
              artist: culture
            });
          });
          return results;
        }, baseUrl);
        
        // Add only unique items
        const existingIds = new Set(results.map(r => r.id));
        const newItems = items.filter(item => item.id && !existingIds.has(item.id));
        
        if (newItems.length > 0) {
          results.push(...newItems);
          console.log(`   ✅ Added ${newItems.length} new items (Total: ${results.length}/100)`);
        } else {
          console.log(`   ⚠️  All ${items.length} items were duplicates`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
    
    await browser.close();
    
    console.log(`\n✅ Collection phase complete: ${results.length} unique artworks\n`);
    
    if (results.length < 100) {
      console.log(`⚠️  Only collected ${results.length} items. Continuing with enhancement...\n`);
    }
    
    // Limit to 100
    const limited = results.slice(0, 100);
    
    // Phase 2: Enhance each artwork with detailed metadata from detail pages
    console.log(`📋 Phase 2: Fetching detailed metadata for ${limited.length} artworks\n`);
    
    const enhanced = [];
    
    for (const [index, artwork] of limited.entries()) {
      console.log(`[${index + 1}/${limited.length}] ${artwork.title.substring(0, 50)}...`);
      
      try {
        const response = await axios.get(artwork.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          },
          timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        // Extract all metadata fields
        const metadata = {};
        
        // Method 1: Look for dt/dd pairs
        $('dt').each((i, el) => {
          const key = $(el).text().trim().toLowerCase();
          const value = $(el).next('dd').text().trim();
          if (key && value) {
            metadata[key] = value;
          }
        });
        
        // Method 2: Look for labeled fields
        $('.object-detail-data .field, .metadata-field').each((i, el) => {
          const label = $(el).find('.field-label, .label').text().trim().toLowerCase();
          const value = $(el).find('.field-value, .value').text().trim();
          if (label && value) {
            metadata[label] = value;
          }
        });
        
        // Get description
        let description = '';
        const descSelectors = [
          '.object-description',
          '.description',
          '.detail-description',
          '[itemprop="description"]',
          '.text-content',
          '.object-text'
        ];
        
        for (const selector of descSelectors) {
          const desc = $(selector).first().text().trim();
          if (desc && desc.length > description.length) {
            description = desc;
          }
        }
        
        // Get high-res image
        let highResImage = artwork.imageUrl;
        const imgSrc = $('.object-image img, .detail-image img, [itemprop="image"]').first().attr('src');
        if (imgSrc) {
          highResImage = imgSrc.startsWith('http') ? imgSrc : baseUrl + imgSrc;
        }
        
        // Extract specific fields with multiple possible names
        const medium = metadata.material || metadata.medium || metadata.technique || 
                      metadata.technik || metadata.materials || '';
        
        const dimensions = metadata.dimensions || metadata.maße || metadata.size || 
                          metadata.größe || metadata.measurements || '';
        
        const objectType = metadata['object type'] || metadata.objekttyp || 
                          metadata.category || metadata.kategorie || '';
        
        const inventory = metadata.inventory || metadata['inventory number'] || 
                         metadata.inventarnummer || metadata['inv. no.'] || artwork.id || '';
        
        const period = metadata.period || metadata.periode || metadata.epoch || '';
        const provenance = metadata.provenance || metadata.provenienz || metadata.herkunft || '';
        const creditLine = metadata['credit line'] || metadata.credit || '';
        const location = metadata.location || metadata.standort || metadata.display || '';
        
        // Determine highlight status (look for badges, featured tags)
        const isHighlight = $('.highlight-badge, .featured, [class*="highlight"]').length > 0 ||
                           description.toLowerCase().includes('highlight') ||
                           description.toLowerCase().includes('masterpiece');
        
        const enhancedArtwork = {
          id: artwork.id || inventory || `khm_${index + 1}`,
          url: artwork.url,
          title: artwork.title,
          artist: artwork.culture || '',
          culture: artwork.culture || '',
          date: artwork.date || '',
          period: period,
          medium: medium,
          dimensions: dimensions,
          inventory: inventory,
          imageUrl: highResImage,
          classification: determineClassification(artwork.title, artwork.culture, objectType),
          objectType: objectType || determineObjectType(artwork.title, artwork.culture),
          category: artwork.culture || objectType || '',
          isHighlight: isHighlight,
          description: description.substring(0, 1000),
          provenance: provenance,
          creditLine: creditLine,
          location: location,
          source: 'Kunsthistorisches Museum Vienna',
          sourceUrl: baseUrl,
          index: index + 1
        };
        
        enhanced.push(enhancedArtwork);
        
        // Show what we enhanced
        const enhancements = [];
        if (medium) enhancements.push('medium');
        if (dimensions) enhancements.push('dimensions');
        if (description) enhancements.push('description');
        if (objectType) enhancements.push('type');
        
        if (enhancements.length > 0) {
          console.log(`   ✓ Enhanced: ${enhancements.join(', ')}`);
        } else {
          console.log(`   ⚠️  No additional metadata found`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 600));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        // Keep basic artwork data if detail fetch fails
        enhanced.push({
          ...artwork,
          medium: '',
          dimensions: '',
          inventory: artwork.id || '',
          classification: determineClassification(artwork.title, artwork.culture, ''),
          objectType: determineObjectType(artwork.title, artwork.culture),
          category: artwork.culture || '',
          isHighlight: false,
          description: '',
          source: 'Kunsthistorisches Museum Vienna',
          sourceUrl: baseUrl,
          index: index + 1
        });
      }
    }
    
    // Save results
    const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
    fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
    
    console.log(`\n✅ Successfully scraped and enhanced ${enhanced.length} artworks!`);
    console.log(`📁 Saved to: khm-test-100.json\n`);
    
    // Comprehensive statistics
    printStatistics(enhanced);
    
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
  }
}

function determineClassification(title, culture, objectType) {
  const titleLower = (title || '').toLowerCase();
  const cultureLower = (culture || '').toLowerCase();
  const typeLower = (objectType || '').toLowerCase();
  
  if (titleLower.includes('gemälde') || titleLower.includes('painting') || typeLower.includes('painting')) return 'Painting';
  if (titleLower.includes('skulptur') || titleLower.includes('statue') || titleLower.includes('büste') || typeLower.includes('sculpture')) return 'Sculpture';
  if (cultureLower.includes('römisch') || cultureLower.includes('griechisch') || cultureLower.includes('hellenistisch') || cultureLower.includes('ägyptisch')) return 'Antiquities';
  if (titleLower.includes('kameo') || titleLower.includes('cameo') || titleLower.includes('gemme')) return 'Gem/Cameo';
  if (titleLower.includes('instrument') || titleLower.includes('gambe') || titleLower.includes('violine') || 
      titleLower.includes('cembalo') || titleLower.includes('flöte') || titleLower.includes('klavier') ||
      titleLower.includes('gitarre') || titleLower.includes('orgel')) return 'Musical Instrument';
  if (titleLower.includes('fibel') || titleLower.includes('krug') || titleLower.includes('kelch') || 
      titleLower.includes('schale') || titleLower.includes('kapsel') || titleLower.includes('medaillon')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title, culture) {
  const titleLower = (title || '').toLowerCase();
  
  const typeMap = {
    'kameo': 'Cameo', 'cameo': 'Cameo',
    'gemme': 'Gem', 'gem': 'Gem',
    'statue': 'Statue', 'statuette': 'Statuette',
    'büste': 'Bust', 'bust': 'Bust',
    'fibel': 'Fibula',
    'gambe': 'Viola da Gamba',
    'violine': 'Violin', 'violin': 'Violin',
    'viola': 'Viola',
    'violoncello': 'Cello', 'cello': 'Cello',
    'cembalo': 'Harpsichord', 'harpsichord': 'Harpsichord',
    'flöte': 'Flute', 'flute': 'Flute',
    'trompete': 'Trumpet', 'trumpet': 'Trumpet',
    'posaune': 'Trombone', 'trombone': 'Trombone',
    'klarinette': 'Clarinet', 'clarinet': 'Clarinet',
    'gitarre': 'Guitar', 'guitar': 'Guitar',
    'cister': 'Cittern',
    'lira': 'Lira',
    'spinett': 'Spinet',
    'klavier': 'Piano', 'piano': 'Piano', 'flügel': 'Piano',
    'harfe': 'Harp', 'harp': 'Harp',
    'orgel': 'Organ', 'organ': 'Organ',
    'krug': 'Jug',
    'medaillon': 'Medallion',
    'kapsel': 'Casket',
    'anhänger': 'Pendant',
    'gemälde': 'Painting', 'painting': 'Painting',
    'sieb': 'Sieve',
    'chitarrone': 'Chitarrone',
    'rebecchino': 'Rebecchino',
    'rankett': 'Rankett'
  };
  
  for (const [keyword, type] of Object.entries(typeMap)) {
    if (titleLower.includes(keyword)) {
      return type;
    }
  }
  
  return 'Artwork';
}

function printStatistics(artworks) {
  const total = artworks.length;
  
  // Data completeness
  const withImages = artworks.filter(a => a.imageUrl && a.imageUrl.includes('http')).length;
  const withCulture = artworks.filter(a => a.culture).length;
  const withDate = artworks.filter(a => a.date).length;
  const withMedium = artworks.filter(a => a.medium).length;
  const withDimensions = artworks.filter(a => a.dimensions).length;
  const withDescription = artworks.filter(a => a.description).length;
  const withObjectType = artworks.filter(a => a.objectType && a.objectType !== 'Artwork').length;
  const highlights = artworks.filter(a => a.isHighlight).length;
  
  console.log('📊 Data Quality Report:');
  console.log(`   Total artworks: ${total}`);
  console.log(`   With images: ${withImages} (${Math.round(withImages/total*100)}%)`);
  console.log(`   With culture: ${withCulture} (${Math.round(withCulture/total*100)}%)`);
  console.log(`   With dates: ${withDate} (${Math.round(withDate/total*100)}%)`);
  console.log(`   With medium: ${withMedium} (${Math.round(withMedium/total*100)}%)`);
  console.log(`   With dimensions: ${withDimensions} (${Math.round(withDimensions/total*100)}%)`);
  console.log(`   With description: ${withDescription} (${Math.round(withDescription/total*100)}%)`);
  console.log(`   With object type: ${withObjectType} (${Math.round(withObjectType/total*100)}%)`);
  console.log(`   Highlights: ${highlights}`);
  
  // Classifications
  const classifications = {};
  artworks.forEach(a => {
    classifications[a.classification] = (classifications[a.classification] || 0) + 1;
  });
  
  console.log(`\n🏛️  Classifications:`);
  Object.entries(classifications).sort((a, b) => b[1] - a[1]).forEach(([cls, count]) => {
    const pct = Math.round(count/total*100);
    console.log(`   ${cls}: ${count} (${pct}%)`);
  });
  
  // Object types
  const objectTypes = {};
  artworks.forEach(a => {
    objectTypes[a.objectType] = (objectTypes[a.objectType] || 0) + 1;
  });
  
  console.log(`\n🎨 Object Types (top 10):`);
  Object.entries(objectTypes).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`);
  });
  
  // Sample entries
  console.log(`\n📋 Sample Entries (first 5):`);
  artworks.slice(0, 5).forEach((art, i) => {
    console.log(`\n${i + 1}. ${art.title}`);
    console.log(`   Culture: ${art.culture || 'Unknown'}`);
    console.log(`   Date: ${art.date || 'N/A'}`);
    console.log(`   Type: ${art.objectType}`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log(`   Dimensions: ${art.dimensions || 'N/A'}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
    console.log(`   Description: ${art.description ? art.description.substring(0, 80) + '...' : 'N/A'}`);
  });
}

scrapeKHM100Complete().catch(console.error);
