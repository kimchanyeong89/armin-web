/**
 * 국립광주박물관 — 현재·예정 특별전시 목록(s/new/list.do)을 직접 파싱한다.
 * 목록 카드에 제목·기간·장소·포스터(kind=920, 약 600×900)·소개가 다 있다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://gwangju.museum.go.kr';
const LIST = `${BASE}/prog/specialDisplay/kor/sub02_02/s/new`;

export function parseList(html) {
  const cards = [];
  for (const block of html.split('<div class="col">').slice(1)) {
    const id = /fn_search_view\('(\d+)'\)/.exec(block)?.[1];
    const title = cleanText(/<strong class="tit">([\s\S]*?)<\/strong>/.exec(block)?.[1] || '');
    const period = /<b>기간<\/b>([\s\S]*?)<\/li>/.exec(block)?.[1] || '';
    const venue = cleanText(/<b>장소<\/b>([\s\S]*?)<\/li>/.exec(block)?.[1] || '');
    const img = /<img[^>]+src="([^"]*getImage\.do[^"]*)"/.exec(block)?.[1] || '';
    const description = cleanText(/<li class="cont">\s*<b>내용<\/b>([\s\S]*?)<\/li>/.exec(block)?.[1] || '', 400);
    if (!id || !title) continue;
    const { startDate, endDate } = parseDateRange(cleanText(period));
    cards.push({
      museumId: 'gwangju-national-museum',
      title,
      startDate,
      endDate,
      venue,
      description,
      posterUrl: img ? new URL(img.replace(/&amp;/g, '&'), BASE).href : '',
      posterReferer: `${BASE}/`,
      officialUrl: `${LIST}/view.do?cntNo=${id}`,
      sourceId: id,
    });
  }
  return cards;
}

export default {
  key: 'gwangjunm',
  label: '국립광주박물관',
  homepage: BASE,
  museums: ['gwangju-national-museum'],

  async fetch({ log }) {
    const cards = parseList(await getHtml(`${LIST}/list.do`, { referer: `${BASE}/` }));
    log(`    ✓ 현재·예정 → ${cards.length}건`);
    return cards;
  },
};
