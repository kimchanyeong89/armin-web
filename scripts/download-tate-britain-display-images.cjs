const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Tate image URLs to download
const DISPLAY_IMAGES = {
  'tate-britain-display-jmw-turner': {
    name: 'JMW Turner',
    image: 'https://media.tate.org.uk/art/images/work/N/N01/N01981_10.jpg', // Norham Castle, Sunrise
    filename: 'tate-britain-jmw-turner.jpg'
  },
  'tate-britain-display-historic-early-modern': {
    name: 'Historic and Early Modern British Art',
    image: 'https://media.tate.org.uk/art/images/work/T/T00/T00069_10.jpg', // Cholmondeley Ladies
    filename: 'tate-britain-historic-early-modern.jpg'
  },
  'tate-britain-display-modern-contemporary': {
    name: 'Modern and Contemporary British Art',
    image: 'https://media.tate.org.uk/art/images/work/T/T07/T07496_10.jpg', // Pauline Boty
    filename: 'tate-britain-modern-contemporary.jpg'
  },
  'tate-britain-display-art-around-building': {
    name: 'Art Around the Building',
    image: 'https://media.tate.org.uk/aztate-prd-ew-dg-wgtail-st1-ctr-data/images/France_Lise_Mcgurn_Djanogly_Cafe_23.width-600.jpg',
    filename: 'tate-britain-art-around-building.jpg'
  }
};

const R2_BASE = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';
const LOCAL_DIR = path.join(__dirname, '..', 'public', 'images', 'tate-britain-displays');

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, response => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', err => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function main() {
  // Create directory
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
  }

  console.log('Downloading display images...\n');

  for (const [id, data] of Object.entries(DISPLAY_IMAGES)) {
    const filepath = path.join(LOCAL_DIR, data.filename);
    console.log(`Downloading: ${data.name}`);
    console.log(`  From: ${data.image}`);
    
    try {
      await downloadImage(data.image, filepath);
      const stats = fs.statSync(filepath);
      console.log(`  Saved: ${filepath} (${Math.round(stats.size/1024)}KB)\n`);
    } catch (error) {
      console.error(`  Error: ${error.message}\n`);
    }
  }

  console.log('\n=== Images downloaded to local folder ===');
  console.log('To upload to R2, run:');
  console.log('  wrangler r2 object put armin-gallery/tate-britain-displays/ --file=public/images/tate-britain-displays/*.jpg');
  
  // Update tate-britain.json with local image paths
  const britainPath = path.join(__dirname, '..', 'public', 'data', 'tate-britain.json');
  const britainJson = JSON.parse(fs.readFileSync(britainPath, 'utf8'));
  
  for (const item of britainJson.items) {
    if (DISPLAY_IMAGES[item.id]) {
      // Use local path for now (can be changed to R2 URL later)
      item.image = `/images/tate-britain-displays/${DISPLAY_IMAGES[item.id].filename}`;
    }
  }
  
  fs.writeFileSync(britainPath, JSON.stringify(britainJson, null, 2));
  console.log('\nUpdated tate-britain.json with local image paths');
}

main().catch(console.error);
