/**
 * Firebase Storage → Cloudflare R2 Migration Script
 * 
 * This script:
 * 1. Lists all files in Firebase Storage
 * 2. Downloads each file
 * 3. Uploads to R2 with the same path structure
 * 4. Logs progress and any errors
 */
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Progress file
const PROGRESS_FILE = './downloads/r2-migration-progress.json';

// Initialize Firebase Admin
const serviceAccount = require('../firebase-service-account.json');
initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'armin-web'
});
const bucket = getStorage().bucket();

// Initialize R2
const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Load progress
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { migrated: [], failed: [], skipped: [], startedAt: new Date().toISOString() };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Check if file exists in R2
async function existsInR2(key) {
  try {
    await R2.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

// Upload to R2
async function uploadToR2(buffer, key, contentType) {
  await R2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// Get content type from filename
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.txt': 'text/plain',
  };
  return types[ext] || 'application/octet-stream';
}

async function migrateAll() {
  console.log('🚀 Starting Firebase Storage → R2 Migration');
  console.log('');
  
  const progress = loadProgress();
  const alreadyMigrated = new Set(progress.migrated);
  
  // List all files in Firebase Storage
  console.log('📋 Listing files in Firebase Storage...');
  const [files] = await bucket.getFiles();
  console.log(`   Found ${files.length} files total`);
  console.log(`   Already migrated: ${alreadyMigrated.size}`);
  console.log('');
  
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = file.name;
    
    // Skip if already migrated
    if (alreadyMigrated.has(filePath)) {
      skipCount++;
      continue;
    }
    
    try {
      // Check if already exists in R2
      const r2Key = `armin-web/${filePath}`;
      if (await existsInR2(r2Key)) {
        console.log(`⏭️  [${i+1}/${files.length}] Already in R2: ${filePath}`);
        progress.migrated.push(filePath);
        progress.skipped.push(filePath);
        skipCount++;
        saveProgress(progress);
        continue;
      }
      
      // Download from Firebase
      console.log(`📥 [${i+1}/${files.length}] Downloading: ${filePath}`);
      const [buffer] = await file.download();
      
      // Upload to R2
      const contentType = getContentType(filePath);
      console.log(`📤 [${i+1}/${files.length}] Uploading to R2: ${r2Key}`);
      const r2Url = await uploadToR2(buffer, r2Key, contentType);
      
      console.log(`✅ [${i+1}/${files.length}] Migrated: ${filePath} → ${r2Url}`);
      progress.migrated.push(filePath);
      successCount++;
      saveProgress(progress);
      
      // Rate limit - 50ms between uploads
      await new Promise(r => setTimeout(r, 50));
      
    } catch (error) {
      console.error(`❌ [${i+1}/${files.length}] Failed: ${filePath} - ${error.message}`);
      progress.failed.push({ path: filePath, error: error.message });
      errorCount++;
      saveProgress(progress);
    }
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('📊 Migration Complete!');
  console.log(`   ✅ Migrated: ${successCount}`);
  console.log(`   ⏭️  Skipped (already exists): ${skipCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📁 Total processed: ${files.length}`);
  console.log('═══════════════════════════════════════════');
  
  progress.completedAt = new Date().toISOString();
  saveProgress(progress);
  
  // Summary of failed files
  if (progress.failed.length > 0) {
    console.log('');
    console.log('⚠️  Failed files:');
    progress.failed.forEach(f => console.log(`   - ${f.path}: ${f.error}`));
  }
}

migrateAll().catch(console.error);
