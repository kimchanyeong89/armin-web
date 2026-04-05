const fs = require('fs');
const failedLines = fs.readFileSync('siglip_failed.jsonl', 'utf8').split('\n').filter(Boolean);
const validFails = [];
const npgIdsToRemove = new Set();
for (const line of failedLines) {
  const item = JSON.parse(line);
  if (item.e === 'npg-london-collection') {
    npgIdsToRemove.add(String(item.id));
  } else {
    validFails.push(line);
  }
}
fs.writeFileSync('siglip_failed.jsonl', validFails.join('\n') + (validFails.length ? '\n' : ''));

const processedLines = fs.readFileSync('siglip_processed_ids.txt', 'utf8').split('\n').filter(Boolean);
const validProcessed = processedLines.filter(id => !npgIdsToRemove.has(id));
fs.writeFileSync('siglip_processed_ids.txt', validProcessed.join('\n') + (validProcessed.length ? '\n' : ''));

const state = JSON.parse(fs.readFileSync('siglip_state.json', 'utf8'));
if (state.museum_failed) delete state.museum_failed['npg-london-collection'];
if (state.museum_processed) delete state.museum_processed['npg-london-collection'];
if (state.museum_counts) delete state.museum_counts['npg-london-collection'];
fs.writeFileSync('siglip_state.json', JSON.stringify(state, null, 2));

console.log('Cleaned up NPG logic. Removed', npgIdsToRemove.size, 'IDs');
