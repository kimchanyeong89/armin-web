/**
 * 리움미술관 / 호암미술관 (삼성문화재단)
 *
 * 전시 목록은 전시 페이지의 search() 가 쓰는 AJAX(/{leeum|hoam}/exhibition/list)로 받는다.
 * state[] 는 1=현재·2=예정, found 는 미술관 코드(리움 LM, 호암 HA)다.
 * 이미지는 /upload/exhibition/{파일명} 의 전시별 대표 이미지다.
 *
 * 사이트는 자리표시 날짜를 쓴다. 1753-01-01~9999-12-31 은 상설 소장품·야외 설치라 제외하고,
 * 종료일 1900-01-01 은 '미정'이라 비워 둔다.
 */

import { introText } from '../lib/extract.mjs';
import { getJson } from '../lib/http.mjs';
import { cleanText, normalizeDate } from '../lib/parse.mjs';

const BASE = 'https://www.leeumhoam.org';

const TARGETS = [
  { museumId: 'leeum-museum', path: 'leeum', found: 'LM', label: '리움미술관' },
  { museumId: 'hoam-museum', path: 'hoam', found: 'HA', label: '호암미술관' },
];

/** 자리표시가 아닌 실제 날짜만 남긴다. */
function realDate(value) {
  const date = normalizeDate(value);
  return date > '1990' && date < '2100' ? date : '';
}

/** API 응답 한 건을 카드로 바꾼다. 상설 전시면 null. */
function fromApi(item, target) {
  const title = cleanText(item.title || '');
  const startDate = realDate(item.startDate);
  if (!title || !startDate) return null;
  return {
    museumId: target.museumId,
    title,
    venue: cleanText(item.location || ''),
    startDate,
    endDate: realDate(item.endDate),
    posterUrl: item.image ? `${BASE}/upload/exhibition/${encodeURIComponent(item.image)}` : '',
    posterReferer: `${BASE}/`,
    officialUrl: `${BASE}/${target.path}/exhibition/${item.exhibitionSeq}`,
    sourceId: String(item.exhibitionSeq),
  };
}

/**
 * 상세 페이지에서 소개문을 뽑는다 (sync.mjs 상세 보강 단계가 부른다).
 * 목록 API 의 content 는 비어 있다. 본문은 페이지에 심어진 Editor.js 데이터(let content = {...})를
 * 스크립트가 그리고, 본문 AJAX(/exhibition/content/{seq})는 빈 배열을 준다.
 */
export function describeDetail(html) {
  const json = /let content = (\{[\s\S]*?\});\s*createNewEditor/.exec(html)?.[1];
  if (!json) return '';
  try {
    const blocks = JSON.parse(json).blocks || [];
    return introText(blocks.map((block) => `<p>${block.data?.text || ''}</p>`).join(''));
  } catch {
    return ''; // 깨진 데이터는 소개문 없음으로 둔다
  }
}

export default {
  key: 'leeumhoam',
  label: '리움·호암미술관',
  homepage: BASE,
  museums: ['leeum-museum', 'hoam-museum'],
  describe: describeDetail,

  async fetch({ log }) {
    const out = [];
    for (const target of TARGETS) {
      const params = new URLSearchParams({
        view: 'grid', keyword: '', startDate: '', endDate: '', limit: '50',
        mainFlag: 'false', found: target.found, page: '1', tab: 'all',
      });
      params.append('state[]', '1');
      params.append('state[]', '2');
      try {
        const data = await getJson(`${BASE}/${target.path}/exhibition/list?${params}`, {
          referer: `${BASE}/${target.path}/exhibition`,
        });
        const cards = (data?.list || []).map((item) => fromApi(item, target)).filter(Boolean);
        log(`    ✓ ${target.label} → ${cards.length}건 (상설 제외)`);
        out.push(...cards);
      } catch (err) {
        log(`    · ${target.label} → ${err.message}`);
      }
    }
    return out;
  },
};
