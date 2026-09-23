/**
 * 예술의전당 전시 (한가람미술관·한가람디자인미술관·서울서예박물관)
 *
 * 목록 API 에는 이미지 필드가 없다. 포스터는 상세 페이지 og:image 의 썸네일 주소
 * (/site/main/file/thumbnail/uu/{id}, 235×300)를 원본 주소(/file/image/uu/{id})로 바꿔 쓴다.
 * 포스터가 아직 없는 전시는 og:image 가 예술의전당 로고이므로 포스터 없음('')으로 둔다.
 */

import { getHtml, getJson } from '../lib/http.mjs';
import { cleanText, metaContent, normalizeDate } from '../lib/parse.mjs';

const BASE = 'https://www.sac.or.kr';
const PAGE_SIZE = 40;

/** 상세 페이지 HTML 에서 원본 포스터 주소를 만든다. 포스터가 없으면 ''. */
export function posterFromDetail(html) {
  const og = metaContent(html, 'og:image');
  const id = /\/site\/main\/file\/thumbnail\/uu\/([0-9a-f]{16,})/i.exec(og)?.[1];
  return id ? `${BASE}/site/main/file/image/uu/${id}` : '';
}

const ymd = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

export default {
  key: 'sac',
  label: '예술의전당 한가람미술관',
  homepage: BASE,
  museums: ['hangaram-art-museum'],

  async fetch({ log }) {
    // BEGIN_DATE 를 오늘로 두면 이미 진행 중인 전시를 놓친다.
    // 1년 전부터 1년 뒤까지 훑고, 끝난 전시는 뒤에서 거른다.
    const from = ymd(new Date(Date.now() - 365 * 864e5));
    const until = ymd(new Date(Date.now() + 365 * 864e5));
    const items = [];
    for (let cp = 1; cp <= 10; cp++) {
      const data = await getJson(
        `${BASE}/site/main/show/dataList?cp=${cp}&PAGE_SIZE=${PAGE_SIZE}&BEGIN_DATE=${from}&END_DATE=${until}&catePriArr=6`,
        { referer: `${BASE}/` }
      );
      const page = data?.paging?.result || [];
      items.push(...page);
      if (page.length < PAGE_SIZE || items.length >= Number(data?.total || 0)) break;
    }
    log(`    ✓ 전시 API → ${items.length}건`);

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const out = [];
    for (const item of items) {
      const title = cleanText(item.PROGRAM_SUBJECT || '');
      const endDate = normalizeDate(item.END_DATE || '');
      if (!title || !item.SN || (endDate && endDate < today)) continue;

      const officialUrl = `${BASE}/site/main/show/show_view?SN=${item.SN}`;
      let posterUrl = '';
      try {
        posterUrl = posterFromDetail(await getHtml(officialUrl, { referer: `${BASE}/`, retries: 1 }));
      } catch (err) {
        log(`    · 상세 페이지 실패 SN=${item.SN}: ${err.message}`);
      }

      out.push({
        museumId: 'hangaram-art-museum',
        title,
        titleEn: cleanText(item.PROGRAM_SUBJECT_ENG || ''),
        venue: cleanText(item.PLACE_NAME || '').replace(/[,\s]+$/, ''),
        startDate: normalizeDate(item.BEGIN_DATE || ''),
        endDate,
        posterUrl,
        posterReferer: `${BASE}/`,
        officialUrl,
        sourceId: String(item.SN),
      });
    }
    return out.filter((c) => c.startDate);
  },
};
