const fs = require('fs');
const path = './src/components/ExhibitionModal.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/name\s*:\s*\([^,]*(?:'Untitled').*?\)\s*,/g, "name: getUnifiedArtworkName(item),");
content = content.replace(/name\s*:\s*.*?(?:'Untitled').*?,/g, "name: getUnifiedArtworkName(item),");

content = content.replace(/creator\s*:\s*(?:\()?[^,]*(?:'Unknown')(?:\))?\s*,/g, "creator: getUnifiedArtworkCreator(item),");
content = content.replace(/artist\s*:\s*(?:\()?[^,]*(?:'Unknown')(?:\))?\s*,/g, "artist: getUnifiedArtworkCreator(item),");

content = content.replace(/const title = item\.title \|\| item\.name \|\| 'Untitled';/g, "const title = getUnifiedArtworkName(item);");
content = content.replace(/let rawTitle = .*?;/g, "let rawTitle = getUnifiedArtworkName(item);");
content = content.replace(/rawTitle = item\.title \|\| 'Untitled';/g, "rawTitle = getUnifiedArtworkName(item);");
content = content.replace(/rawTitle = item\.tytul \|\| 'Untitled';/g, "rawTitle = getUnifiedArtworkName(item);");
content = content.replace(/const title = item\.title \|\| item\.name \|\| item\.nameEn \|\| 'Untitled';/g, "const title = getUnifiedArtworkName(item);");

fs.writeFileSync(path, content);
console.log('Fixed again!');
