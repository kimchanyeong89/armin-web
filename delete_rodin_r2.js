const fs = require('fs');
const { execSync } = require('child_process');

const d = JSON.parse(fs.readFileSync('./rodin_deletes.json'));

console.log(`Will delete ${d.ids.length} vector embeddings...`);
const chunkSize = 100;
for (let i = 0; i < d.ids.length; i += chunkSize) {
    const chunk = d.ids.slice(i, i + chunkSize);
    const idList = chunk.join(',');
    try {
        execSync(`npx wrangler vectorize delete armin-vector-prod --ids "${idList}"`, { stdio: 'ignore' });
        console.log(`Deleted vectors ${i} to ${i + chunk.length}`);
    } catch (e) {
        console.error(`Failed vector delete for chunk ${i}`);
    }
}
console.log("Vector deletion complete.");

console.log(`Will delete ${d.urls.length} images from S3...`);
// R2 URL: https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/rodin-collection/rodin-1-cba854b6-imageUrl.webp
// Bucket name is probably armin-images, prefix artworks/...
// Let's use AWS CLI if available.
