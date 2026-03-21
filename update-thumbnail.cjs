const fs = require('fs');

const path = 'scripts/generate-search-index.cjs';
let content = fs.readFileSync(path, 'utf8');

const oldFunc = `function getThumbnailUrl(item) {
    let url = item.thumb || item.thumbnailUrl || item.lq || item.image || item.imageUrl || '';`;

const newFunc = `function getThumbnailUrl(item) {
    let url = item.thumb || item.thumbnailUrl || item.lq || item.image || item.imageUrl || '';
    
    // Add support for item.images array 
    if (!url && item.images && Array.isArray(item.images) && item.images.length > 0) {
        if (typeof item.images[0] === 'string') {
            url = item.images[0];
        } else if (item.images[0] && item.images[0].url) {
            url = item.images[0].url;
        }
    }
`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync(path, content, 'utf8');
console.log('updated getThumbnailUrl');
