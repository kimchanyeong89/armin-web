/**
 * 한국만화박물관 (부천, 한국만화영상진흥원) — 기획전시 목록(plan.asp)을 직접 파싱한다.
 * '예정전시' 탭은 사이트에서 막혀 있어 전체 목록 첫 쪽에서 끝나지 않은 전시를 쓴다.
 * 목록 그림은 280×140 축소본(_thumb)이라 _thumb 을 뗀 원본(가로형 대표 그림)을 쓴다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange, todayKST } from '../lib/parse.mjs';

const BASE = 'https://www.komacon.kr';
const LIST = `${BASE}/comicsmuseum/show/plan.asp?mode=1`;

export function parseList(html, today = todayKST()) {
  const cards = [];
  const list = html.slice(html.indexOf('show2_list'));
  for (const block of list.split('<div class="show_img">').slice(1)) {
    const no = /plan_view\.asp\?eh_no=(\d+)/.exec(block)?.[1];
    const title = cleanText(/<p class="show_subject">[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(block)?.[1] || '');
    const period = /전시기간\s*:<\/span>([\s\S]*?)<\/li>/.exec(block)?.[1] || '';
    const venue = cleanText(/전시장소\s*:<\/span>([\s\S]*?)<\/li>/.exec(block)?.[1] || '');
    const img = /<img src="(\/upfiles\/exhibit\/[^"]+)"/.exec(block)?.[1] || '';
    if (!no || !title) continue;
    const { startDate, endDate } = parseDateRange(cleanText(period));
    if (endDate && endDate < today) continue;
    cards.push({
      museumId: 'korea-manhwa',
      title,
      startDate,
      endDate,
      venue,
      posterUrl: img ? new URL(img.replace(/_thumb(\.\w+)$/i, '$1'), BASE).href : '',
      posterReferer: `${BASE}/`,
      officialUrl: `${BASE}/comicsmuseum/show/plan_view.asp?eh_no=${no}`,
      sourceId: no,
    });
  }
  return cards;
}

export default {
  key: 'komacon',
  label: '한국만화박물관',
  homepage: `${BASE}/museum/`,
  museums: ['korea-manhwa'],

  async fetch({ log }) {
    const cards = parseList(await getHtml(LIST, { referer: `${BASE}/` }));
    log(`    ✓ 기획전시 → ${cards.length}건 (끝난 전시 제외)`);
    return cards;
  },
};
