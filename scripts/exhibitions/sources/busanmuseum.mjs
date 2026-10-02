/**
 * 부산박물관(부산시립박물관) — 특별전시 목록을 진행(ING)·예정(YET)으로 걸러 파싱한다.
 * 상세는 목록에서 POST 로 열리지만 같은 값을 GET(view?bbsNo=1&dataNo=)으로 줘도 열린다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://museum.busan.go.kr';
const LIST = `${BASE}/busan/specmun/list?bbsNo=1&srchSttus=`;

export function parseList(html) {
  const cards = [];
  const list = html.slice(html.indexOf('boardExhGallery'));
  for (const block of list.split('<span class="egImg">').slice(1)) {
    const dataNo = /f_movePage\('[^']*','\d+','(\d+)'\)/.exec(block)?.[1];
    const title = cleanText(/<p class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1] || '');
    const period = /<dt>기간<\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(block)?.[1] || '';
    const venue = cleanText(/<dt>장소<\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(block)?.[1] || '');
    const img = /<img src="([^"]+)"/.exec(block)?.[1] || '';
    if (!dataNo || !title) continue;
    const { startDate, endDate } = parseDateRange(cleanText(period.replace(/<!--[\s\S]*?-->/g, '')));
    cards.push({
      museumId: 'busan-museum',
      title,
      startDate,
      endDate,
      venue,
      posterUrl: img ? new URL(img.replace(/&amp;/g, '&'), BASE).href : '',
      posterReferer: `${BASE}/`,
      officialUrl: `${BASE}/busan/specmun/view?bbsNo=1&dataNo=${dataNo}`,
      sourceId: dataNo,
    });
  }
  return cards;
}

export default {
  key: 'busanmuseum',
  label: '부산박물관',
  homepage: `${BASE}/busan/index`,
  museums: ['busan-museum'],

  async fetch({ log }) {
    const cards = [];
    for (const [status, label] of [['ING', '진행'], ['YET', '예정']]) {
      const found = parseList(await getHtml(LIST + status, { referer: `${BASE}/` }));
      log(`    ✓ ${label} → ${found.length}건`);
      cards.push(...found);
    }
    return cards;
  },
};
