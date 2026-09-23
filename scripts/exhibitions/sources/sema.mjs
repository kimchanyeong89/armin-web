/**
 * 서울시립미술관 (SeMA) — 서소문본관·북서울·남서울·서서울·사진미술관·미술아카이브 등 분관 전체
 *
 * '전시와 프로그램' 목록(/kr/whatson/landing?whatsonMenuDivList=EX)을 쪽마다 읽고,
 * 기간은 전시 상세 페이지 머리글("《오윤》<br> 20260827-20270214")에서 가져온다.
 * 이미지는 imgFileView 에 thumbYn=N 을 붙이면 원본이 나온다 (없으면 1000px 축소본).
 * 옛 목록 주소(/kr/whatson/exhibition/list 등)는 HTTP 500 을 준다.
 *
 * 목록에는 SeMA 가 지원·협력하는 외부 전시(신진미술인 지원, 자치구 협력, 순회전)도 섞여 있다.
 * 목록 카드에 '서울시립…' 장소가 없는 전시는 SeMA 밖에서 열리므로 제외한다.
 */

import { introText } from '../lib/extract.mjs';
import { getHtml } from '../lib/http.mjs';
import { cleanText, stripTags } from '../lib/parse.mjs';

const BASE = 'https://sema.seoul.go.kr';
const LANDING = `${BASE}/kr/whatson/landing?whatsonMenuDivList=EX&whenType=ALL_DAY`;
const MAX_PAGES = 6;

/** 목록 쪽에서 전시 카드(번호·이미지 id·장소)를 뽑는다. */
export function parseLanding(html) {
  const items = [];
  for (const block of html.split(/(?=<div id="dv_\d+")/).slice(1)) {
    if (!/data-whatson-menu-div="EX"/.test(block)) continue;
    const exNo = /data-idx="(\d+)"/.exec(block)?.[1];
    const fileId = /imgFileView\?(?:[^"']*&)?FILE_ID=(\d+)/.exec(block)?.[1] || '';
    const place = /전시\s+(서울시립[^,<]+)/.exec(stripTags(block))?.[1]?.trim() || '';
    if (exNo) items.push({ exNo, fileId, place });
  }
  return items;
}

/** 상세 페이지 머리글에서 제목과 기간을 읽는다. */
export function parseDetailHeader(html) {
  const head = /class="[^"]*\bo_h1\b[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] || '';
  const period = /(\d{4})(\d{2})(\d{2})\s*-\s*(\d{4})(\d{2})(\d{2})/.exec(stripTags(head));
  const title = head
    .split(/<br[^>]*>/i)
    .map((part) => cleanText(part))
    .find((part) => part && part !== '전시와 프로그램' && !/^\d{8}/.test(part));
  return {
    // 제목 전체가 《》로 싸여 있으면 벗긴다 (앞에 붙은 시리즈명이 있으면 그대로 둔다)
    title: (title || '').replace(/^《(.+)》$/, '$1'),
    startDate: period ? `${period[1]}-${period[2]}-${period[3]}` : '',
    endDate: period ? `${period[4]}-${period[5]}-${period[6]}` : '',
  };
}

/** 상세 페이지 '전시 안내' 본문에서 소개문을 뽑는다. 앞머리의 제목·일정·운영 안내 문단은 건너뛴다. */
export function parseDetailIntro(html) {
  return introText(/<div class="o_textmore[^"]*">([\s\S]*?)<\/div>/.exec(html)?.[1] || '');
}

export default {
  key: 'sema',
  label: '서울시립미술관',
  homepage: BASE,
  museums: ['seoul-museum-of-art'],

  async fetch({ log }) {
    const seen = new Map();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const items = parseLanding(await getHtml(`${LANDING}&currentPage=${page}`, { referer: `${BASE}/` }));
      const fresh = items.filter((item) => !seen.has(item.exNo));
      if (!fresh.length) break;
      for (const item of fresh) seen.set(item.exNo, item);
    }
    const inHouse = [...seen.values()].filter((item) => item.place);
    log(`    ✓ 목록 ${seen.size}건 중 SeMA 전시관 전시 ${inHouse.length}건`);

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cards = [];
    for (const item of inHouse) {
      const officialUrl = `${BASE}/kr/whatson/exhibition/detail?exNo=${item.exNo}`;
      let html;
      try {
        html = await getHtml(officialUrl, { referer: LANDING, retries: 1 });
      } catch (err) {
        log(`    · 상세 페이지 실패 ${item.exNo}: ${err.message}`);
        continue;
      }
      const { title, startDate, endDate } = parseDetailHeader(html);
      // 끝난 전시와 기한 없는 상설 전시(야외조각 등)는 뺀다
      if (!title || !startDate || (endDate && endDate < today) || endDate >= '2090') continue;
      const original = item.fileId ? `${BASE}/common/imgFileView?thumbYn=N&FILE_ID=${item.fileId}` : '';
      cards.push({
        museumId: 'seoul-museum-of-art',
        title,
        description: parseDetailIntro(html),
        venue: item.place.replace(/^서울시립(?:미술관)?\s*/, ''),
        startDate,
        endDate,
        posterUrl: original,
        posterCandidates: item.fileId ? [`${BASE}/common/imgFileView?FILE_ID=${item.fileId}`] : [],
        posterReferer: `${BASE}/`,
        officialUrl,
        sourceId: item.exNo,
      });
    }
    return cards;
  },
};
