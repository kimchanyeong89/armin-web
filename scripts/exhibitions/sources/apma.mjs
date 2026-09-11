/**
 * 아모레퍼시픽미술관 (APMA)
 * 포스터는 image-apma.amorepacific.com CDN 에서 제공된다.
 */

import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://apma.amorepacific.com';

export default {
  key: 'apma',
  label: '아모레퍼시픽미술관',
  homepage: BASE,
  museums: ['apma'],

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/contents/exhibition/index.do`,
        `${BASE}/kor/exhibition/exhibitionList.do`,
        `${BASE}/exhibition`,
        `${BASE}/kor/exhibition`,
        `${BASE}/contents/exhibition/list.do`,
        `${BASE}/`,
      ],
      (html, url) => genericParse(html, url),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'apma',
      posterReferer: `${BASE}/`,
      officialUrl: c.officialUrl || `${BASE}/kor/exhibition/current-exhibition.do`,
    }));
  },
};
