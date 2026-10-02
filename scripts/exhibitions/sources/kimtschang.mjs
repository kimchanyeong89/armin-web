/**
 * 제주도립 김창열미술관 — 현재·예정 전시(offExList.do?type=c&menuNum=3100)를 직접 파싱한다.
 * 홈페이지 '온라인 전시관'에서만 여는 전시는 미술관 전시가 아니라서 뺀다.
 * 포스터는 목록의 fileSize=t(약 790×1080)를 쓴다. 상세는 POST 폼이지만 GET(offExDetail.do?idx=)으로도 열린다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://kimtschang-yeul.jeju.go.kr';
const LIST = `${BASE}/offExList.do?type=c&menuNum=3100`;

export function parseList(html) {
  const cards = [];
  for (const block of html.split('<div class="container my-5">').slice(1)) {
    const title = cleanText(/<p class="h3 offEx_ex-title[^"]*">([\s\S]*?)<\/p>/.exec(block)?.[1] || '');
    const titleEn = cleanText(/<p class="h4 offEx_ex-title-en[^"]*">([\s\S]*?)<\/p>/.exec(block)?.[1] || '');
    const period = /전시기간<\/th>\s*<td>([\s\S]*?)<\/td>/.exec(block)?.[1] || '';
    const venue = cleanText(/전시장소<\/th>\s*<td>([\s\S]*?)<\/td>/.exec(block)?.[1] || '');
    const idx = /fn_select\('(\d+)'\)/.exec(block)?.[1];
    const img = /<img src="([^"]+)" class="offEx_img-poster"/.exec(block)?.[1] || '';
    if (!title || !idx || /온라인/.test(venue)) continue;
    const { startDate, endDate } = parseDateRange(cleanText(period));
    cards.push({
      museumId: 'kim-tschang-yeul-art-museum',
      title,
      titleEn,
      startDate,
      endDate,
      venue,
      posterUrl: img ? new URL(img.replace(/&amp;/g, '&'), BASE).href : '',
      posterReferer: `${BASE}/`,
      officialUrl: `${BASE}/offExDetail.do?idx=${idx}&menuNum=3100`,
      sourceId: idx,
    });
  }
  return cards;
}

export default {
  key: 'kimtschang',
  label: '제주도립 김창열미술관',
  homepage: BASE,
  museums: ['kim-tschang-yeul-art-museum'],

  async fetch({ log }) {
    const cards = parseList(await getHtml(LIST, { referer: `${BASE}/` }));
    log(`    ✓ 현재·예정 → ${cards.length}건 (온라인 전시 제외)`);
    return cards;
  },
};
