/**
 * 동대문디자인플라자 (DDP)
 */

import { introText } from '../lib/extract.mjs';
import { absoluteUrl } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.ddp.or.kr';

/**
 * 목록 카드에서 상세 페이지 주소를 찾는다.
 * 카드 링크는 href="#none" + onclick 이라 주소가 없고, 카드마다 붙은 공유 팝업(URL주소 복사)에 들어 있다.
 */
export function detailUrl(block = '') {
  const path = /value="https?:\/\/(?:www\.)?ddp\.or\.kr(\/index\.html\?[^"]*act=view[^"]*)"/.exec(block)?.[1];
  return path ? absoluteUrl(path, BASE) : '';
}

/** 상세 페이지 '개요' 칸에서 소개문을 뽑는다 (sync.mjs 상세 보강 단계가 부른다). */
export function describeDetail(html) {
  return introText(/<div class="detail_cont_each_txt">([\s\S]*?)<\/div>/.exec(html)?.[1] || '');
}

export default {
  key: 'ddp',
  label: '동대문디자인플라자',
  homepage: BASE,
  museums: ['ddp-gallery'],
  describe: describeDetail,

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/index.html?menuno=240`,
        `${BASE}/exhibition`,
        'https://ddp.or.kr/index.html?menuno=240',
      ],
      (html, url) => genericParse(html, url),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'ddp-gallery',
      posterReferer: `${BASE}/`,
      officialUrl: detailUrl(c.raw) || c.officialUrl || `${BASE}/index.html?menuno=240`,
    }));
  },
};
