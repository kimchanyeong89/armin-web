const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('public/debug_lacma.html', 'utf8');
const $ = cheerio.load(html);

// Find all facet links
$('a').each((i, el) => {
  const href = $(el).attr('href');
  if (href && (href.includes('f[') || href.includes('f%5B'))) {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (href.includes('curatorial-area') || href.includes('classification')) {
       console.log(`${text} -> ${decodeURIComponent(href)}`);
    }
  }
});
