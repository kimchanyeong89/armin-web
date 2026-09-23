/**
 * 대림미술관 / 디뮤지엄 (대림문화재단)
 *
 * 사이트는 Vue 앱이고, 전시는 api.daelimmuseum.org 의 전시 API 로 받는다.
 *   v1/program/exhibition/searchCurrentExhibition — 현재 전시
 *   v1/program/exhibition/searchNextExhibition    — 예정 전시
 * 전시관(prgPlcVal): 대림미술관 → daelim-museum, 디뮤지엄·D PUBLIC PROJECT(서울숲 디뮤지엄 M1) → d-museum.
 * 구슬모아당구장 같은 그 밖의 공간은 담지 않는다.
 * 전시 상세는 전시 페이지 안의 팝업이라 고유 주소가 없어서 전시 페이지를 공식 링크로 쓴다.
 */

import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate } from '../lib/parse.mjs';

const WEB = 'https://www.daelimmuseum.org';
const API = 'https://api.daelimmuseum.org/v1/program/exhibition';

/** 전시관 이름으로 대상 미술관을 정한다. 대상 밖이면 null. */
function museumOf(place) {
  if (/대림미술관/.test(place)) return 'daelim-museum';
  if (/디뮤지엄|D\s*PUBLIC/i.test(place)) return 'd-museum';
  return null;
}

/** API 응답 한 건을 카드로 바꾼다. 대표 파일이 영상이면 포스터로 쓰지 않는다. */
function fromApi(item) {
  const place = cleanText(item.prgPlcVal || '');
  const museumId = museumOf(place);
  const title = cleanText(item.prgNm || '');
  if (!museumId || !title) return null;
  const image = item.prgImgFileVideoYn === 'Y' ? '' : item.prgImgFileUrl || '';
  const mobile = item.prgImgFileVideoYnMobile === 'Y' ? '' : item.prgImgFileUrlMobile || '';
  return {
    museumId,
    title,
    titleEn: cleanText(item.prgNmEn || ''),
    description: cleanText(item.prgDesc || '', 400),
    venue: place,
    startDate: normalizeDate(item.prgStartDt),
    endDate: normalizeDate(item.prgEndDt),
    posterUrl: image || mobile,
    posterCandidates: mobile && mobile !== image ? [mobile] : [],
    posterReferer: `${WEB}/`,
    officialUrl: `${WEB}/exhibition`,
    sourceId: String(item.prgIdx || ''),
  };
}

export default {
  key: 'daelim',
  label: '대림미술관·디뮤지엄',
  homepage: WEB,
  museums: ['daelim-museum', 'd-museum'],

  async fetch({ log }) {
    const out = [];
    for (const [label, path] of [['현재', 'searchCurrentExhibition'], ['예정', 'searchNextExhibition']]) {
      try {
        const data = await getJson(`${API}/${path}`, { referer: `${WEB}/` });
        const cards = (data?.data?.data || []).map(fromApi).filter(Boolean);
        log(`    ✓ ${label} 전시 → ${cards.length}건`);
        out.push(...cards);
      } catch (err) {
        log(`    · ${label} 전시 → ${err.message}`);
      }
    }
    return out.filter((c) => c.startDate);
  },
};
