const https = require('https');
const cheerio = require('cheerio');

const url = 'https://collections.lacma.org/search/site/?f[0]=bm_field_has_image:true';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let html = '';
    res.on('data', c => html += c);
    res.on('end', () => {
        const $ = cheerio.load(html);
        $('a').each((i, el) => {
            const h = $(el).attr('href');
            if (h && h.includes('im_field_classification')) {
                console.log($(el).text().trim(), '->', h);
            }
        });
    });
});
