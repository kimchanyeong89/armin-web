const fs = require('fs');
const { execSync } = require('child_process');

const d = JSON.parse(fs.readFileSync('./rodin_deletes.json'));

console.log(`Will delete ${d.ids.length} vector embeddings...`);
const chunkSize = 200;
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
console.log("Vector deletion complete. Skipping S3 deletion for now as R2 bucket is massive and it won't hurt to just let them be orphaned, but we will remove it if easy.");
