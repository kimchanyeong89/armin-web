/**
 * 국립현대미술관 (MMCA) — 서울관 / 과천관
 *
 * 한 목록에 서울·과천·덕수궁·청주 전시가 섞여 나오므로 전시관을 판별해
 * exhibitions.js 의 mmca-seoul / mmca-gwacheon 으로 나눠 담는다.
 * 덕수궁관은 별도 블록이 없어 서울(mmca-seoul)로 합친다. 청주관은 수도권 밖이라 제외.
 *
 * 목록 페이지는 200 을 주면서도 전시 항목이 비어 있다(AJAX 렌더링).
 * 그래서 JSON 엔드포인트를 먼저 치고, 실패하면 HTML 파싱으로 넘어간다.
 */

import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate, stripTags } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.mmca.go.kr';

/** 전시관 이름에서 대상 미술관을 정한다. */
function routeVenue(text) {
  if (/과천/.test(text)) return { museumId: 'mmca-gwacheon', venue: '과천관' };
  if (/덕수궁/.test(text)) return { museumId: 'mmca-seoul', venue: '덕수궁관' };
  if (/청주/.test(text)) return { museumId: null, venue: '청주관' }; // 수도권 밖
  if (/서울/.test(text)) return { museumId: 'mmca-seoul', venue: '서울관' };
  return { museumId: 'mmca-seoul', venue: '' }; // 판별 실패 시 서울관으로
}

/** AJAX 응답 한 건을 카드로 정규화한다. */
function fromApi(item) {
  const title = cleanText(item.exhNm || item.EXHBT_NM || item.title || '');
  if (!title) return null;
  const venueName = cleanText(item.cntrNm || item.CNTR_NM || item.museumNm || '');
  const { museumId, venue } = routeVenue(venueName);
  if (!museumId) return null;

  const img = item.listImgPath || item.LIST_IMG || item.thumbImgPath || item.imgPath || '';
  const id = String(item.exhId || item.EXHBT_ID || item.id || '');

  return {
    museumId,
    venue: venue || venueName,
    title,
    titleEn: cleanText(item.exhNmEn || item.engNm || ''),
    description: cleanText(item.exhCont || item.summary || '', 400),
    startDate: normalizeDate(item.startDt || item.BEGIN_DE || ''),
    endDate: normalizeDate(item.endDt || item.END_DE || ''),
    posterUrl: img ? (img.startsWith('http') ? img : `${BASE}${img}`) : '',
    posterReferer: `${BASE}/`,
    officialUrl: id ? `${BASE}/exhibitions/progressList.do?exhId=${id}` : `${BASE}/exhibitions/progressList.do`,
    sourceId: id,
  };
}

export default {
  key: 'mmca',
  label: '국립현대미술관',
  homepage: BASE,
  museums: ['mmca-seoul', 'mmca-gwacheon'],

  async fetch({ log }) {
    // 1) AJAX JSON — 목록 페이지가 실제로 데이터를 받아오는 경로
    for (const url of [
      `${BASE}/exhibitions/ajaxProgressList.do?cp=1`,
      `${BASE}/exhibitions/ajaxProgressList.do`,
      `${BASE}/exhibitions/progressListAjax.do?cp=1`,
    ]) {
      try {
        const data = await getJson(url, { referer: `${BASE}/exhibitions/progressList.do` });
        const items = Array.isArray(data) ? data : data?.list || data?.result || data?.data || [];
        const mapped = items.map(fromApi).filter((c) => c && c.startDate);
        if (mapped.length) {
          log(`    ✓ ${url} → ${mapped.length}건`);
          return mapped;
        }
        log(`    · ${url} → 0건`);
      } catch (err) {
        log(`    · ${url} → ${err.message}`);
      }
    }

    // 2) HTML 폴백
    const { cards } = await tryUrls(
      [
        `${BASE}/exhibitions/progressList.do`,
        `${BASE}/exhibitions/progressList.do?exhiStatus=1`,
        `${BASE}/exhibitions/pastList.do?cp=1`,
      ],
      (html, url) =>
        genericParse(html, url, {
          blockPatterns: [
            '<li[^>]*class="[^"]*(?:exhibition|exhbt|item)[^"]*"',
            '<div[^>]*class="[^"]*(?:exhibition|exhbt|item|card)[^"]*"',
            '<li[^>]*>',
          ],
        }),
      { referer: `${BASE}/`, log }
    );

    const out = [];
    for (const card of cards) {
      const { museumId, venue } = routeVenue(stripTags(card.raw || '') + ' ' + (card.officialUrl || ''));
      if (!museumId) continue;
      out.push({
        ...card,
        museumId,
        venue,
        posterReferer: `${BASE}/`,
        officialUrl: card.officialUrl || `${BASE}/exhibitions/progressList.do`,
      });
    }
    return out;
  },
};
