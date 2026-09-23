/**
 * 아모레퍼시픽미술관 (APMA)
 *
 * 전시 목록(/contents/exhibition/index.do)은 게시물 목록이다. 전시 기간은 각 게시물(view.do)에
 * 심어진 JSON 의 "place" 값에 들어 있다 ("2026.09.01(화) ~ 2027.02.28(일) | 미술관 1F 로비, …").
 * showStartTime/showEndTime 은 관람 예약 창구 기간이라 전시 기간으로 쓰면 안 된다.
 * 제목은 "[Sol LeWitt: Open Structure] 전시관람 예약" 처럼 대괄호 안이 전시명이다.
 */

import { getHtml } from '../lib/http.mjs';
import { cleanText, parseDateRange } from '../lib/parse.mjs';

const BASE = 'https://apma.amorepacific.com';
const LIST = `${BASE}/contents/exhibition/index.do`;

/** 페이지에 심어진 JSON 문자열 값을 모두 꺼낸다. */
function jsonValues(html, name) {
  const out = [];
  for (const m of html.matchAll(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`, 'g'))) {
    try {
      out.push(JSON.parse(`"${m[1]}"`));
    } catch {
      /* 깨진 값은 건너뛴다 */
    }
  }
  return out;
}

/** 게시물 페이지에서 전시 정보를 읽는다. 전시 기간이 없는 게시물이면 null. */
export function parseView(html, id) {
  const [period = '', place = ''] = cleanText(jsonValues(html, 'place')[0] || '').split('|').map((s) => s.trim());
  const { startDate, endDate } = parseDateRange(period);
  if (!startDate) return null;
  const heading = cleanText(jsonValues(html, 'thumbnailTitle')[0] || '');
  const media = jsonValues(html, 'mediaUri').filter((uri) => /^https?:\/\//.test(uri));
  return {
    museumId: 'apma',
    title: /^\[([^\]]+)\]/.exec(heading)?.[1]?.trim() || heading,
    startDate,
    endDate,
    venue: place,
    posterUrl: media[0] || '',
    posterCandidates: media.slice(1),
    posterReferer: `${BASE}/`,
    officialUrl: `${BASE}/contents/exhibition/${id}/view.do`,
    sourceId: id,
  };
}

export default {
  key: 'apma',
  label: '아모레퍼시픽미술관',
  homepage: BASE,
  museums: ['apma'],

  async fetch({ log }) {
    const list = await getHtml(LIST, { referer: `${BASE}/` });
    const ids = [...new Set([...list.matchAll(/\/contents\/exhibition\/(\d+)\/view\.do/g)].map((m) => m[1]))];
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const cards = [];
    for (const id of ids) {
      try {
        const card = parseView(await getHtml(`${BASE}/contents/exhibition/${id}/view.do`, { referer: LIST, retries: 1 }), id);
        if (card?.title && (!card.endDate || card.endDate >= today)) cards.push(card);
      } catch (err) {
        log(`    · 게시물 ${id}: ${err.message}`);
      }
    }
    log(`    ✓ 게시물 ${ids.length}건 중 진행·예정 전시 ${cards.length}건`);
    return cards;
  },
};
