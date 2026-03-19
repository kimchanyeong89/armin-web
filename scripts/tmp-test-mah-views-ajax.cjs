const axios = require('axios');

async function test(pageIndex) {
  const params = new URLSearchParams({
    view_name: 'search_results',
    view_display_id: 'page_4',
    view_dom_id: '89e168d49c81898db692337571ce4bf7062482bf5296d1b71180de6aee4d8e8f',
    view_args: '',
    view_path: '/collection/recherche',
    page: String(pageIndex),
    _drupal_ajax: '1',
    'f[0]': 'artwork_property:Œuvres avec images',
    'f[1]': 'collections:57484'
  });

  const res = await axios.post('https://www.mahmah.ch/views/ajax', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=artwork_property%3A%C5%92uvres%20avec%20images&f%5B1%5D=collections%3A57484'
    },
    validateStatus: () => true,
    timeout: 60000
  });

  console.log('page', pageIndex, 'status', res.status);
  if (!Array.isArray(res.data)) {
    console.log('not array', typeof res.data, String(res.data).slice(0, 200));
    return;
  }

  const settings = res.data.find((x) => x.command === 'settings')?.settings || {};
  const count = settings.result_count;
  const nav = settings.artwork_navigator?.search_results || [];
  console.log('result_count', count, 'nav_first', nav[0]?.id, nav[0]?.title);
}

(async () => {
  await test(0);
  await test(1);
  await test(2);
})();
