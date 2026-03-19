const axios = require('axios');
const cheerio = require('cheerio');

const urls = [
  'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484&page=0',
  'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484&page=1',
  'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57499&page=0'
];

(async () => {
  for (const url of urls) {
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data || '');
    const count = $('.mah-artwork').length;
    const total = $('.search-artworks-title[data-count]').attr('data-count') || '';
    console.log(url, 'items', count, 'total', total);
  }
})().catch((err) => {
  console.error('ERR', err.message);
  process.exitCode = 1;
});
