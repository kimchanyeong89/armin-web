/**
 * Dulwich Picture Gallery - Exhibition Scraper
 * 
 * 규칙 8-12에 따라 전시 정보를 스크래핑합니다:
 * - 전시명, 표지 이미지, 전시 기간 수집
 * - 기간 없거나 영구전시 → permanent, 기간 있으면 → temporary
 * - 전시 설명, 이미지, 비디오 임베드 정보 수집
 * - 전시 페이지 내 작품 정보 수집
 */

const https = require('https');

// ============ Configuration ============
const BASE_URL = 'https://www.dulwichpicturegallery.org.uk';
const EXHIBITIONS_URL = `${BASE_URL}/whats-on/?event_type=exhibition`;
const DELAY_MS = 1000;

// ============ Utilities ============
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseDate(dateStr) {
  // Formats: "4 NOV 2025 — 8 MAR 2026", "24 MAR — 12 JUL 2026", "Tue – Sun"
  if (!dateStr) return null;
  
  const cleanStr = dateStr.replace(/\s+/g, ' ').trim();
  
  // Check for permanent indicators
  if (/tue|wed|thu|fri|sat|sun|mon/i.test(cleanStr) && !/\d{4}/.test(cleanStr)) {
    return { type: 'permanent' };
  }
  
  const months = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };
  
  // Match patterns like "4 NOV 2025 — 8 MAR 2026" or "24 MAR — 12 JUL 2026"
  const rangeMatch = cleanStr.match(/(\d{1,2})\s+([A-Z]{3})\s*(\d{4})?\s*[—–-]\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i);
  if (rangeMatch) {
    const [, startDay, startMonth, startYearRaw, endDay, endMonth, endYear] = rangeMatch;
    const startYear = startYearRaw || endYear; // Use end year if start year not specified
    const startDate = `${startYear}-${months[startMonth.toLowerCase()]}-${startDay.padStart(2, '0')}`;
    const endDate = `${endYear}-${months[endMonth.toLowerCase()]}-${endDay.padStart(2, '0')}`;
    return { type: 'temporary', startDate, endDate };
  }
  
  return null;
}

// ============ Scraping Functions ============

async function scrapeExhibitionList() {
  console.log('📋 Fetching exhibition list...');
  const html = await fetchPage(EXHIBITIONS_URL);
  
  const exhibitions = [];
  
  // Extract exhibition cards
  const cardRegex = /<div class="c-event-card">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let match;
  
  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[1];
    
    // Extract link
    const linkMatch = cardHtml.match(/href="(\/whats-on\/[^"]+)"/);
    if (!linkMatch) continue;
    
    // Extract image
    const imageMatch = cardHtml.match(/src="(https:\/\/assets[^"]+\.(jpg|png|webp))"/i);
    
    // Extract title
    const titleMatch = cardHtml.match(/c-event-card__title">\s*([^<]+)/);
    
    // Extract datetime
    const dateMatch = cardHtml.match(/c-event-card__datetime">\s*([^<]+)/);
    
    // Extract excerpt
    const excerptMatch = cardHtml.match(/c-event-card__excerpt">\s*([\s\S]*?)<\/div>/);
    
    if (linkMatch && titleMatch) {
      const title = decodeHtmlEntities(titleMatch[1]);
      const url = BASE_URL + linkMatch[1];
      const slug = linkMatch[1].replace('/whats-on/', '').replace(/\/$/, '');
      
      exhibitions.push({
        title,
        slug,
        url,
        coverImage: imageMatch ? imageMatch[1] : null,
        dateStr: dateMatch ? decodeHtmlEntities(dateMatch[1]) : null,
        excerpt: excerptMatch ? decodeHtmlEntities(excerptMatch[1].replace(/<[^>]+>/g, '')) : null
      });
    }
  }
  
  console.log(`   Found ${exhibitions.length} exhibitions`);
  return exhibitions;
}

async function scrapeExhibitionDetail(exhibition) {
  console.log(`\n🖼️  Scraping: ${exhibition.title}`);
  const html = await fetchPage(exhibition.url);
  
  // Extract hero/cover image (first large image)
  const heroImageMatch = html.match(/src="(https:\/\/assets[^"]+\.(?:fill-2000|width-1600|fill-1600)[^"]+\.(jpg|png|webp))"/i);
  if (heroImageMatch) {
    exhibition.coverImage = heroImageMatch[1];
  }
  
  // Extract all gallery images (excluding logos, small icons)
  const galleryImages = [];
  const imageRegex = /src="(https:\/\/assets[^"]+\.(jpg|png|webp))"/gi;
  let imgMatch;
  while ((imgMatch = imageRegex.exec(html)) !== null) {
    const imgUrl = imgMatch[1];
    // Skip small images, logos, icons
    if (!/width-400|logo|icon|empty_logo/i.test(imgUrl) && !galleryImages.includes(imgUrl)) {
      galleryImages.push(imgUrl);
    }
  }
  exhibition.galleryImages = galleryImages;
  
  // Extract YouTube videos
  const videos = [];
  const videoRegex = /src="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"/gi;
  let videoMatch;
  while ((videoMatch = videoRegex.exec(html)) !== null) {
    videos.push(videoMatch[1]);
  }
  exhibition.videos = videos;
  
  // Extract description sections
  const descriptionParts = [];
  
  // Get main intro text
  const introMatch = html.match(/<p[^>]*>\s*(Discover|Known for|As well as|Though a household)[^<]+/i);
  if (introMatch) {
    descriptionParts.push(decodeHtmlEntities(introMatch[0].replace(/<[^>]+>/g, '')));
  }
  
  // Get sections with headers
  const sectionRegex = /<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  let sectionMatch;
  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionTitle = decodeHtmlEntities(sectionMatch[1]);
    const sectionContent = decodeHtmlEntities(sectionMatch[2].replace(/<[^>]+>/g, ''));
    if (sectionContent.length > 50 && !/footer|address|newsletter/i.test(sectionTitle)) {
      descriptionParts.push(`**${sectionTitle}**\n${sectionContent}`);
    }
  }
  
  exhibition.fullDescription = descriptionParts.join('\n\n');
  
  // Parse dates
  const dateInfo = parseDate(exhibition.dateStr);
  exhibition.dateInfo = dateInfo;
  
  console.log(`   📅 Date: ${exhibition.dateStr || 'N/A'} → ${dateInfo?.type || 'unknown'}`);
  console.log(`   🖼️  Images: ${galleryImages.length}`);
  console.log(`   📹 Videos: ${videos.length}`);
  
  return exhibition;
}

// ============ Main ============
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🏛️  Dulwich Picture Gallery - Exhibition Scraper');
  console.log('═══════════════════════════════════════════════════\n');
  
  try {
    // 1. Get exhibition list
    const exhibitions = await scrapeExhibitionList();
    
    // 2. Scrape each exhibition detail
    const detailedExhibitions = [];
    for (const exhibition of exhibitions) {
      await delay(DELAY_MS);
      const detailed = await scrapeExhibitionDetail(exhibition);
      detailedExhibitions.push(detailed);
    }
    
    // 3. Categorize exhibitions
    const permanent = [];
    const temporary = [];
    const upcoming = [];
    
    const now = new Date();
    
    for (const ex of detailedExhibitions) {
      const id = `dpg-${slugify(ex.slug)}`;
      
      const exhibitionData = {
        id,
        name: ex.title,
        title: ex.title,
        description: ex.excerpt || ex.fullDescription?.substring(0, 300) || '',
        fullDescription: ex.fullDescription || '',
        image: ex.coverImage,
        galleryImages: ex.galleryImages || [],
        videos: ex.videos || [],
        url: ex.url
      };
      
      if (!ex.dateInfo || ex.dateInfo.type === 'permanent') {
        exhibitionData.startDate = 'Permanent';
        exhibitionData.endDate = 'Permanent';
        permanent.push(exhibitionData);
      } else {
        exhibitionData.startDate = ex.dateInfo.startDate;
        exhibitionData.endDate = ex.dateInfo.endDate;
        
        const startDate = new Date(ex.dateInfo.startDate);
        const endDate = new Date(ex.dateInfo.endDate);
        
        if (startDate > now) {
          upcoming.push(exhibitionData);
        } else if (endDate >= now) {
          temporary.push(exhibitionData);
        } else {
          // Past exhibition - skip for now
        }
      }
    }
    
    // 4. Output results
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 Results Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log(`\n🏛️  Permanent Exhibitions: ${permanent.length}`);
    permanent.forEach(p => console.log(`   - ${p.name}`));
    
    console.log(`\n🎨 Current Exhibitions: ${temporary.length}`);
    temporary.forEach(t => console.log(`   - ${t.name} (${t.startDate} ~ ${t.endDate})`));
    
    console.log(`\n📅 Upcoming Exhibitions: ${upcoming.length}`);
    upcoming.forEach(u => console.log(`   - ${u.name} (${u.startDate} ~ ${u.endDate})`));
    
    // 5. Generate exhibitions.js update snippet
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📝 exhibitions.js Update Snippet');
    console.log('═══════════════════════════════════════════════════\n');
    
    const formatExhibition = (ex) => {
      return `      {
        id: "${ex.id}",
        name: "${ex.name.replace(/"/g, '\\"')}",
        title: "${ex.title.replace(/"/g, '\\"')}",
        description: "${ex.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}",
        startDate: "${ex.startDate}",
        endDate: "${ex.endDate}",
        image: "${ex.image || ''}"
      }`;
    };
    
    console.log('permanentExhibitions: [');
    console.log(permanent.map(formatExhibition).join(',\n'));
    console.log('],');
    
    console.log('\ntemporaryExhibitions: [');
    console.log(temporary.map(formatExhibition).join(',\n'));
    console.log('],');
    
    console.log('\nupcomingExhibitions: [');
    console.log(upcoming.map(formatExhibition).join(',\n'));
    console.log('],');
    
    // 6. Save full data to JSON
    const fs = require('fs');
    const path = require('path');
    
    const outputData = {
      museum: "Dulwich Picture Gallery",
      museumId: "dulwich-picture-gallery",
      scrapedAt: new Date().toISOString(),
      permanentExhibitions: permanent,
      temporaryExhibitions: temporary,
      upcomingExhibitions: upcoming
    };
    
    const outputPath = path.join(__dirname, '../public/data/dulwich-exhibitions.json');
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n💾 Saved full data to: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
