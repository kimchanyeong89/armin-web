/**
 * 부산현대미술관 — 현재·예정 전시 목록(/moca/exhibition01, 02)을 직접 파싱한다.
 * 끝이 '상설'인 항목은 상설 설치작(패트릭 블랑 수직정원 등)이라 뺀다.
 * 목록 그림은 300px 축소본(thumbTy=M)이라 원본(thumbTy 없음)을 쓴다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://www.busan.go.kr';

export function parseList(html) {
  const cards = [];
  const list = html.slice(html.indexOf('thumbListType1'));
  for (const block of list.split('<li>').slice(1)) {
    const href = /<a href="(\/moca\/exhibition0[12]\/(\d+))"/.exec(block);
    const title = cleanText(/<strong class="tit">([\s\S]*?)<\/strong>/.exec(block)?.[1] || '');
    const period = /<span class="date">([\s\S]*?)<\/span>/.exec(block)?.[1] || '';
    const img = /<img src="([^"]+)"/.exec(block)?.[1] || '';
    if (!href || !title) continue;
    const { startDate, endDate, openEnded } = parseDateRange(cleanText(period));
    if (openEnded) continue;
    cards.push({
      museumId: 'moca-busan',
      title,
      startDate,
      endDate,
      posterUrl: img ? new URL(img.replace(/&amp;/g, '&').replace(/&thumbTy=\w+/, ''), BASE).href : '',
      posterReferer: `${BASE}/moca/`,
      officialUrl: new URL(href[1], BASE).href,
      sourceId: href[2],
    });
  }
  return cards;
}

export default {
  key: 'mocabusan',
  label: '부산현대미술관',
  homepage: `${BASE}/moca/index`,
  museums: ['moca-busan'],

  async fetch({ log }) {
    const cards = [];
    for (const page of ['exhibition01', 'exhibition02']) {
      const found = parseList(await getHtml(`${BASE}/moca/${page}`, { referer: `${BASE}/moca/` }));
      log(`    ✓ ${page} → ${found.length}건 (상설 제외)`);
      cards.push(...found);
    }
    return cards;
  },
};
