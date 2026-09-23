/**
 * 국립민속박물관 (NFM) — 서울 본관 기획전시만 담는다 (파주관·어린이박물관 제외)
 *
 * 현재 전시 목록(selectPlanExhibitionNList.do?planExhibitionGbn=HOME)이 서버에서 그려진다.
 * 카드의 배경 이미지(background-image)가 포스터다.
 * 첫 연결이 가끔 끊기는 사이트라 http.mjs 의 재시도에 기댄다.
 */

import { getHtml } from '../lib/http.mjs';
import { absoluteUrl, cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://www.nfm.go.kr';
const PATH = `${BASE}/user/planexhibition/home/20`;
const LIST = `${PATH}/selectPlanExhibitionNList.do?planExhibitionGbn=HOME`;

const field = (item, cls) => cleanText(new RegExp(`<div class="${cls}[^"]*">([\\s\\S]*?)</div>`).exec(item)?.[1] || '');

/** 목록 HTML 에서 카드를 뽑는다. 카드 하나가 <li class="thumb_item"> 이다. */
export function parseList(html) {
  const cards = [];
  for (const item of html.match(/<li class="thumb_item">[\s\S]*?<\/li>/g) || []) {
    const idx = /planExhibitionIdx=(\d+)/.exec(item)?.[1];
    const title = field(item, 'item_title');
    if (!idx || !title) continue;
    const { startDate, endDate } = parseDateRange(field(item, 'item_date').replace(/^기간\s*:\s*/, ''));
    const place = field(item, 'item_loca').replace(/^장소\s*:\s*/, '');
    const image = /background-image:\s*url\(([^)]+)\)/.exec(item)?.[1]?.replace(/['"]/g, '') || '';
    cards.push({
      museumId: 'folk-museum',
      title,
      startDate,
      endDate,
      venue: place.replace(/^국립민속박물관\s*/, ''),
      posterUrl: absoluteUrl(image, BASE),
      posterReferer: `${BASE}/`,
      officialUrl: `${PATH}/selectPlanExhibitionNView.do?planExhibitionIdx=${idx}`,
      sourceId: idx,
    });
  }
  return cards;
}

export default {
  key: 'nfm',
  label: '국립민속박물관',
  homepage: BASE,
  museums: ['folk-museum'],

  async fetch({ log }) {
    const cards = parseList(await getHtml(LIST, { referer: `${BASE}/`, timeout: 15000 }));
    log(`    ✓ 현재 전시 목록 → ${cards.length}건`);
    return cards.filter((c) => c.startDate);
  },
};
