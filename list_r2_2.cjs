const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env.local' });
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
});
async function run() {
    let res = await s3.send(new ListObjectsV2Command({ Bucket: 'armin-gallery-images', Prefix: 'artworks/museo-egizio' }));
    if (res.Contents) console.log('museo-egizio:', res.Contents.slice(0, 2).map(c => c.Key));
    
    // what about cairo?
    res = await s3.send(new ListObjectsV2Command({ Bucket: 'armin-gallery-images', Prefix: 'artworks/cairo' }));
    if (res.Contents) console.log('cairo:', res.Contents.slice(0, 2).map(c => c.Key));
}
run();
