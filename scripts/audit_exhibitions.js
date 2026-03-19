const fs = require('fs');
const path = require('path');

try {
  const exhibitionsContent = fs.readFileSync('src/data/exhibitions.js', 'utf8');
  const modalContent = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');
  
  // Regex to find permanentExhibitions arrays and the objects inside them
  // This is a heuristic parser.
  const regex = /id:\s*["']([^"']+)["'][^}]*collectionFile:\s*["']([^"']+)["']/g;
  
  let match;
  const exhibitions = [];
  
  while ((match = regex.exec(exhibitionsContent)) !== null) {
      exhibitions.push({
          id: match[1],
          file: match[2]
      });
  }
  
  console.log(`Found ${exhibitions.length} exhibition entries in config.`);
  
  const publicDataFiles = new Set(fs.readdirSync('public/data'));
  
  const missingFiles = [];
  const unmatchedIds = [];
  
  exhibitions.forEach(ex => {
      // Check file existence
      if (!publicDataFiles.has(ex.file)) {
          missingFiles.push(ex);
      }
  
      // Check if ID is mentioned in ExhibitionModal.tsx
      // We look for the exact string ID in quotes
      if (!modalContent.includes(`'${ex.id}'`) && !modalContent.includes(`"${ex.id}"`)) {
          unmatchedIds.push(ex.id);
      }
  });
  
  console.log('\n--- Missing JSON Files ---');
  if (missingFiles.length === 0) console.log('None.');
  else missingFiles.forEach(m => console.log(`${m.id} -> ${m.file}`));
  
  console.log('\n--- IDs Not Found in Modal Logic (Potentially Broken) ---');
  if (unmatchedIds.length === 0) console.log('None.');
  else unmatchedIds.forEach(id => console.log(id));

} catch (err) {
  console.error('Error:', err);
}
