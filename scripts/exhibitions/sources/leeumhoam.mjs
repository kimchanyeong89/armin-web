/**
 * 리움미술관 / 호암미술관 (삼성문화재단)
 * 공식 JSON API 를 우선 쓰고, 실패하면 목록 페이지를 파싱한다.
 */

import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.leeumhoam.org';

const TARGETS = [
  { museumId: 'leeum-museum', type: 'L', label: '리움미술관', path: '/leeum' },
  { museumId: 'hoam-museum', type: 'H', label: '호암미술관', path: '/hoam' },
];

/** API 응답 한 건을 카드로 정규화한다. */
function fromApi(item, museumId) {
  const title = cleanText(item.title || item.exhibitionTitle || item.exhbtNm || '');
  if (!title) return null;
  const poster =
    item.thumbnailUrl || item.coverImage || item.imgUrl || item.thumbImgPath || item.listImgPath || '';
  return {
    museumId,
    title,
    titleEn: cleanText(item.titleEn || item.engTitle || ''),
    description: cleanText(item.summary || item.description || item.contents || '', 400),
    startDate: normalizeDate(item.startDate || item.beginDe || ''),
    endDate: normalizeDate(item.endDate || item.endDe || ''),
    posterUrl: poster && !poster.startsWith('http') ? `${BASE}${poster}` : poster,
    posterReferer: `${BASE}/`,
    officialUrl: item.linkUrl || `${BASE}/`,
    sourceId: String(item.exhibitionId || item.id || item.exhbtSn || ''),
  };
}

export default {
  key: 'leeumhoam',
  label: '리움·호암미술관',
  homepage: BASE,
  museums: ['leeum-museum', 'hoam-museum'],

  async fetch({ log }) {
    const out = [];

    for (const target of TARGETS) {
      let got = [];

      // 1) JSON API — 진행중(ING) + 예정(WAIT)
      for (const status of ['ING', 'WAIT']) {
        try {
          const data = await getJson(
            `${BASE}/api/exhibition/list?museumType=${target.type}&status=${status}`,
            { referer: `${BASE}/` }
          );
          const items = Array.isArray(data) ? data : data?.data || data?.list || [];
          const mapped = items.map((i) => fromApi(i, target.museumId)).filter(Boolean);
          got.push(...mapped);
        } catch (err) {
          log(`    · ${target.label} API(${status}) 실패: ${err.message}`);
        }
      }

      // 2) 폴백 — 목록 페이지 파싱
      if (!got.length) {
        const { cards } = await tryUrls(
          [`${BASE}${target.path}/exhibition`, `${BASE}${target.path}`, `${BASE}/`],
          (html, url) => genericParse(html, url),
          { referer: `${BASE}/`, log }
        );
        got = cards.map((c) => ({
          ...c,
          museumId: target.museumId,
          posterReferer: `${BASE}/`,
          officialUrl: c.officialUrl || `${BASE}${target.path}`,
        }));
      }

      out.push(...got.filter((c) => c.startDate));
    }

    return out;
  },
};
