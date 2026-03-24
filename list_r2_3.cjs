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
    let res = await s3.send(new ListObjectsV2Command({ Bucket: 'armin-gallery-images', Prefix: 'artworks/' }));
    let prefixes = new Set();
    if (res.Contents) {
        for (let c of res.Contents) {
            let parts = c.Key.split('/');
            if (parts.length > 1) prefixes.add(parts[1]);
        }
    }
    console.log(Array.from(prefixes).filter(p => p.includes('egypt') || p.includes('cairo')));
}
run();
