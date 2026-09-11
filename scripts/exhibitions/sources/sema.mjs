/**
 * 서울시립미술관 (SeMA)
 * 서소문본관·북서울·남서울 등 분관 전시가 함께 나온다. 전부 서울시립미술관 소속이므로
 * 한 미술관(seoul-museum-of-art)에 담고 venue 로 분관을 표기한다.
 */

import { stripTags } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://sema.seoul.go.kr';

const BRANCHES = [
  '서소문본관', '북서울미술관', '남서울미술관', '난지미술창작스튜디오',
  '백남준기념관', '미술아카이브', '사진미술관', '서서울미술관',
];

function branchOf(card) {
  const text = stripTags(card.raw || '');
  return BRANCHES.find((b) => text.includes(b)) || '';
}

export default {
  key: 'sema',
  label: '서울시립미술관',
  homepage: BASE,
  museums: ['seoul-museum-of-art'],

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/kr/whatson/exhibition/list?status=ING`,
        `${BASE}/kr/whatson/exhibition/list`,
        `${BASE}/kr/exhibition/exhibitionList.do`,
      ],
      (html, url) => genericParse(html, url),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'seoul-museum-of-art',
      venue: branchOf(c),
      posterReferer: `${BASE}/`,
      officialUrl: c.officialUrl || `${BASE}/kr/whatson/exhibition/list`,
    }));
  },
};
