/**
 * Musée d'Orsay Detail Page Enricher
 * 
 * 2단계: 기존 JSON에서 detailUrl을 읽고 상세 페이지 방문하여 추가 정보 수집
 * - dimensions: 작품 크기 (예: "46 x 38 cm")
 * - medium: 재료/기법 (예: "Gouache on canvas")
 * - accessionNumber: 소장품 번호
 * - credit: 기증/출처 정보
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../downloads/orsay/orsay-collection.json');
const OUTPUT_FILE = path.join(__dirname, '../downloads/orsay/orsay-collection-enriched.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/orsay/orsay-enrich-progress.json');

// Rate limiting
const DELAY_BETWEEN_PAGES = 1000; // ms
const BATCH_SIZE = 50; // Save progress every N items

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { lastIndex: -1 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Convert "H. 46 ; L. 38 cm" to "46 x 38 cm"
function formatDimensions(raw) {
  if (!raw) return '';
  
  // Pattern: H. 46 ; L. 38 cm or H. 46, L. 38 cm
  const match = raw.match(/H\.?\s*([\d,.]+)\s*[;,]?\s*L\.?\s*([\d,.]+)\s*cm/i);
  if (match) {
    const height = match[1].replace(',', '.');
    const width = match[2].replace(',', '.');
    return `${height} x ${width} cm`;
  }
  
  // Return cleaned up original if no pattern match
  return raw.replace(/\s+/g, ' ').trim();
}

async function enrichArtworks() {
  console.log('🎨 Musée d\'Orsay Detail Page Enricher\n');
  
  // Load input data
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.log('Run scrape-orsay-collection.cjs first.');
    return;
  }
  
  const artworks = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`📦 Loaded ${artworks.length} artworks from input file`);
  
  // Load progress
  const progress = loadProgress();
  const startIndex = progress.lastIndex + 1;
  console.log(`📊 Starting from index ${startIndex}\n`);
  
  if (startIndex >= artworks.length) {
    console.log('✅ All artworks already enriched!');
    return;
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    for (let i = startIndex; i < Math.min(5, artworks.length); i++) {
      const artwork = artworks[i];
      
      if (!artwork.detailUrl) {
        console.log(`⏭️ [${i + 1}/${artworks.length}] No detailUrl, skipping`);
        continue;
      }
      
      console.log(`🔍 [${i + 1}/${artworks.length}] ${artwork.title?.substring(0, 40)}...`);
      
      try {
        await page.goto(artwork.detailUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        await delay(500);
        
        // Extract detailed information
        const details = await page.evaluate(() => {
          const bodyText = document.body.innerText;
          
          // Dimensions: H. XX ; L. XX cm
          const dimMatch = bodyText.match(/H\.?\s*[\d,.]+\s*[;,]?\s*L\.?\s*[\d,.]+\s*cm/i);
          
          // Medium/technique
          const descMatch = bodyText.match(/Description\s*\n([^\n]+)/i);
          
          // Accession number
          const accMatch = bodyText.match(/(?:Accession number|Numéro d'inventaire)\s*\n?([A-Z]{1,3}\s*\d+[\s\d]*)/i);
          
          // Credit line
          const creditPatterns = [
            /(?:Legs|Bequest|Gift|Don|Donation|Acquired|Purchase|Achat)[^\n]+/i,
          ];
          let credit = '';
          for (const pattern of creditPatterns) {
            const match = bodyText.match(pattern);
            if (match) {
              credit = match[0].trim();
              break;
            }
          }
          
          return {
            dimensionsRaw: dimMatch ? dimMatch[0] : '',
            medium: descMatch ? descMatch[1].trim() : '',
            accessionNumber: accMatch ? accMatch[1].trim() : '',
            credit: credit
          };
        });
        
        // Update artwork with enriched data
        if (details.dimensionsRaw) {
          artwork.dimensions = formatDimensions(details.dimensionsRaw);
        }
        if (details.medium) {
          artwork.medium = details.medium;
        }
        if (details.accessionNumber) {
          artwork.accessionNumber = details.accessionNumber;
        }
        if (details.credit) {
          artwork.credit = details.credit;
        }
        
        console.log(`   ✓ dims: ${artwork.dimensions || '-'}, medium: ${(artwork.medium || '-').substring(0, 30)}`);
        
      } catch (error) {
        console.log(`   ⚠️ Error: ${error.message}`);
      }
      
      // Save progress periodically
      if ((i + 1) % BATCH_SIZE === 0 || i === artworks.length - 1) {
        progress.lastIndex = i;
        saveProgress(progress);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
        console.log(`💾 Progress saved (${i + 1}/${artworks.length})`);
      }
      
      await delay(DELAY_BETWEEN_PAGES);
    }
    
    // Final save
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
    console.log(`\n✅ Enrichment complete!`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
    // Show sample
    const enrichedCount = artworks.filter(a => a.dimensions).length;
    console.log(`📊 ${enrichedCount}/${artworks.length} artworks have dimensions`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    saveProgress(progress);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(artworks, null, 2));
  } finally {
    await browser.close();
  }
}

enrichArtworks().catch(console.error);
