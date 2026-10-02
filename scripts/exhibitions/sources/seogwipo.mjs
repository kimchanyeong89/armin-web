/**
 * 서귀포시 공립미술관 — 이중섭미술관 · 기당미술관 · 소암기념관 (culture.seogwipo.go.kr).
 *
 * 세 곳 다 '현재·다음 전시' 쪽이 제주도 누리집과 같은 계열의 게시판이라 jejugo 의 parseExList 를 쓴다.
 * 다만 이중섭미술관 '현재전시'는 게시판이 아니라 전시 하나를 소개하는 글이라, 글 안의
 * '전시명 :' '전시기간 :' 줄과 본문 첫 그림을 읽는다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';
import { parseExList } from './jejugo.mjs';

const BASE = 'https://culture.seogwipo.go.kr';
const PAGES = [
  { museumId: 'lee-jung-seop-museum', path: '/jslee/show/current.htm', label: '이중섭미술관 현재' },
  { museumId: 'lee-jung-seop-museum', path: '/jslee/show/next.htm', label: '이중섭미술관 다음' },
  { museumId: 'gidang-art-museum', path: '/gidang/show/current.htm', label: '기당미술관 현재' },
  { museumId: 'gidang-art-museum', path: '/gidang/show/next.htm', label: '기당미술관 다음' },
  { museumId: 'soam-memorial-hall', path: '/soam/show/event.htm', label: '소암기념관 현재' },
];

/** 게시판이 아닌 소개 글 한 편에서 전시 하나를 읽는다. */
export function parseArticle(html, { museumId, url }) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const title = cleanText(/전시명\s*:\s*([^\n❍]+?)\s{2,}/.exec(text)?.[1] || '');
  const period = /전시기간\s*:\s*([^❍]+?)\s{2,}/.exec(text)?.[1] || '';
  if (!title || !period) return [];
  const { startDate, endDate } = parseDateRange(cleanText(period));
  if (!startDate) return [];
  const img = /<img[^>]+src="(\/files\/editor\/[^"]+)"/.exec(html)?.[1] || '';
  return [{
    museumId,
    title,
    startDate,
    endDate,
    posterUrl: img ? new URL(img, BASE).href : '',
    posterReferer: `${BASE}/`,
    officialUrl: url,
    sourceId: `${museumId}:${startDate}:${title}`,
  }];
}

export default {
  key: 'seogwipo',
  label: '서귀포시 공립미술관',
  homepage: BASE,
  museums: ['lee-jung-seop-museum', 'gidang-art-museum', 'soam-memorial-hall'],

  async fetch({ log }) {
    const cards = [];
    for (const page of PAGES) {
      const url = BASE + page.path;
      const html = await getHtml(url, { referer: `${BASE}/` });
      let found = parseExList(html, { museumId: page.museumId, list: url, base: BASE, thumb: false });
      if (!found.length && !html.includes('<div class="list ex ')) found = parseArticle(html, { museumId: page.museumId, url });
      log(`    ✓ ${page.label} → ${found.length}건`);
      cards.push(...found);
    }
    return cards;
  },
};
