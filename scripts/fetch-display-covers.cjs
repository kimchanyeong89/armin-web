/**
 * Fetch main cover images for Tate Britain display exhibitions
 * These are the hero images shown at the top of each display page
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Display exhibition URLs and their IDs
const DISPLAYS = [
  {
    id: 'tate-britain-display-jmw-turner',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/jmw-turner',
    name: 'JMW Turner'
  },
  {
    id: 'tate-britain-display-historic-early-modern',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/historic-early-modern-british-art',
    name: 'Historic and Early Modern British Art'
  },
  {
    id: 'tate-britain-display-modern-contemporary',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/modern-and-contemporary-british-art',
    name: 'Modern and Contemporary British Art'
  },
  {
    id: 'tate-britain-display-art-around-building',
    url: 'https://www.tate.org.uk/visit/tate-britain/display/art-around-the-building',
    name: 'Art Around the Building'
  }
];

// Fetch HTML from URL
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHTML(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

// Extract hero image from page HTML
function extractHeroImage(html, displayName) {
  // Look for the main hero image - it's typically in a figure or div after the h1
  // Pattern 1: media.tate.org.uk image
  const mediaPatterns = [
    // aztate-prd pattern (high quality)
    /https:\/\/media\.tate\.org\.uk\/aztate-prd[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi,
    // General media.tate.org.uk
    /https:\/\/media\.tate\.org\.uk\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi,
    // Tate images domain
    /https:\/\/www\.tate\.org\.uk\/sites\/default\/files\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi
  ];

  // Find all matches
  const allImages = [];
  for (const pattern of mediaPatterns) {
    const matches = html.match(pattern);
    if (matches) {
      allImages.push(...matches);
    }
  }

  // Filter and prioritize
  // Look for images with 'width-' in the URL (resized versions) - prefer larger ones
  const sortedImages = [...new Set(allImages)].sort((a, b) => {
    // Prefer larger width images
    const widthA = a.match(/width-(\d+)/)?.[1] || 0;
    const widthB = b.match(/width-(\d+)/)?.[1] || 0;
    return parseInt(widthB) - parseInt(widthA);
  });

  // The hero image is usually the first large image
  if (sortedImages.length > 0) {
    // Get the largest version available
    const heroImage = sortedImages[0];
    console.log(`Found hero image for ${displayName}: ${heroImage.substring(0, 80)}...`);
    return heroImage;
  }

  return null;
}

// Download image and convert to WebP
async function downloadImage(url, filename) {
  const tempDir = path.join(__dirname, '../temp-display-covers');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const ext = path.extname(new URL(url).pathname).split('?')[0] || '.jpg';
  const tempPath = path.join(tempDir, filename + ext);
  
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, filename).then(resolve).catch(reject);
      }
      const fileStream = fs.createWriteStream(tempPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(tempPath);
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const dataPath = path.join(__dirname, '../public/data/tate-britain.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log('Fetching display exhibition cover images...\n');

  const results = [];
  
  for (const display of DISPLAYS) {
    console.log(`\n=== ${display.name} ===`);
    
    try {
      const html = await fetchHTML(display.url);
      
      // Save HTML for debugging
      // fs.writeFileSync(`/tmp/${display.id}.html`, html);
      
      const heroImage = extractHeroImage(html, display.name);
      
      if (heroImage) {
        results.push({
          id: display.id,
          name: display.name,
          coverImage: heroImage
        });
      } else {
        console.log(`No hero image found for ${display.name}`);
      }
    } catch (err) {
      console.error(`Error fetching ${display.name}:`, err.message);
    }
  }

  console.log('\n\n=== Results ===');
  console.log(JSON.stringify(results, null, 2));

  // Update tate-britain.json with cover images
  for (const result of results) {
    const exhibition = data.items.find(i => i.id === result.id);
    if (exhibition) {
      exhibition.coverImage = result.coverImage;
      exhibition.dateRange = 'Ongoing';
      console.log(`Updated ${result.name} coverImage and dateRange`);
    }
  }

  // Save updated data
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log('\nSaved to tate-britain.json');
}

main().catch(console.error);
