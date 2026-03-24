const { execSync } = require('child_process');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

function getHtml(url) {
    return execSync(`curl -sL "${url}" -H "Accept: text/html"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
}

const html = getHtml('https://egyptianmuseumcairo.eg/artefacts/');
const dom = new JSDOM(html);
const links = Array.from(dom.window.document.querySelectorAll('a'))
  .map(a => a.href)
  .filter(h => h.includes('/artefacts/') && !h.includes('/page/'));

console.log('Links found:', new Set(links).size);
