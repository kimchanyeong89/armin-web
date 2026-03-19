const cheerio = require('cheerio');
const https = require('https');

const url = "https://dia.org/search/collection?keys=&with_image=1&sort_by=relevance&on_view=0&f%5B0%5D=classification%3A4205";

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const $ = cheerio.load(data);
        $('.views-row').first().each((i, el) => {
            const body = $(el).find('.carousel_item_body').html();
            console.log('Body Snippet:', body);
        });
    });
});
