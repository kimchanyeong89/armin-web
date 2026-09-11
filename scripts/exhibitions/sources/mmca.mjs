/**
 * 국립현대미술관 (MMCA) — 서울관 / 과천관
 *
 * 한 목록에 서울·과천·덕수궁·청주 전시가 섞여 나오므로 전시관을 판별해
 * exhibitions.js 의 mmca-seoul / mmca-gwacheon 으로 나눠 담는다.
 * 덕수궁관은 별도 블록이 없어 서울(mmca-seoul)로 합친다. 청주관은 수도권 밖이라 제외.
 */

import { stripTags } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.mmca.go.kr';

/** 카드 텍스트에서 전시관을 판별한다. */
function venueOf(card) {
  const text = stripTags(card.raw || '') + ' ' + (card.officialUrl || '');
  if (/과천/.test(text)) return { museumId: 'mmca-gwacheon', venue: '과천관' };
  if (/덕수궁/.test(text)) return { museumId: 'mmca-seoul', venue: '덕수궁관' };
  if (/청주/.test(text)) return { museumId: null, venue: '청주관' }; // 수도권 밖
  if (/서울/.test(text)) return { museumId: 'mmca-seoul', venue: '서울관' };
  return { museumId: 'mmca-seoul', venue: '' }; // 판별 실패 시 서울관으로
}

export default {
  key: 'mmca',
  label: '국립현대미술관',
  homepage: BASE,
  museums: ['mmca-seoul', 'mmca-gwacheon'],

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/exhibitions/progressList.do`,
        `${BASE}/exhibitions/progressList.do?exhiStatus=1`,
        `${BASE}/exhibitions/exhibitionsList.do`,
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
      const { museumId, venue } = venueOf(card);
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
