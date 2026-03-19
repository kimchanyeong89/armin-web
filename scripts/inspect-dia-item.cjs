const cheerio = require('cheerio');
const https = require('https');

const url = "https://dia.org/search/collection?keys=&with_image=1&sort_by=relevance&on_view=0&f%5B0%5D=classification%3A4205";

https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const $ = cheerio.load(data);
        console.log('Items found:', $('.views-row').length);
        
        $('.views-row').each((i, el) => {
            if (i > 0) return; // check first one
            const title = $(el).find('.card-title, h3, h4').text().trim();
            const link = $(el).find('a').attr('href');
            const img = $(el).find('img').attr('src');
            const artist = $(el).find('.artist-name').text().trim(); // guessing class
            const date = $(el).find('.date').text().trim(); // guessing
            
            console.log('Title:', title);
            console.log('Link:', link);
            console.log('Image:', img);
            console.log('HTML Snippet:', $(el).html().substring(0, 500));
        });
    });
});
