const fs = require('fs');
let code = fs.readFileSync('src/components/ArtistWikiPanel.tsx', 'utf8');

code = code.replace(
  /\{wikiSourceUrl && \([\s\S]*?Read more on Wikipedia ↗\s*<\/a>\s*\)\}/,
  '{/* Wikipedia link moved to header */}'
);

fs.writeFileSync('src/components/ArtistWikiPanel.tsx', code, 'utf8');
