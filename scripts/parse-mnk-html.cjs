const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('logs/mnk-catalog.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- Filter Headers ---');
$('h3, h4, .filter-title').each((i, el) => {
    console.log($(el).text().trim());
});

console.log('--- Labels containing "Painting", "Drawing" etc ---');
$('*').filter((i, el) => {
    return /painting|drawing|illustration|poster|photography|video/i.test($(el).text());
}).each((i, el) => {
    // Only print leaf nodes or small nodes
    if ($(el).children().length === 0) {
        console.log($(el).text().trim());
    }
});

console.log('--- Links with filtering params ---');
$('a[href*="filter"]').each((i, el) => {
   console.log($(el).attr('href')); 
});
console.log('--- Links with category params ---');
$('a[href*="category"]').each((i, el) => {
   console.log($(el).attr('href')); 
});

// Try to find the filter list structure
const filterContainer = $('div:contains("FILTER BY")').last().parent();
console.log('--- Filter Container Structure ---');
console.log(filterContainer.html().substring(0, 500));
