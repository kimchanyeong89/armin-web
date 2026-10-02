/**
 * 부산시립미술관 — 현재·예정 전시 목록(listNowClient / listFutureClient)을 직접 파싱한다.
 * 상세 페이지에는 포스터가 없고, 목록의 그림은 가로 배너(약 785×356)라 그것을 쓴다.
 * 파일 이름에 한글·괄호가 들어 있어 주소를 인코딩해 둔다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://art.busan.go.kr';
const LISTS = [
  ['listNowClient.nm', 'viewNowClient.nm'],
  ['listFutureClient.nm', 'viewFutureClient.nm'],
];

export function parseList(html) {
  const cards = [];
  const list = html.slice(html.indexOf('listTypeG'));
  for (const block of list.split('<li>').slice(1)) {
    const href = /<a href="([^"]*view\w+Client\.nm\?id=(\d+))"/.exec(block);
    const title = cleanText(/<span class="tit"><a[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1] || '');
    const period = /<span class="date">([\s\S]*?)<\/span>/.exec(block)?.[1] || '';
    const img = /<img src="([^"]+)"/.exec(block)?.[1] || '';
    if (!href || !title) continue;
    const { startDate, endDate } = parseDateRange(cleanText(period));
    // 이우환 공간 같은 상설 전시는 종료일을 2099-12-31 로 적어 둔다
    if (/상설/.test(title) || endDate >= '2090-01-01') continue;
    cards.push({
      museumId: 'busan-museum-art',
      title,
      startDate,
      endDate,
      posterUrl: img ? new URL(img, BASE).href : '',
      posterReferer: `${BASE}/`,
      officialUrl: new URL(href[1], BASE).href,
      sourceId: href[2],
    });
  }
  return cards;
}

export default {
  key: 'busanart',
  label: '부산시립미술관',
  homepage: BASE,
  museums: ['busan-museum-art'],

  async fetch({ log }) {
    const cards = [];
    for (const [list] of LISTS) {
      const found = parseList(await getHtml(`${BASE}/tblTsite07Display/${list}`, { referer: `${BASE}/` }));
      log(`    ✓ ${list} → ${found.length}건`);
      cards.push(...found);
    }
    return cards;
  },
};
