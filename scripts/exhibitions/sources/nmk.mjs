/**
 * 국립중앙박물관 (NMK)
 * 현재 전시 목록은 /MUSEUM/contents/ 경로에서 제공된다.
 */

import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.museum.go.kr';

export default {
  key: 'nmk',
  label: '국립중앙박물관',
  homepage: BASE,
  museums: ['national-museum-korea'],

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/MUSEUM/contents/M0202010000.do?menuId=current`,
        `${BASE}/site/main/exhi/proceed/current`,
        `${BASE}/MUSEUM/contents/M0201010000.do`,
      ],
      (html, url) =>
        genericParse(html, url, {
          blockPatterns: [
            '<li[^>]*class="[^"]*(?:exhi|item|card)[^"]*"',
            '<div[^>]*class="[^"]*(?:exhi|item|card|box)[^"]*"',
            '<li[^>]*>',
          ],
        }),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'national-museum-korea',
      posterReferer: `${BASE}/`,
      officialUrl: c.officialUrl || `${BASE}/MUSEUM/contents/M0202010000.do?menuId=current`,
    }));
  },
};
