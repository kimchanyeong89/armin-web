const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.mahmah.ch/collection/recherche?f%5B0%5D=collections%3A57484';

async function testPagination() {
    try {
        console.log('Fetching Page 0 to get DOM ID...');
        const res0 = await axios.get(BASE_URL);
        const settings0 = res0.data.match(/data-drupal-selector="drupal-settings-json">({.*?})<\/script>/);
        let domId = '';
        if (settings0 && settings0[1]) {
            const json = JSON.parse(settings0[1]);
            // Navigate key structure based on previous curl output
            // views.ajaxViews["views_dom_id:..."].view_dom_id
            const views = json.views.ajaxViews;
            const key = Object.keys(views).find(k => k.startsWith('views_dom_id'));
            if (key) {
                domId = views[key].view_dom_id;
                console.log('Found DOM ID:', domId);
            }
        }
        
        if (!domId) {
             console.log('Failed to find DOM ID. Using hardcoded backup if available (risky).');
             return;
        }

        console.log('Testing AJAX POST for Page 1...');
        const params = new URLSearchParams();
        params.append('view_name', 'search_results');
        params.append('view_display_id', 'page_4');
        params.append('view_args', ''); 
        params.append('view_dom_id', domId);
        params.append('pager_element', '0');
        params.append('page', '1');
        params.append('_drupal_ajax', '1');
        params.append('ajax_page_state[theme]', 'mah'); // Minimal state

        const res1 = await axios.post('https://www.mahmah.ch/views/ajax?f%5B0%5D=collections%3A57484', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        // Drupal returns array of commands
        if (Array.isArray(res1.data)) {
            const insertCmd = res1.data.find(c => c.command === 'insert' && c.method === 'append');
            if (insertCmd) {
                const $ajax = cheerio.load(insertCmd.data);
                const firstTitle = $ajax('.masonry-item h3, article h2').first().text().trim();
                console.log('AJAX Page 1 First Item:', firstTitle);
                if (firstTitle) console.log('SUCCESS: AJAX Pagination works.');
            } else {
                console.log('No append command found:', JSON.stringify(res1.data).substring(0, 100));
            }
        } else {
             console.log('Response not array:', typeof res1.data);
        }

    } catch (e) {
        console.error(e.message);
    }
}

testPagination();
