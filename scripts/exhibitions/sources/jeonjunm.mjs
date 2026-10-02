/**
 * 국립전주박물관 — 진행·예정 전시 목록(menu.es?mid=a10201010000)을 직접 파싱한다.
 * 목록 그림은 m_ 이 붙은 축소본(400px)이라 m_ 를 뗀 원본을 쓴다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://jeonju.museum.go.kr';

export function parseList(html) {
  const cards = [];
  const list = html.slice(html.indexOf('edu_wrap'));
  for (const block of list.split('<div class="edu_info">').slice(1)) {
    const href = /<h3 class="title"><a href="([^"]+)"/.exec(block)?.[1] || '';
    const title = cleanText(/<h3 class="title"><a[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1] || '');
    const seq = /seq=(\d+)/.exec(href)?.[1];
    const period = /<dt>전시기간<\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(block)?.[1] || '';
    const venue = cleanText(/<dt>전시장소<\/dt>\s*<dd>([\s\S]*?)<\/dd>/.exec(block)?.[1] || '');
    const img = /<img src="([^"]+)"/.exec(block)?.[1] || '';
    if (!seq || !title) continue;
    const { startDate, endDate } = parseDateRange(cleanText(period));
    cards.push({
      museumId: 'jeonju-national-museum',
      title,
      startDate,
      endDate,
      venue,
      posterUrl: img ? new URL(img.replace(/\/m_([^/]+)$/, '/$1'), BASE).href : '',
      posterReferer: `${BASE}/`,
      officialUrl: new URL(href.replace(/&amp;/g, '&'), BASE).href,
      sourceId: seq,
    });
  }
  return cards;
}

export default {
  key: 'jeonjunm',
  label: '국립전주박물관',
  homepage: BASE,
  museums: ['jeonju-national-museum'],

  async fetch({ log }) {
    const cards = parseList(await getHtml(`${BASE}/menu.es?mid=a10201010000`, { referer: `${BASE}/` }));
    log(`    ✓ 진행·예정 → ${cards.length}건`);
    return cards;
  },
};
