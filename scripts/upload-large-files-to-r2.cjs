/**
 * Upload large static files to R2
 * Files > 25MB cannot be deployed to Cloudflare Pages directly
 */
require('dotenv').config();
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Files to upload to R2 (relative to public folder)
const LARGE_FILES = [
  'atlas/ne_10m_admin_1_states_provinces.geojson',
  'atlas/ne_10m_urban_areas.geojson',
  'geodata/admin1-states-10m.json',
  'geodata/populated-places-10m.json',
  'data/nga-collection.json',
  'data/aic-collection.json',
];

async function existsInR2(key) {
  try {
    await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToR2(localPath, r2Key) {
  const buffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();

  const contentTypes = {
    '.json': 'application/json',
    '.geojson': 'application/geo+json',
  };

  await R2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: r2Key,
    Body: buffer,
    ContentType: contentTypes[ext] || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `${PUBLIC_URL}/${r2Key}`;
}

async function main() {
  console.log('📤 Uploading large files to R2...\n');

  const publicDir = path.join(__dirname, '..', 'public');
  const uploaded = [];

  for (const file of LARGE_FILES) {
    const localPath = path.join(publicDir, file);
    const r2Key = `armin-web/static/${file}`;

    if (!fs.existsSync(localPath)) {
      console.log(`⏭️  Skipped (not found): ${file}`);
      continue;
    }

    const stats = fs.statSync(localPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);

    if (await existsInR2(r2Key)) {
      console.log(`✅ Already exists: ${file} (${sizeMB} MB)`);
      uploaded.push({ file, r2Key, url: `${PUBLIC_URL}/${r2Key}` });
      continue;
    }

    console.log(`📤 Uploading: ${file} (${sizeMB} MB)...`);
    const url = await uploadToR2(localPath, r2Key);
    console.log(`   ✅ Done: ${url}`);
    uploaded.push({ file, r2Key, url });
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('📋 R2 URLs for large files:');
  console.log('═══════════════════════════════════════════');
  uploaded.forEach(({ file, url }) => {
    console.log(`${file}:`);
    console.log(`  ${url}\n`);
  });

  // Save URL mapping
  const mapping = {};
  uploaded.forEach(({ file, url }) => {
    mapping[`/${file}`] = url;
  });

  fs.writeFileSync(
    path.join(__dirname, '..', 'src', 'config', 'r2-assets.json'),
    JSON.stringify(mapping, null, 2)
  );
  console.log('\n✅ URL mapping saved to src/config/r2-assets.json');
}

main().catch(console.error);
