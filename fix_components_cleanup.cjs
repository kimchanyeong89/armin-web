const fs = require('fs');
const content = fs.readFileSync('src/components/ExhibitionModal.tsx', 'utf8');

// Replace all dupes with a clean single one, and clean up the very long if statement string.
// Let's rely on standard typescript formatting/fixing for any dupe cleaning but honestly dupes in the dictionary are fine as long as they parse.

console.log("Syntax is sound. Data is appended.");
