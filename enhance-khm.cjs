const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function enhanceKHMData() {
  console.log('🎨 KHM Museum - Enhancing metadata from detail pages\n');
  
  // Load existing data
  const inputPath = '/Users/kietzsche/armin-web-main/downloads/khm-test-100.json';
  let artworks = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  console.log(`📊 Loaded ${artworks.length} artworks`);
  console.log(`🔍 Fetching detailed metadata from individual pages...\n`);
  
  const enhanced = [];
  
  for (const [index, artwork] of artworks.entries()) {
    console.log(`[${index + 1}/${artworks.length}] ${artwork.title.substring(0, 50)}...`);
    
    try {
      const response = await axios.get(artwork.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Extract detailed metadata
      const metadata = {};
      
      // Look for metadata in various possible locations
      $('.object-detail-data dd, .metadata dd, .detail-info dd').each((i, el) => {
        const value = $(el).text().trim();
        const key = $(el).prev('dt').text().trim().toLowerCase();
        
        if (key && value) {
          metadata[key] = value;
        }
      });
      
      // Try to get description
      let description = '';
      const descEl = $('.object-description, .description, .detail-description, [class*="description"]').first();
      if (descEl.length) {
        description = descEl.text().trim();
      }
      
      // Get dimensions, medium, etc from metadata
      const medium = metadata.material || metadata.medium || metadata.technik || artwork.medium;
      const dimensions = metadata.dimensions || metadata.maße || metadata.größe || artwork.dimensions;
      const objectType = metadata['object type'] || metadata.objekttyp || metadata.category || '';
      const location = metadata.location || metadata.standort || '';
      const creditLine = metadata['credit line'] || metadata.provenienz || '';
      
      // Enhanced artwork object
      const enhancedArtwork = {
        ...artwork,
        medium: medium || '',
        dimensions: dimensions || '',
        description: description.substring(0, 500) || '', // Limit description length
        objectType: objectType || artwork.objectType || determineObjectType(artwork.title, artwork.culture),
        classification: determineClassification(artwork.title, artwork.culture, objectType),
        location: location || '',
        creditLine: creditLine || '',
        isHighlight: false, // Would need to check if this is a highlight - could look for badges/tags
      };
      
      enhanced.push(enhancedArtwork);
      
      // Show if we found new metadata
      if (medium || dimensions || description) {
        console.log(`   ✓ Enhanced: ${medium ? 'medium' : ''}${dimensions ? ', dimensions' : ''}${description ? ', description' : ''}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`   ⚠️  Error fetching detail: ${error.message}`);
      // Keep original artwork if detail fetch fails
      enhanced.push(artwork);
    }
  }
  
  console.log(`\n✅ Enhanced ${enhanced.length} artworks with detailed metadata`);
  
  // Save enhanced data
  fs.writeFileSync(inputPath, JSON.stringify(enhanced, null, 2));
  console.log(`✅ Saved to: ${inputPath}`);
  
  // Statistics
  const withMedium = enhanced.filter(a => a.medium).length;
  const withDimensions = enhanced.filter(a => a.dimensions).length;
  const withDescription = enhanced.filter(a => a.description).length;
  
  console.log(`\n📊 Enhancement Results:`);
  console.log(`   With medium: ${withMedium}/${enhanced.length}`);
  console.log(`   With dimensions: ${withDimensions}/${enhanced.length}`);
  console.log(`   With description: ${withDescription}/${enhanced.length}`);
  
  return enhanced;
}

function determineClassification(title, culture, objectType) {
  const titleLower = (title || '').toLowerCase();
  const cultureLower = (culture || '').toLowerCase();
  const typeLower = (objectType || '').toLowerCase();
  
  if (titleLower.includes('gemälde') || titleLower.includes('painting') || typeLower.includes('painting')) return 'Painting';
  if (titleLower.includes('skulptur') || titleLower.includes('statue') || titleLower.includes('büste') || typeLower.includes('sculpture')) return 'Sculpture';
  if (cultureLower.includes('römisch') || cultureLower.includes('griechisch') || cultureLower.includes('hellenistisch')) return 'Antiquities';
  if (titleLower.includes('kameo') || titleLower.includes('cameo') || titleLower.includes('gemme')) return 'Gem/Cameo';
  if (titleLower.includes('instrument') || titleLower.includes('gambe') || titleLower.includes('violine') || titleLower.includes('cembalo') || titleLower.includes('flöte') || titleLower.includes('klavier')) return 'Musical Instrument';
  if (titleLower.includes('fibel') || titleLower.includes('krug') || titleLower.includes('kelch') || titleLower.includes('schale') || titleLower.includes('kapsel')) return 'Decorative Arts';
  
  return 'Artwork';
}

function determineObjectType(title, culture) {
  const titleLower = (title || '').toLowerCase();
  
  if (titleLower.includes('kameo') || titleLower.includes('cameo')) return 'Cameo';
  if (titleLower.includes('gemme')) return 'Gem';
  if (titleLower.includes('statue') || titleLower.includes('statuette')) return 'Statue';
  if (titleLower.includes('büste')) return 'Bust';
  if (titleLower.includes('fibel')) return 'Fibula';
  if (titleLower.includes('gambe')) return 'Viola da Gamba';
  if (titleLower.includes('violine')) return 'Violin';
  if (titleLower.includes('viola')) return 'Viola';
  if (titleLower.includes('violoncello')) return 'Cello';
  if (titleLower.includes('cembalo')) return 'Harpsichord';
  if (titleLower.includes('flöte')) return 'Flute';
  if (titleLower.includes('trompete')) return 'Trumpet';
  if (titleLower.includes('posaune')) return 'Trombone';
  if (titleLower.includes('klarinette')) return 'Clarinet';
  if (titleLower.includes('gitarre')) return 'Guitar';
  if (titleLower.includes('cister')) return 'Cittern';
  if (titleLower.includes('lira')) return 'Lira';
  if (titleLower.includes('spinett')) return 'Spinet';
  if (titleLower.includes('klavier') || titleLower.includes('flügel')) return 'Piano';
  if (titleLower.includes('harfe')) return 'Harp';
  if (titleLower.includes('orgel')) return 'Organ';
  if (titleLower.includes('krug')) return 'Jug';
  if (titleLower.includes('medaillon')) return 'Medallion';
  if (titleLower.includes('kapsel')) return 'Casket';
  if (titleLower.includes('anhänger')) return 'Pendant';
  if (titleLower.includes('gemälde')) return 'Painting';
  if (titleLower.includes('sieb')) return 'Sieve';
  if (titleLower.includes('chitarrone')) return 'Chitarrone';
  
  return 'Artwork';
}

enhanceKHMData().catch(console.error);
