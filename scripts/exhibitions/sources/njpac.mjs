/**
 * 백남준아트센터 (경기문화재단 운영, 용인)
 */

import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://njp.ggcf.kr';

export default {
  key: 'njpac',
  label: '백남준아트센터',
  homepage: BASE,
  museums: ['njpac'],

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
      officialUrl: c.officialUrl || `${BASE}/exhibitions`,
    }));
  },
};
