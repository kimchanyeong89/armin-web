const cheerio = require('cheerio');
const https = require('https');

const url = 'https://collections.lacma.org/search/site/?f[0]=bm_field_has_image:true&f[1]=im_field_classification:22';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    const $ = cheerio.load(html);
    const facets = [];
    $('.filter-list-item a, .facet-list a, .block-facet-api a').each((i, el) => {
      facets.push({
        text: $(el).text().replace(/\s+/g, ' ').trim(),
        href: $(el).attr('href')
      });
    });
    console.log(JSON.stringify(facets, null, 2));
    
    // Also look for "On view" specifically in the page text
    const onViewText = html.match(/On view\s+\(\d+\)/i);
    if (onViewText) console.log('Found in text:', onViewText[0]);
  });
});
