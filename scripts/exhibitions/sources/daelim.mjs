/**
 * 대림미술관 / 디뮤지엄 (대림문화재단)
 * 두 관의 전시가 한 사이트에서 관리되므로 전시관 표기로 나눠 담는다.
 */

import { stripTags } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.daelimmuseum.org';

/** 카드 텍스트/링크로 대림 · 디뮤지엄을 판별한다. */
function venueOf(card, defaultId) {
  const text = stripTags(card.raw || '') + ' ' + (card.officialUrl || '');
  if (/디뮤지엄|d\s*museum|dmuseum/i.test(text)) {
    return { museumId: 'd-museum', venue: '디뮤지엄' };
  }
  if (/대림미술관|daelim/i.test(text)) {
    return { museumId: 'daelim-museum', venue: '대림미술관' };
  }
  return { museumId: defaultId, venue: '' };
}

export default {
  key: 'daelim',
  label: '대림미술관·디뮤지엄',
  homepage: BASE,
  museums: ['daelim-museum', 'd-museum'],

  async fetch({ log }) {
    const out = [];

    // 각 사이트를 따로 훑어 기본 소속을 정한 뒤, 본문으로 재판별한다.
    const sites = [
      { urls: [`${BASE}/exhibition/`, `${BASE}/exhibition/exhibitionList.do`, `${BASE}/`], defaultId: 'daelim-museum' },
      { urls: ['https://www.dmuseum.org/exhibition/', 'https://www.dmuseum.org/'], defaultId: 'd-museum' },
    ];

    for (const site of sites) {
      const { cards, sourceUrl } = await tryUrls(
        site.urls,
        (html, url) => genericParse(html, url),
        { log }
      );
      for (const card of cards) {
        const { museumId, venue } = venueOf(card, site.defaultId);
        out.push({
          ...card,
          museumId,
          venue,
          posterReferer: sourceUrl ? new URL(sourceUrl).origin + '/' : `${BASE}/`,
          officialUrl: card.officialUrl || sourceUrl || BASE,
        });
      }
    }

    return out;
  },
};
