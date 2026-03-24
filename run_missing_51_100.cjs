const fs = require('fs');
const { execSync } = require('child_process');

const content = fs.readFileSync('perm_table_final.md', 'utf-8');
const lines = content.split('\n').filter(l => l.startsWith('|'));

let count = 0;
let headerPassed = false;

for (const line of lines) {
  if (line.includes('No.') || line.includes('순번')) { headerPassed = true; continue; }
  if (line.includes('---')) continue;
  if (!headerPassed) continue;

  count++;
  if (count <= 50) continue;
  if (count > 100) break;

  const cols = line.split('|').map(s => s.trim());
  if (cols.length < 8) continue;
  
  const total = parseInt(cols[7].replace(/,/g, ''), 10);
  const r2Str = cols[8].replace(/,/g, '');
  const r2 = isNaN(parseInt(r2Str, 10)) ? 0 : parseInt(r2Str, 10);
  
  const rawFileName = cols[6];
  const fileMatch = rawFileName.match(/href="([^"]+)"/) || rawFileName.match(/\[(.*?)\]/) || rawFileName;
  let file = Array.isArray(fileMatch) ? fileMatch[1] : fileMatch;
  if (file.includes(' ')) file = file.split(' ')[0];
  if (file.includes('<')) file = file.split('<')[0];
  file = file.trim();
  if (file.startsWith('data/')) file = file.replace('data/', '');
  
  const exhibitionId = cols[5].replace(/<[^>]*>?/gm, '').trim();

  if (total > 0 && r2 < total) {
    console.log(`\n================================`);
    console.log(`Processing ID ${count}: ${file} (diff: ${total - r2}) Prefix: ${exhibitionId}`);
    try {
      // Run the upload script
      const out = execSync(`node scripts/generic-r2-upload.cjs "${file}" "${exhibitionId}"`, { stdio: ['ignore', 'pipe', 'pipe'] });
      const errorLines = out.toString().split('\n').filter(l => l.includes('ERR:'));
      console.log(`Output parsed. Found ${errorLines.length} errors.`);
      if (errorLines.length > 0) {
        console.log("Sample Errors:");
        console.log(errorLines.slice(0, 5).join('\n'));
      }
    } catch(err) {
      console.log(`Error running script for ${file}: ${err.message}`);
    }
  }
}
console.log("Done checking 51-100.");
