const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
require("dotenv").config({ path: ".env.local" });

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function run() {
  const Bucket = "armin-gallery-images";
  try {
    const data = await s3Client.send(new ListObjectsV2Command({ Bucket, Delimiter: '/', Prefix: 'artworks/' }));
    if (data.CommonPrefixes) {
      console.log('Directories in artworks/:');
      data.CommonPrefixes.forEach(p => console.log(p.Prefix));
    }
  } catch (err) {
    console.error(err);
  }
}
run();
