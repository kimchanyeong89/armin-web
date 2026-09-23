/**
 * 백남준아트센터 (경기문화재단 운영, 용인)
 */

import { introText } from '../lib/extract.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://njp.ggcf.kr';

/**
 * 목록 카드에서 상세 페이지 주소를 찾는다.
 * 썸네일 링크(href=/exhibitions/243)는 따옴표가 없어 firstLink 가 건너뛰고 분류 링크(?tag=전시)를 잡는다.
 */
export function detailUrl(block = '') {
  const id = /\/exhibitions\/(\d+)/.exec(block)?.[1];
  return id ? `${BASE}/exhibitions/${id}` : '';
}

/** 상세 페이지 본문(div.contents)에서 소개문을 뽑는다 (sync.mjs 상세 보강 단계가 부른다). */
export function describeDetail(html) {
  return introText(/<div class="contents">([\s\S]*?)<div class="sub-contents">/.exec(html)?.[1] || '');
}

export default {
  key: 'njpac',
  label: '백남준아트센터',
  homepage: BASE,
  museums: ['njpac'],
  describe: describeDetail,

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/exhibitions/current`,
        `${BASE}/exhibitions`,
        'https://njpart.ggcf.kr/exhibitions',
      ],
      (html, url) => genericParse(html, url),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'njpac',
      posterReferer: `${BASE}/`,
      officialUrl: detailUrl(c.raw) || c.officialUrl || `${BASE}/exhibitions`,
    }));
  },
};
