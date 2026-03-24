const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('debug_be.html', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

let title = '';
let artist = '';
let inv = '';
let image = null;

const titleEl = document.querySelector('.header .span8 h2');
if (titleEl) {
    const authorSpan = titleEl.querySelector('.author');
    if (authorSpan) {
        artist = authorSpan.textContent.trim();
        let rawTitle = titleEl.textContent.replace(artist, '');
        title = rawTitle.trim();
    } else {
        title = titleEl.textContent.trim();
    }
}

const imgEl = document.querySelector('.image img') || document.querySelector('img[src*="/uploads/"]');
if (imgEl) {
    image = 'https://fine-arts-museum.be' + imgEl.getAttribute('src');
}

console.log({title, artist, image});
