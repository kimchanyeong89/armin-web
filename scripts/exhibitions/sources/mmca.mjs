/**
 * 국립현대미술관 (MMCA) — 서울관·덕수궁관 → mmca-seoul, 과천관 → mmca-gwacheon
 * 청주관은 수도권 밖이라 제외한다.
 *
 * 목록 페이지는 AJAX(/exhibitions/AjaxExhibitionList.do)로 전시를 불러온다.
 * exhFlag=1 이 현재 전시, 2 가 예정 전시다. 응답에 전시관·기간·요약·이미지가 모두 있다.
 */

import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate } from '../lib/parse.mjs';

const BASE = 'https://www.mmca.go.kr';
const LISTS = [
  { exhFlag: 1, page: 'progressList.do' },
  { exhFlag: 2, page: 'futureProgressList.do' },
];

/** 전시관 이름에서 대상 미술관을 정한다. */
function routeVenue(place) {
  if (/과천/.test(place)) return { museumId: 'mmca-gwacheon', venue: '과천관' };
  if (/덕수궁/.test(place)) return { museumId: 'mmca-seoul', venue: '덕수궁관' };
  if (/서울/.test(place)) return { museumId: 'mmca-seoul', venue: '서울관' };
  return { museumId: null, venue: place }; // 청주관 등
}

const absolute = (path) => (!path ? '' : path.startsWith('http') ? path : `${BASE}${path}`);

/** AJAX 응답 한 건을 카드로 바꾼다. 대상 밖 전시관이면 null. */
function fromApi(item, exhFlag) {
  const { museumId, venue } = routeVenue(cleanText(item.exhPlaNm || ''));
  const title = cleanText(item.exhTitle || '');
  // 상설전(소장품 상설 전시)은 기획전 목록에 넣지 않는다 (리움·호암도 같은 기준)
  if (!museumId || !title || /상설전/.test(title)) return null;
  const did = absolute(item.exhDidImg);
  const thumb = absolute(item.exhThumbImg);
  return {
    museumId,
    venue,
    title,
    description: cleanText(item.exhContentsSumm || '', 400),
    startDate: normalizeDate(item.exhStDt),
    endDate: normalizeDate(item.exhEdDt),
    posterUrl: did || thumb,
    posterCandidates: thumb ? [thumb] : [],
    posterReferer: `${BASE}/`,
    officialUrl: `${BASE}/exhibitions/exhibitionsDetail.do?exhFlag=${exhFlag}&exhId=${item.exhId}`,
    sourceId: String(item.exhId),
  };
}

export default {
  key: 'mmca',
  label: '국립현대미술관',
  homepage: BASE,
  museums: ['mmca-seoul', 'mmca-gwacheon'],

  async fetch({ log }) {
    const out = [];
    for (const { exhFlag, page } of LISTS) {
      let count = 0;
      for (let pageIndex = 1; pageIndex <= 10; pageIndex++) {
        const data = await getJson(
          `${BASE}/exhibitions/AjaxExhibitionList.do?exhFlag=${exhFlag}&searchExhPlaCd=&searchExhCd=&sort=1&pageIndex=${pageIndex}`,
          { referer: `${BASE}/exhibitions/${page}` }
        );
        const list = data?.exhibitionsList || [];
        const cards = list.map((item) => fromApi(item, exhFlag)).filter(Boolean);
        out.push(...cards);
        count += cards.length;
        const total = Number(data?.paginationInfo?.totalRecordCount || 0);
        const perPage = Number(data?.paginationInfo?.recordCountPerPage || list.length || 1);
        if (!list.length || pageIndex * perPage >= total) break;
      }
      log(`    ✓ exhFlag=${exhFlag} → ${count}건`);
    }
    return out.filter((c) => c.startDate);
  },
};
