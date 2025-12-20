/**
 * Remove temporary exhibitions not on current Tate website
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/tate-modern.json');
const d = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// Current exhibitions on Tate website (from the fetched page)
// Only these exhibitions/events are shown on the current Tate Modern page
const validExhibitions = [
  'Emily Kam Kngwarray',
  'Theatre Picasso', 
  'Nigerian Modernism',
  'Tracey Emin',
  'Frida: The Making of an Icon',
  'Ana Mendieta',
  'Light and Magic',
  'Julio Le Parc',
  'Gathering Ground',
  'Hyundai Commission',  // covers both Máret Ánne Sara and 2026
  'Voices of Water'
];

const removed = [];

d.items = d.items.filter(item => {
  // Keep all displays (permanent)
  if (item.id && item.id.startsWith('display-')) return true;
  
  // Check if temp exhibition matches any valid exhibition (exact match)
  const title = (item.title || '').toLowerCase().trim();
  const isValid = validExhibitions.some(v => {
    const valid = v.toLowerCase();
    // Check if title contains valid or valid contains main part of title
    return title.includes(valid) || valid.includes(title);
  });
  
  if (!isValid) {
    removed.push(item.title);
    return false;
  }
  return true;
});

console.log('Removed', removed.length, 'items:');
removed.forEach(t => console.log('  -', (t || 'untitled').substring(0, 60)));

fs.writeFileSync(DATA_PATH, JSON.stringify(d, null, 2));
console.log('\nKept', d.items.length, 'items');

// Show remaining
console.log('\nRemaining items:');
d.items.forEach((item, i) => {
  const isDisplay = item.id && item.id.startsWith('display-');
  console.log((i+1) + '. [' + (isDisplay ? 'DISPLAY' : 'TEMP') + '] ' + item.title);
});
