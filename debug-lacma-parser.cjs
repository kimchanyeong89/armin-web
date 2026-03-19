const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('/tmp/lacma_detail.html', 'utf8');
const $ = cheerio.load(html);

const title = $('h1').first().text().trim();
const artistBlock = $('.artist-name').first();
const artistName = artistBlock.text().trim();
const artistLink = artistBlock.find('a').attr('href');

const rightGroup = $('.group-right');
let date = null;
let classification = null;
let medium = null;
let dimensions = null;
let credit = null;
let department = null;

// The text nodes and divs inside group-right are unstructured.
// We need to iterate over all child nodes (text and element)
const contents = rightGroup.contents();
const lines = [];

contents.each((i, el) => {
  const text = $(el).text().trim();
  if (text) lines.push({ text, el });
});

// Debug lines
// console.log('Lines:', lines.map(l => l.text));

// Heuristics
lines.forEach((lineObj, index) => {
  const text = lineObj.text;
  if (text === title || text.includes(artistName)) return;

  if (text.includes('cm)') || text.includes('in.)') || /^\d+\s*x\s*\d+/.test(text)) {
    dimensions = text.replace(/^Image:\s*/i, '');
  } else if (/^Gift of|^Purchased with|^Bequest of/i.test(text)) {
    credit = text;
  } else if (/Art$/.test(text) && $(lineObj.el).find('a').length > 0) {
    department = text;
  } else if (/paintings|drawings|prints|sculpture|scrolls/i.test(text) && !classification) {
    // Weak heuristic, but "Paintings; scrolls" was seen
    classification = text;
  } else if (!date && /\d{4}/.test(text) && text.length < 50) {
    // "Japan, 2nd half of the 18th century"
    date = text;
  } else if (!medium && !classification && !credit && !dimensions && !department) {
    // "Hanging scroll; ink and colors on silk"
    medium = text;
  } else if (!medium && classification && !credit && !dimensions && !department) {
     // If we already have classification, this might be medium
     medium = text;
  }
});

const image = $('.group-left img').attr('src');
const download = $('.download-options').length > 0;

console.log(JSON.stringify({
  title,
  artist: artistName,
  date,
  classification,
  medium,
  dimensions,
  credit,
  department,
  image,
  hasDownload: download
}, null, 2));
