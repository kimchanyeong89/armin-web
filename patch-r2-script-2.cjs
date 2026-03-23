const fs = require('fs');

let content = fs.readFileSync('scripts/gen-up-scripts.cjs', 'utf-8');

// replace save assignment
content = content.replace(
  /if\(item.image\) item.image = r2Url;/g,
  "if(item.image) item.image = r2Url;\n                if(item.primaryImage) item.primaryImage = r2Url;"
);

content = content.replace(
  /if\(!item.original_imageUrl\) item.original_imageUrl = original;/g,
  "if(!item.original_imageUrl) item.original_imageUrl = original;\n                item.image_url = r2Url;" // Force setting image_url so that the frontend always has it correctly!
);

fs.writeFileSync('scripts/gen-up-scripts.cjs', content, 'utf-8');
console.log('Patched 2');
