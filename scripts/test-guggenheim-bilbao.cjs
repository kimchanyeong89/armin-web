/**
 * Quick sanity test for Guggenheim Bilbao scraper parsing.
 *
 * Usage:
 *   node scripts/test-guggenheim-bilbao.cjs
 *   node scripts/test-guggenheim-bilbao.cjs <workUrl1> <workUrl2> ...
 */

const {
  fetchText,
  parseDetailPage
} = require('./scrape-guggenheim-bilbao.cjs');

const DEFAULT_URLS = [
  'https://www.guggenheim-bilbao.eus/en/the-collection/works/untitled-mark-rothko',
  'https://www.guggenheim-bilbao.eus/en/the-collection/works/hillargia',
  'https://www.guggenheim-bilbao.eus/en/the-collection/works/one-hundred-and-fifty-multicolored-marilyns'
];

async function main() {
  const urls = process.argv.slice(2);
  const targets = urls.length ? urls : DEFAULT_URLS;

  for (const url of targets) {
    const html = await fetchText(url);
    const parsed = parseDetailPage(html, url);

    console.log('\n============================================================');
    console.log(url);
    console.log('title      :', parsed.title);
    console.log('artist     :', parsed.artist);
    console.log('date       :', parsed.date);
    console.log('medium     :', parsed.medium);
    console.log('dimensions :', parsed.dimensions);
    console.log('location   :', parsed.location);
    console.log('categories :', (parsed.categories || []).join(' | '));
    console.log('images     :', (parsed.images || []).map((i) => i.url).slice(0, 3));
    console.log('metadata   :', parsed.metadata);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
