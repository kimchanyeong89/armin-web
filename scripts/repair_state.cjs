const fs = require('fs');

const state = JSON.parse(fs.readFileSync('siglip_state.json', 'utf8'));
const processed = new Set(fs.readFileSync('siglip_processed_ids.txt', 'utf8').split('\n').map(x => x.trim()).filter(Boolean));

const manifest = JSON.parse(fs.readFileSync('public/data/search-manifest.json', 'utf8'));

let realTotalSuccess = 0;

for (const chunk of manifest.chunks) {
  const data = JSON.parse(fs.readFileSync('public/data/' + chunk, 'utf8'));
  const arts = Array.isArray(data[0]) ? data[0] : data;
  
  // Group by museum
  const grouped = {};
  for (const a of arts) {
    if (!a.e) continue;
    if (!grouped[a.e]) grouped[a.e] = [];
    grouped[a.e].push(a);
  }

  for (const [e_id, e_arts] of Object.entries(grouped)) {
    let processedCount = 0;
    for (const a of e_arts) {
      const id = String(a.id || (a.e + '-' + a.n));
      if (processed.has(id)) {
        processedCount++;
      }
    }
    
    if (!state.museum_processed) state.museum_processed = {};
    
    state.museum_processed[e_id] = (state.museum_processed[e_id] || 0) + processedCount;
    realTotalSuccess += processedCount;
  }
}

// Ensure the counts match EXACTLY what's truly processed
for(const e_id of Object.keys(state.museum_counts || {})) {
    // We already built the processedCount per museum in the chunk loop, 
    // but wait, the chunk loop builds it cumulatively because of multiple chunks! 
}

// Re-calculate from scratch instead to be perfectly safe
state.museum_processed = {};
realTotalSuccess = 0;
for (const chunk of manifest.chunks) {
    const data = JSON.parse(fs.readFileSync('public/data/' + chunk, 'utf8'));
    const arts = Array.isArray(data[0]) ? data[0] : data;
    for (const a of arts) {
        if (!a.e) continue;
        const id = String(a.id || (a.e + '-' + a.n));
        if (processed.has(id)) {
            state.museum_processed[a.e] = (state.museum_processed[a.e] || 0) + 1;
            realTotalSuccess++;
        }
    }
}

state.stats.total_success = realTotalSuccess;
fs.writeFileSync('siglip_state.json', JSON.stringify(state, null, 2));
console.log('Fixed siglip state counts! Total success:', realTotalSuccess);
