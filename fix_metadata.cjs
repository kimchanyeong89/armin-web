const fs = require('fs');

const path = './src/components/ExhibitionModal.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('getUnifiedArtworkName')) {
  // We should import it right at the top
  content = "import { getUnifiedArtworkName, getUnifiedArtworkCreator } from '../utils/metadata';\n" + content;
}

// Replace name fallback patterns
// name: item.title || 'Untitled',
// name: (item.title || item.name || 'Untitled'),
// name: String(item?.title || 'Untitled'),
content = content.replace(/name\s*:\s*(?:String\()?([^,\\n}]+(?:\|\|)[^,\\n}]+'Untitled'(?:\))?)(\))?\s*,/g, "name: getUnifiedArtworkName(item),");
content = content.replace(/name\s*:\s*item\.title\s*,/g, "name: getUnifiedArtworkName(item),");
content = content.replace(/name\s*:\s*item\.name\s*,/g, "name: getUnifiedArtworkName(item),");
content = content.replace(/name\s*:\s*item\.title\s*\|\|\s*'Untitled'\s*,/g, "name: getUnifiedArtworkName(item),");
content = content.replace(/name\s*:\s*item\.name\s*\|\|\s*'Untitled'\s*,/g, "name: getUnifiedArtworkName(item),");
content = content.replace(/name\s*:\s*item\.title\s*\|\|\s*item\.name\s*\|\|\s*'Untitled'\s*,/g, "name: getUnifiedArtworkName(item),");

// Replace creator patterns
content = content.replace(/creator\s*:\s*(?:String\()?([^,\\n}]+(?:\|\|)[^,\\n}]+'Unknown'(?:\))?)(\))?\s*,/g, "creator: getUnifiedArtworkCreator(item),");

// Check special let name cases
content = content.replace(/let\s+name\s*=\s*[^;]+'Untitled'\s*;/g, "let name = getUnifiedArtworkName(item);");

fs.writeFileSync(path, content);
console.log('Finished updating ExhibitionModal.tsx!');
