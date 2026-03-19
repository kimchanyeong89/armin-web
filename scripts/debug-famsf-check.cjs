const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('debug-famsf-p1.html', 'utf8');
const $ = cheerio.load(html);

console.log('Total LI:', $('li').length);

$('li').each((i, el) => {
    const $li = $(el);
    const $h3 = $li.find('h3');
    if ($h3.length === 0) return;

    if (i > 15) return;

    const text = $li.text().replace(/\s+/g, ' ').trim();

    console.log(`\n--- Item ${i} ---`);
    console.log('Text:', text.slice(0, 150));
    console.log('H3:', $h3.text().trim());

    const img = $li.find('img').first();
    console.log('Img src:', img.attr('src'));
    const srcset = img.attr('srcset');
    console.log('Img srcset len:', srcset ? srcset.length : 0);
    if (srcset) console.log('Img srcset start:', srcset.slice(0, 120));
});
