const fs = require('fs');

let content = fs.readFileSync('scripts/gen-up-scripts.cjs', 'utf-8');

// replace targetUrl extraction to include primaryImage and original_imageUrl
content = content.replace(
  /let targetUrl = item\.image_url \|\| item\.imageUrl \|\| item\.image \|\| item\.thumbnail \|\| "";/,
  "let targetUrl = item.image_url || item.imageUrl || item.image || item.thumbnail || item.primaryImage || item.original_imageUrl || \"\";"
);

// replace id fallback to include objectID
content = content.replace(
  /const fallbackId = item\.id \? String\(item\.id\) : `\$\{i\}`;/,
  "const fallbackId = item.id ? String(item.id) : (item.objectID ? String(item.objectID) : `${i}`);"
);

fs.writeFileSync('scripts/gen-up-scripts.cjs', content, 'utf-8');
console.log('Patched');
