const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
    const url = 'https://ssam.seogwipo.go.kr/workart/20'; // A known detail URL
    try {
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(resp.data);

        console.log('Title:', $('.subject h4').text());
        console.log('Title (fallback):', $('.subject').text());

        console.log('--- Metadata Search ---');
        // Search for keywords
        ['재료', '규격', '구분', '연도', '제작년도'].forEach(keyword => {
            console.log(`Searching for "${keyword}":`);
            $(`:contains("${keyword}")`).each((i, el) => {
                if ($(el).children().length === 0) { // Leaf nodes only
                    console.log(`  Found in <${el.tagName} class="${$(el).attr('class')}">: ${$(el).text().trim()}`);
                    console.log(`  Parent: <${$(el).parent().get(0).tagName} class="${$(el).parent().attr('class')}">`);
                }
            });
        });

        console.log('--- Images ---');
        $('img').each((i, el) => {
            console.log(`Img ${i}: ${$(el).attr('src')}`);
        });

    } catch (e) {
        console.error(e);
    }
}

main();
