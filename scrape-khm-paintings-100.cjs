const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function scrapeKHMPaintings100() {
  console.log('🎨 KHM Museum - 100 Paintings/Sculptures with Images\n');
  console.log('Collecting artworks with guaranteed images...\n');
  
  const baseUrl = 'https://www.khm.at';
  const allArtworks = [];
  const seenIds = new Set();
  const seenImages = new Set();
  
  // Collection pages to scrape
  const collectionUrls = [
    '/en/collections/picture-gallery/',
    '/en/collections/greek-and-roman-antiquities/',
    '/en/collections/egyptian-and-near-eastern-collection/',
    '/en/collections/kunstkammer-wien/'
  ];
  
  console.log('📥 Step 1: Collecting artwork links from collection pages...\n');
  
  const artworkLinks = [];
  
  for (const collectionPath of collectionUrls) {
    try {
      const url = baseUrl + collectionPath;
      console.log(`   Checking: ${collectionPath}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Find all artwork links
      $('a[href*="/object/"]').each((idx, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/object/')) {
          const fullUrl = href.startsWith('http') ? href : baseUrl + href;
          const match = href.match(/\/object\/(\d+)/);
          if (match) {
            const id = match[1];
            if (!seenIds.has(id)) {
              artworkLinks.push({ id, url: fullUrl });
              seenIds.add(id);
            }
          }
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Found ${artworkLinks.length} potential artwork links\n`);
  
  if (artworkLinks.length === 0) {
    console.log('⚠️  No links found from collection pages. Using direct ID search...\n');
    
    // Generate ID list from known working range
    const knownWorkingIds = [
      50025, 50028, 50029, 50042, 50043, 50062, 50063, 50064, 50075, 50077,
      50088, 50108, 50109, 50118, 50120, 50121, 50123, 50124, 50125, 50126,
      50127, 50129, 50131, 50142, 50146, 50147, 50148, 50149, 50150, 50151,
      50152, 50153, 50154, 50155, 50156, 50157, 50158, 50159, 50160, 50161,
      50162, 50163, 50164, 50165, 50166, 50167, 50168, 50169, 50170, 50171
    ];
    
    // Add more IDs in sequence
    for (let i = 50025; i <= 50300; i++) {
      if (!seenIds.has(i.toString())) {
        artworkLinks.push({ id: i.toString(), url: `${baseUrl}/en/object/${i}/` });
        seenIds.add(i.toString());
      }
    }
    
    // Add IDs from decorative arts range
    for (let i = 87500; i <= 87600; i++) {
      if (!seenIds.has(i.toString())) {
        artworkLinks.push({ id: i.toString(), url: `${baseUrl}/en/object/${i}/` });
        seenIds.add(i.toString());
      }
    }
  }
  
  console.log('📥 Step 2: Scraping artwork details with images...\n');
  
  let processedCount = 0;
  
  for (const link of artworkLinks) {
    if (allArtworks.length >= 100) break;
    
    processedCount++;
    
    try {
      const response = await axios.get(link.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 8000,
        validateStatus: (status) => status === 200
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract title
      let title = '';
      const titleSelectors = ['h1', '.object-title', '[itemprop="name"]', '.page-title'];
      for (const sel of titleSelectors) {
        const text = $(sel).first().text().trim();
        if (text && text.length > 1) {
          title = text;
          break;
        }
      }
      
      if (!title || title.length < 2) {
        continue; // Skip if no valid title
      }
      
      // Extract image - CRITICAL
      let imageUrl = '';
      const imageSelectors = [
        '.object-image img',
        '[itemprop="image"]',
        '.detail-image img',
        '.artwork-image img',
        'img[src*="typo3temp"]',
        'img[src*="fileadmin"]',
        '.main-image img',
        'picture img'
      ];
      
      for (const sel of imageSelectors) {
        const imgEl = $(sel).first();
        const src = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('srcset')?.split(' ')[0];
        if (src && src.length > 10 && !src.includes('placeholder') && !src.includes('default')) {
          imageUrl = src.startsWith('http') ? src : baseUrl + src;
          break;
        }
      }
      
      // SKIP if no image found
      if (!imageUrl || seenImages.has(imageUrl)) {
        continue;
      }
      
      // Extract metadata
      const meta = {};
      $('dt').each((idx, el) => {
        const key = $(el).text().trim().toLowerCase().replace(/[:]/g, '');
        const value = $(el).next('dd').text().trim();
        if (key && value) meta[key] = value;
      });
      
      // Also try different metadata structure
      $('.object-info .row').each((idx, el) => {
        const label = $(el).find('.label, strong, dt').first().text().trim().toLowerCase().replace(/[:]/g, '');
        const value = $(el).find('.value, dd, span').last().text().trim();
        if (label && value && !meta[label]) meta[label] = value;
      });
      
      const culture = meta.kultur || meta.culture || meta.künstler || meta.artist || meta.creator || '';
      const date = meta.datierung || meta.date || meta.created || meta.jahr || '';
      const medium = meta.material || meta.medium || meta.technik || meta.technique || '';
      const dimensions = meta.maße || meta.dimensions || meta.size || meta.größe || '';
      const inventory = meta.inventarnummer || meta['inventory number'] || meta.inventar || link.id;
      
      // Extract description
      let description = '';
      const descSelectors = [
        '.object-description',
        '[itemprop="description"]',
        '.description',
        '.detail-text',
        '.object-text',
        '.artwork-description'
      ];
      
      for (const sel of descSelectors) {
        const text = $(sel).text().trim();
        if (text && text.length > description.length) {
          description = text;
        }
      }
      
      const artwork = {
        id: link.id,
        url: link.url,
        title: title,
        artist: culture || 'Unknown',
        culture: culture || 'Unknown',
        date: date || 'Unknown',
        period: meta.periode || meta.period || '',
        medium: medium,
        dimensions: dimensions,
        inventory: inventory,
        imageUrl: imageUrl,
        classification: determineClassification(title, culture),
        objectType: meta.objekttyp || meta['object type'] || determineObjectType(title),
        category: culture || meta.category || 'Art',
        isHighlight: false,
        description: description.substring(0, 1500),
        provenance: meta.provenienz || meta.provenance || '',
        location: meta.standort || meta.location || '',
        source: 'Kunsthistorisches Museum Vienna',
        sourceUrl: baseUrl,
        index: allArtworks.length + 1
      };
      
      allArtworks.push(artwork);
      seenImages.add(imageUrl);
      
      console.log(`   ✓ [${allArtworks.length}/100] ${title.substring(0, 50)}...`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 400));
      
    } catch (error) {
      // Skip errors silently (404, timeouts, etc.)
    }
    
    // Progress update every 20 items
    if (processedCount % 20 === 0) {
      console.log(`   ... processed ${processedCount} links, collected ${allArtworks.length} artworks`);
    }
  }
  
  console.log(`\n✅ Total collected: ${allArtworks.length} artworks with images\n`);
  
  // Final validation
  console.log('📋 Step 3: Final validation and quality check...\n');
  
  // Remove any duplicates by ID
  const uniqueById = Array.from(
    new Map(allArtworks.map(art => [art.id, art])).values()
  );
  
  // Remove any duplicates by image URL
  const uniqueByImage = [];
  const imageSet = new Set();
  for (const art of uniqueById) {
    if (!imageSet.has(art.imageUrl)) {
      uniqueByImage.push(art);
      imageSet.add(art.imageUrl);
    }
  }
  
  // Re-index
  const finalDataset = uniqueByImage.map((art, idx) => ({
    ...art,
    index: idx + 1
  }));
  
  console.log('════════════════════════════════════════════════════\n');
  console.log(`✅ FINAL DATASET: ${finalDataset.length} artworks\n`);
  console.log('📊 Quality Metrics:\n');
  
  const withImages = finalDataset.filter(a => a.imageUrl && a.imageUrl.length > 10).length;
  const withCulture = finalDataset.filter(a => a.culture && a.culture !== 'Unknown').length;
  const withDates = finalDataset.filter(a => a.date && a.date !== 'Unknown').length;
  const withMedium = finalDataset.filter(a => a.medium && a.medium.length > 0).length;
  const withDimensions = finalDataset.filter(a => a.dimensions && a.dimensions.length > 0).length;
  const withDescription = finalDataset.filter(a => a.description && a.description.length > 10).length;
  
  console.log(`   Images:        ${withImages}/${finalDataset.length} (${Math.round(withImages/finalDataset.length*100)}%)`);
  console.log(`   Culture:       ${withCulture}/${finalDataset.length} (${Math.round(withCulture/finalDataset.length*100)}%)`);
  console.log(`   Dates:         ${withDates}/${finalDataset.length} (${Math.round(withDates/finalDataset.length*100)}%)`);
  console.log(`   Medium:        ${withMedium}/${finalDataset.length} (${Math.round(withMedium/finalDataset.length*100)}%)`);
  console.log(`   Dimensions:    ${withDimensions}/${finalDataset.length} (${Math.round(withDimensions/finalDataset.length*100)}%)`);
  console.log(`   Descriptions:  ${withDescription}/${finalDataset.length} (${Math.round(withDescription/finalDataset.length*100)}%)`);
  
  console.log(`\n✓ Unique IDs: ${new Set(finalDataset.map(a => a.id)).size} (${new Set(finalDataset.map(a => a.id)).size === finalDataset.length ? 'NO DUPLICATES' : 'HAS DUPLICATES'})`);
  console.log(`✓ Unique Images: ${new Set(finalDataset.map(a => a.imageUrl)).size} (${new Set(finalDataset.map(a => a.imageUrl)).size === finalDataset.length ? 'NO DUPLICATES' : 'HAS DUPLICATES'})`);
  
  // Classification breakdown
  const classifications = {};
  finalDataset.forEach(art => {
    classifications[art.classification] = (classifications[art.classification] || 0) + 1;
  });
  
  console.log('\n🏛️  Classifications:');
  Object.entries(classifications)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count} (${Math.round(count/finalDataset.length*100)}%)`);
    });
  
  // Save to file
  const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  fs.writeFileSync(outputPath, JSON.stringify(finalDataset, null, 2), 'utf8');
  
  console.log(`\n📁 Saved to: ${outputPath}`);
  console.log('\n════════════════════════════════════════════════════\n');
  
  // Show sample entries
  console.log('📋 Sample Entries:\n');
  finalDataset.slice(0, 5).forEach((art, idx) => {
    console.log(`${idx + 1}. ${art.title}`);
    console.log(`   Artist/Culture: ${art.culture}`);
    console.log(`   Date: ${art.date}`);
    console.log(`   Classification: ${art.classification}`);
    console.log(`   Image: ✓ ${art.imageUrl.substring(0, 60)}...`);
    console.log(`   Medium: ${art.medium || 'N/A'}`);
    console.log('');
  });
  
  console.log(`✅ SUCCESS! ${finalDataset.length} artworks with 100% image coverage\n`);
}

function determineClassification(title, culture) {
  const t = (title + ' ' + culture).toLowerCase();
  
  if (t.match(/gemälde|painting|portrait|porträt|landschaft|landscape/)) return 'Painting';
  if (t.match(/statue|figur|skulptur|torso|sculpture/)) return 'Sculpture';
  if (t.match(/büste|bust|head|kopf/)) return 'Sculpture';
  if (t.match(/relief|friese|fries|stele/)) return 'Relief';
  if (t.match(/sarkophag|urne|urn|sarcophagus/)) return 'Funerary Art';
  if (t.match(/vase|bowl|cup|dish|tazza|pokal|becher|krug|schale/)) return 'Decorative Arts';
  if (t.match(/uhr|clock|automat/)) return 'Decorative Arts';
  if (t.match(/griechisch|römisch|etruskisch|greek|roman|etruscan/)) return 'Antiquities';
  
  return 'Artwork';
}

function determineObjectType(title) {
  const t = title.toLowerCase();
  
  if (t.includes('gemälde') || t.includes('painting')) return 'Painting';
  if (t.includes('porträt') || t.includes('portrait')) return 'Portrait';
  if (t.includes('relief')) return 'Relief';
  if (t.includes('statue') || t.includes('statuary')) return 'Statue';
  if (t.includes('bust') || t.includes('büste')) return 'Bust';
  if (t.includes('head') || t.includes('kopf')) return 'Head';
  if (t.includes('stele') || t.includes('stela')) return 'Stele';
  if (t.includes('sarkophag') || t.includes('sarcophagus')) return 'Sarcophagus';
  if (t.includes('urne') || t.includes('urn')) return 'Urn';
  if (t.includes('vase')) return 'Vase';
  if (t.includes('bowl') || t.includes('schale')) return 'Bowl';
  if (t.includes('cup') || t.includes('becher')) return 'Cup';
  if (t.includes('pokal')) return 'Goblet';
  if (t.includes('krug') || t.includes('jug')) return 'Jug';
  if (t.includes('uhr') || t.includes('clock')) return 'Clock';
  
  return 'Artwork';
}

scrapeKHMPaintings100().catch(console.error);
