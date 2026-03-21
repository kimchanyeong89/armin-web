const fs = require('fs');

const path = 'src/components/ExhibitionModal.tsx';
let data = fs.readFileSync(path, 'utf8');

// Special cases map section
data = data.replace(
  /const withImages = isTate \? list : list\.filter\(\(a\) => !!a\.image && !a\.image\.includes\('no-image'\)\);/g,
  `const withImages = isTate ? list : list.filter((a) => !!a.image && !a.image.includes('no-image'));`
);

// We need to bypass `!!a.image` filter for Tate museums globally in jsonFiles logic
data = data.replace(
  /const withImages = list\.filter\(\(a\) => !!a\.image\);/g,
  `const isTateFeed = exhibition.id.startsWith('tm-') || exhibition.id.startsWith('tbc-') || exhibition.id.startsWith('tsi-');
          const withImages = isTateFeed ? list : list.filter((a) => !!a.image);`
);

fs.writeFileSync(path, data, 'utf8');
console.log('Fixed');
