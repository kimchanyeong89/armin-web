/**
 * 제주도립미술관 · 제주현대미술관 — 둘 다 제주특별자치도 누리집(www.jeju.go.kr) 안의 같은 전시 게시판이다.
 *
 * 목록 한 쪽에 예정(READY)·진행(ING)·종료(END)가 이 순서로 섞여 나오므로 첫 쪽에서 READY·ING 만 쓴다.
 * 포스터 원본은 4000px·10MB 를 넘기도 해서, 게시판이 만들어 두는 축소본(_t, 약 500×680)을 쓴다.
 * 서귀포시 공립미술관(culture.seogwipo.go.kr)도 같은 계열의 게시판이라 parseExList 를 같이 쓴다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://www.jeju.go.kr';
const SITES = [
  { museumId: 'jeju-museum-art', list: `${BASE}/jmoa/show/current.htm`, label: '제주도립미술관' },
  { museumId: 'jeju-contemporary-art-museum', list: `${BASE}/jejumuseum/shows/current.htm`, label: '제주현대미술관' },
];

const field = (block, name) =>
  cleanText(
    new RegExp(`<strong>${name}<\\/strong>\\s*<span>([\\s\\S]*?)<\\/span>`).exec(block)?.[1] ||
      new RegExp(`${name}\\s*:\\s*([^<]+)<`).exec(block)?.[1] ||
      ''
  );

/**
 * '<div class="list ex … READY|ING|END"' 로 시작하는 카드들. 진행·예정만 돌려준다.
 * @param {string} html
 * @param {{museumId:string, list:string, base:string, thumb?:boolean}} site
 */
export function parseExList(html, { museumId, list, base, thumb = true }) {
  const cards = [];
  for (const part of html.split('<div class="list ex ').slice(1)) {
    const status = /^[^"]*?\b(READY|ING|END)\b/.exec(part)?.[1];
    if (status !== 'READY' && status !== 'ING') continue;
    const block = part;
    const titleHtml = /<p class="title ex-title">([\s\S]*?)<\/p>/.exec(block)?.[1] || '';
    const title = cleanText(titleHtml.replace(/<span class="label[\s\S]*?<\/span>/g, ''));
    const seq = /[?&;]seq=(\d+)/.exec(block)?.[1] || /data-seq="(\d+)"/.exec(block)?.[1];
    if (!title || !seq) continue;
    const { startDate, endDate } = parseDateRange(field(block, '일시'));
    const img = /<img src="(\/files\/exhibition\/[^"]+)"/.exec(block)?.[1] ||
      /background-image:\s*url\(\s*'?([^')]+?)'?\s*\)/.exec(block)?.[1] || '';
    const poster = img && thumb ? img.replace(/(\.\w+)$/, '_t$1') : img;
    const href = /href="\s*([^"]*\bact=view[^"]*?)\s*"/.exec(block)?.[1];
    cards.push({
      museumId,
      title,
      startDate,
      endDate,
      venue: field(block, '장소').replace(/\s*\|\s*/g, ', '),
      posterUrl: poster ? new URL(poster.trim(), base).href : '',
      posterReferer: `${base}/`,
      // 목록에는 iframe 용 꼬리표(_layout·_view)가 붙은 주소가 먼저 나온다
      officialUrl: href
        ? new URL(href.replace(/&amp;/g, '&').replace(/;jsessionid=[^?]*/, '').replace(/&_(layout|view)=[^&]*/g, ''), base).href
        : `${list}?act=view&seq=${seq}`,
      sourceId: seq,
    });
  }
  return cards;
}

export default {
  key: 'jejugo',
  label: '제주도립미술관 · 제주현대미술관',
  homepage: BASE,
  museums: SITES.map((s) => s.museumId),

  async fetch({ log }) {
    const cards = [];
    for (const site of SITES) {
      const found = parseExList(await getHtml(site.list, { referer: `${BASE}/` }), { ...site, base: BASE });
      log(`    ✓ ${site.label} → ${found.length}건`);
      cards.push(...found);
    }
    return cards;
  },
};
