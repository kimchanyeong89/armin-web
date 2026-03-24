const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env.local' });

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

async function run() {
   const prefs = [
       'artworks/vam-permanent-exhibitions/',
       'artworks/huntington-collection/',
       'artworks/lacma-classification-22/',
       'artworks/nga-collection/'
   ];

   for (let prefix of prefs) {
       let cnt = 0;
       let token;
       do {
           const res = await s3.send(new ListObjectsV2Command({ Bucket: 'armin-gallery-images', Prefix: prefix, ContinuationToken: token }));
           if(res.Contents) cnt += res.Contents.length;
           token = res.NextContinuationToken;
       } while(token);
       console.log(prefix, "has", cnt, "objects");
   }
}
run();
