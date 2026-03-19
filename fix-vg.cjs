const fs = require('fs');

const path = 'public/data/vangogh-museum-collection.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// Find duplicates by exact URL, or URL base without r/v.
// Actually, earlier the user showed "head of a woman" and I found exactly 205 duplicates when comparing IDs.
// Let's print out what the item structure is for vangogh to see why the id logic didn't reduce count.

console.log('Sample item:', data[5]);

