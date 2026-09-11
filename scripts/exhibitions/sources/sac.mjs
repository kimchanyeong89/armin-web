/**
 * 예술의전당 한가람미술관 (SAC)
 * 공연·전시가 한 목록에 섞여 나오므로 전시(미술) 장르만 골라낸다.
 */

import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate, stripTags } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.sac.or.kr';

/** 한가람미술관/디자인미술관 전시만 통과시킨다. */
function isArtExhibition(text) {
  return /한가람\s*미술관|한가람\s*디자인|전시/.test(text) && !/콘서트|오페라|발레|연극|무용|음악회/.test(text);
}

export default {
  key: 'sac',
  label: '예술의전당 한가람미술관',
  homepage: BASE,
  museums: ['hangaram-art-museum'],

  async fetch({ log }) {
    const out = [];

    // 1) dataList API
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const until = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
      const data = await getJson(
        `${BASE}/site/main/show/dataList?cp=1&PAGE_SIZE=40&BEGIN_DATE=${today}&END_DATE=${until}&catePriArr=6`,
        { referer: `${BASE}/` }
      );
      const items = Array.isArray(data) ? data : data?.paging?.result || data?.list || [];
      for (const item of items) {
        const title = cleanText(item.PROGRAM_SUBJECT || item.programSubject || '');
        const place = cleanText(item.PLACE_NAME || item.placeName || '');
        if (!title) continue;
        if (place && !isArtExhibition(`${place} 전시`)) continue;
        out.push({
          museumId: 'hangaram-art-museum',
          title,
          venue: place,
          startDate: normalizeDate(item.BEGIN_DATE || item.beginDate || ''),
          endDate: normalizeDate(item.END_DATE || item.endDate || ''),
          posterUrl: item.IMAGE_URL || item.imageUrl || '',
          posterReferer: `${BASE}/`,
          officialUrl: `${BASE}/site/main/show/show_view?SN=${item.SN || item.PROGRAM_SN || ''}`,
          sourceId: String(item.SN || item.PROGRAM_SN || ''),
        });
      }
    } catch (err) {
      log(`    · SAC API 실패: ${err.message}`);
    }

    // 2) 폴백 — 목록 페이지
    if (!out.length) {
      const { cards } = await tryUrls(
        [
          `${BASE}/site/main/show/showList?genre=EXHIBITION`,
          `${BASE}/site/main/show/showList`,
        ],
        (html, url) => genericParse(html, url),
        { referer: `${BASE}/`, log }
      );
      for (const card of cards) {
        if (!isArtExhibition(stripTags(card.raw || '') + ' 전시')) continue;
        out.push({
          ...card,
          museumId: 'hangaram-art-museum',
          posterReferer: `${BASE}/`,
          officialUrl: card.officialUrl || `${BASE}/site/main/show/showList`,
        });
      }
    }

    return out.filter((c) => c.startDate);
  },
};
