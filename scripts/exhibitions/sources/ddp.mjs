/**
 * 동대문디자인플라자 (DDP)
 */

import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.ddp.or.kr';

export default {
  key: 'ddp',
  label: '동대문디자인플라자',
  homepage: BASE,
  museums: ['ddp-gallery'],

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
      officialUrl: c.officialUrl || `${BASE}/index.html?menuno=240`,
    }));
  },
};
