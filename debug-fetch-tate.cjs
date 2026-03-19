const fs = require('fs');
async function run() {
  const got = (await import('got')).default;
  const res = await got('https://www.tate.org.uk/search?gallery=tate-modern&type=artwork', {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });
  console.log(res.statusCode);
  fs.writeFileSync('debug_tate_search.html', res.body);
}
run();
