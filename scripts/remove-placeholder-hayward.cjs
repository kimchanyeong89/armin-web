const fs = require('fs');
const path = require('path');

// IDs to remove (placeholder images)
const toRemove = new Set([
  "hayward-57642","hayward-57643","hayward-25045","hayward-25046","hayward-25044","hayward-25049",
  "hayward-25052","hayward-25054","hayward-25058","hayward-25063","hayward-25062","hayward-25065",
  "hayward-25067","hayward-25066","hayward-25069","hayward-25070","hayward-25068","hayward-25076",
  "hayward-25078","hayward-25079","hayward-25087","hayward-25088","hayward-25090","hayward-25091",
  "hayward-25097","hayward-25098","hayward-25101","hayward-25100","hayward-25102","hayward-25103",
  "hayward-25104","hayward-25106","hayward-25108","hayward-25112","hayward-25113","hayward-25114",
  "hayward-25116","hayward-25117","hayward-25118","hayward-25037","hayward-25048","hayward-25072",
  "hayward-25073","hayward-25083","hayward-25084","hayward-25099","hayward-25109","hayward-25111",
  "hayward-25115"
]);

const filePath = path.join(__dirname, '../src/data/exhibitions.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find hayward-gallery pastExhibitions section
// We need to find and filter the pastExhibitions array

const { exhibitions } = require('../src/data/exhibitions.js');
const hayward = exhibitions.find(e => e.id === 'hayward-gallery');
const originalCount = hayward.pastExhibitions.length;
const remaining = hayward.pastExhibitions.filter(ex => !toRemove.has(ex.id));

console.log('Original past exhibitions:', originalCount);
console.log('After removing placeholders:', remaining.length);
console.log('Removed:', originalCount - remaining.length);

// Build the new pastExhibitions array string
const newPastExhibitions = remaining.map(ex => {
  // Escape any special characters in strings
  const escape = s => s ? s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') : '';
  const parts = [];
  parts.push(`id: "${ex.id}"`);
  parts.push(`name: "${escape(ex.name)}"`);
  parts.push(`title: "${escape(ex.title)}"`);
  if (ex.description) parts.push(`description: "${escape(ex.description)}"`);
  if (ex.detailedDescription) parts.push(`detailedDescription: "${escape(ex.detailedDescription)}"`);
  if (ex.coverImage) parts.push(`coverImage: "${ex.coverImage}"`);
  if (ex.url) parts.push(`url: "${ex.url}"`);
  if (ex.startDate) parts.push(`startDate: "${ex.startDate}"`);
  if (ex.endDate) parts.push(`endDate: "${ex.endDate}"`);
  return `      { ${parts.join(', ')} }`;
}).join(',\n');

// Find the hayward-gallery section and replace pastExhibitions
// This is a bit complex, so let's use a regex approach

// Find the start of pastExhibitions in hayward-gallery
const haywardMatch = content.match(/id:\s*"hayward-gallery"[\s\S]*?pastExhibitions:\s*\[/);
if (!haywardMatch) {
  console.error('Could not find hayward-gallery pastExhibitions');
  process.exit(1);
}

const startIdx = haywardMatch.index + haywardMatch[0].length;

// Find the matching closing bracket
let bracketCount = 1;
let endIdx = startIdx;
while (bracketCount > 0 && endIdx < content.length) {
  if (content[endIdx] === '[') bracketCount++;
  if (content[endIdx] === ']') bracketCount--;
  endIdx++;
}
endIdx--; // back to the ]

const before = content.slice(0, startIdx);
const after = content.slice(endIdx);

const newContent = before + '\n' + newPastExhibitions + '\n    ' + after;

fs.writeFileSync(filePath, newContent);
console.log('\nUpdated exhibitions.js');
console.log('Removed', toRemove.size, 'exhibitions with placeholder images');
