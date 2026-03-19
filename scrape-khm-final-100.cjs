const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeKHMFinal() {
  console.log('🎨 KHM Museum - Final comprehensive scraping\n');
  console.log('Strategy: Multiple search queries + detail page metadata\n');
  
  const results = [];
  const baseUrl = 'https://www.khm.at';
  
  // Different search strategies with various parameters
  const searchStrategies = [
    // Different date ranges
    { page: 1, params: 'facet_date_begin=-500&facet_date_end=500', name: 'Ancient (500 BC - 500 AD)' },
    { page: 1, params: 'facet_date_begin=500&facet_date_end=1000', name: 'Medieval (500-1000)' },
    { page: 1, params: 'facet_date_begin=1000&facet_date_end=1400', name: 'Late Medieval (1000-1400)' },
    { page: 1, params: 'facet_date_begin=1400&facet_date_end=1500', name: 'Early Renaissance (1400-1500)' },
    { page: 1, params: 'facet_date_begin=1500&facet_date_end=1600', name: '16th Century' },
    { page: 1, params: 'facet_date_begin=1600&facet_date_end=1700', name: '17th Century' },
    { page: 1, params: 'facet_date_begin=1700&facet_date_end=1800', name: '18th Century' },
    { page: 1, params: 'facet_date_begin=1800&facet_date_end=1900', name: '19th Century' },
    { page: 1, params: 'facet_date_begin=1900&facet_date_end=2023', name: '20th-21st Century' },
    // Different classifications
    { page: 1, params: 'facet_classification=48', name: 'Paintings' },
    { page: 1, params: 'facet_classification=49', name: 'Decorative Arts' },
    { page: 1, params: 'facet_classification=50', name: 'Antiquities' },
    { page: 1, params: 'facet_classification=51', name: 'Musical Instruments' },
    { page: 1, params: 'facet_classification=52', name: 'Sculptures' },
    // With images tag
    { page: 1, params: 'facet_tags=9479', name: 'With Images' },
    // Try page 2 for some searches
    { page: 2, params: 'facet_date_begin=1500&facet_date_end=1700', name: '16-17th Century (Page 2)' },
    { page: 2, params: 'facet_classification=50', name: 'Antiquities (Page 2)' },
  ];
  
  console.log(`📊 Will try ${searchStrategies.length} different search strategies\n`);
  
  for (const [index, strategy] of searchStrategies.entries()) {
    if (results.length >= 100) {
      console.log(`\n🎯 Reached 100 items! Stopping search.`);
      break;
    }
    
    console.log(`\n[${index + 1}/${searchStrategies.length}] ${strategy.name}`);
    
    try {
      const url = `${baseUrl}/en/artworks/search?tx_theme_objectlist[controller]=Object&page=${strategy.page}&${strategy.params}`;
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });
      
      const $ = cheerio.load(response.data);
      const items = $('.grid-item .object-gallery-item');
      
      console.log(`   Found ${items.length} items on page`);
      
      if (items.length === 0) {
        console.log(`   ⚠️  Skipping...`);
        continue;
      }
      
      let newCount = 0;
      
      items.each((i, el) => {
        if (results.length >= 100) return false;
        
        const item = $(el);
        const link = item.find('a.detail').first();
        const href = link.attr('href');
        
        if (!href) return;
        
        const objectId = link.attr('data-id');
        
        // Check if we already have this item
        if (objectId && results.some(r => r.id === objectId)) {
          return; // Skip duplicate
        }
        
        const fullUrl = href.startsWith('http') ? href : baseUrl + href;
        
        // Get image
        const img = item.find('img').first();
        const imageSrc = img.attr('src');
        const imageAlt = img.attr('alt');
        
        // Get caption
        const caption = item.find('.object-caption p');
        const spans = caption.find('span');
        
        const title = spans.eq(0).text().trim() || imageAlt || 'Untitled';
        const culture = spans.eq(1).find('small').text().trim();
        const date = spans.eq(2).find('small').text().trim();
        
        const artwork = {
          id: objectId || `khm_${results.length + 1}`,
          url: fullUrl,
          title: title,
          artist: culture || '',
          culture: culture || '',
          date: date || '',
          medium: '',
          dimensions: '',
          inventory: objectId || '',
          image: imageSrc,
          imageUrl: imageSrc && imageSrc.startsWith('/') ? baseUrl + imageSrc : imageSrc,
          classification: determineClassification(title, culture),
          objectType: determineObjectType(title, culture),
          category: culture || '',
          isHighlight: false,
          description: '',
          source: 'Kunsthistorisches Museum Vienna',
          sourceUrl: baseUrl,
          searchStrategy: strategy.name
        };
        
        results.push(artwork);
        newCount++;
      });
      
      if (newCount > 0) {
        console.log(`   ✅ Added ${newCount} new items (Total: ${results.length}/100)`);
        const lastItem = results[results.length - 1];
        console.log(`   📌 Latest: ${lastItem.title.substring(0, 50)}...`);
      } else {
        console.log(`   ⚠️  All items were duplicates`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 800));
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n\n✅ Scraping complete!`);
  console.log(`📊 Total unique artworks collected: ${results.length}`);
  
  // Limit to exactly 100
  const limited = results.slice(0, 100);
  
  // Save results
  const outputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  fs.writeFileSync(outputPath, JSON.stringify(limited, null, 2));
  
  console.log(`✅ Saved ${limited.length} artworks to: khm-test-100.json`);
  
  // Detailed statistics
  const withImages = limited.filter(r => r.imageUrl && r.imageUrl.includes('http')).length;
  const withCulture = limited.filter(r => r.culture).length;
  const withDate = limited.filter(r => r.date).length;
  const withArtist = limited.filter(r => r.artist).length;
  
  console.log(`\n📊 Data Quality Report:`);
  console.log(`   Total artworks: ${limited.length}`);
  console.log(`   With images: ${withImages} (${Math.round(withImages/limited.length*100)}%)`);
  console.log(`   With culture info: ${withCulture} (${Math.round(withCulture/limited.length*100)}%)`);
  console.log(`   With dates: ${withDate} (${Math.round(withDate/limited.length*100)}%)`);
  console.log(`   With artist/culture: ${withArtist} (${Math.round(withArtist/limited.length*100)}%)`);
  
  // Classification breakdown
  const classifications = {};
  limited.forEach(item => {
    const cls = item.classification;
    classifications[cls] = (classifications[cls] || 0) + 1;
  });
  
  console.log(`\n🏛️  Classification Breakdown:`);
  Object.entries(classifications)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cls, count]) => {
      const pct = Math.round(count/limited.length*100);
      console.log(`   ${cls}: ${count} (${pct}%)`);
    });
  
  // Object type breakdown
  const objectTypes = {};
  limited.forEach(item => {
    const type = item.objectType;
    objectTypes[type] = (objectTypes[type] || 0) + 1;
  });
  
  console.log(`\n🎨 Object Type Breakdown (top 10):`);
  Object.entries(objectTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
  
  // Date range analysis
  const datesWithYear = limited.filter(r => r.date && r.date.match(/\d{4}/));
  console.log(`\n📅 Date Coverage:`);
  console.log(`   Items with dates: ${withDate}/${limited.length}`);
  console.log(`   Items with year information: ${datesWithYear.length}/${limited.length}`);
  
  // Sample entries from different categories
  console.log(`\n📋 Sample Entries (diverse selection):`);
  
  // Get one from each classification
  const sampleByClass = {};
  limited.forEach(item => {
    if (!sampleByClass[item.classification] && Object.keys(sampleByClass).length < 5) {
      sampleByClass[item.classification] = item;
    }
  });
  
  Object.values(sampleByClass).forEach((art, i) => {
    console.log(`\n${i + 1}. ${art.title}`);
    console.log(`   Classification: ${art.classification}`);
    console.log(`   Object Type: ${art.objectType}`);
    console.log(`   Culture: ${art.culture || 'Unknown'}`);
    console.log(`   Date: ${art.date || 'N/A'}`);
    console.log(`   Image: ${art.imageUrl ? '✓' : '✗'}`);
    console.log(`   ID: ${art.id}`);
  });
  
  console.log(`\n✅ Scraping complete! All metadata saved successfully.`);
  console.log(`📁 File: /Users/kietzsche/armin-web-main/downloads/khm-test-100.json`);
  
  return limited;
}

function determineClassification(title, culture) {
  const titleLower = (title || '').toLowerCase();
  const cultureLower = (culture || '').toLowerCase();
  
  if (titleLower.includes('gemälde') || titleLower.includes('painting')) return 'Painting';
  if (titleLower.includes('skulptur') || titleLower.includes('statue') || titleLower.includes('büste')) return 'Sculpture';
  if (cultureLower.includes('römisch') || cultureLower.includes('griechisch') || cultureLower.includes('hellenistisch') || cultureLower.includes('antike')) return 'Antiquities';
  if (titleLower.includes('kameo') || titleLower.includes('cameo') || titleLower.includes('gemme')) return 'Gem/Cameo';
  if (titleLower.includes('instrument') || titleLower.includes('gambe') || titleLower.includes('violine') || titleLower.includes('cembalo') || titleLower.includes('flöte')) return 'Musical Instrument';
  if (titleLower.includes('fibel') || titleLower.includes('krug') || titleLower.includes('kelch') || titleLower.includes('schale')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title, culture) {
  const titleLower = (title || '').toLowerCase();
  
  if (titleLower.includes('kameo') || titleLower.includes('cameo')) return 'Cameo';
  if (titleLower.includes('gemme')) return 'Gem';
  if (titleLower.includes('statue') || titleLower.includes('statuette')) return 'Statue';
  if (titleLower.includes('büste') || titleLower.includes('bust')) return 'Bust';
  if (titleLower.includes('fibel')) return 'Fibula';
  if (titleLower.includes('gambe')) return 'Viola da Gamba';
  if (titleLower.includes('violine') || titleLower.includes('violin')) return 'Violin';
  if (titleLower.includes('cembalo') || titleLower.includes('harpsichord')) return 'Harpsichord';
  if (titleLower.includes('flöte') || titleLower.includes('flute')) return 'Flute';
  if (titleLower.includes('trompete') || titleLower.includes('trumpet')) return 'Trumpet';
  if (titleLower.includes('posaune') || titleLower.includes('trombone')) return 'Trombone';
  if (titleLower.includes('horn')) return 'Horn';
  if (titleLower.includes('cister')) return 'Cittern';
  if (titleLower.includes('lira')) return 'Lira';
  if (titleLower.includes('spinett')) return 'Spinet';
  if (titleLower.includes('klavier')) return 'Piano';
  if (titleLower.includes('krug') || titleLower.includes('jug')) return 'Jug';
  if (titleLower.includes('kelch') || titleLower.includes('chalice')) return 'Chalice';
  if (titleLower.includes('schale') || titleLower.includes('bowl')) return 'Bowl';
  if (titleLower.includes('sieb') || titleLower.includes('sieve')) return 'Sieve';
  if (titleLower.includes('relief')) return 'Relief';
  if (titleLower.includes('porträt') || titleLower.includes('portrait')) return 'Portrait';
  if (titleLower.includes('landschaft') || titleLower.includes('landscape')) return 'Landscape';
  
  return 'Artwork';
}

scrapeKHMFinal().catch(console.error);
