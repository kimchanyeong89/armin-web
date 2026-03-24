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
    let continuationToken = undefined;
    let found = [];
    do {
        const res = await s3.send(new ListObjectsV2Command({
            Bucket: 'armin-gallery-images',
            ContinuationToken: continuationToken
        }));
        for (let c of res.Contents || []) {
            if (c.Key.toLowerCase().includes('cairo')) found.push(c.Key);
        }
        continuationToken = res.NextContinuationToken;
    } while (continuationToken);
    console.log('Cairo files:', found);
}
run();
