/**
 * 그라운드시소 (서촌·성수·명동 등 다관 운영)
 * cafe24 CDN 이미지를 쓰며 hotlink 차단이 있어 Referer 가 필요하다.
 */

import { stripTags } from '../lib/parse.mjs';
import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.groundseesaw.co.kr';

const BRANCHES = ['서촌', '성수', '명동', '센트럴', '홍대'];

function branchOf(card) {
  const text = stripTags(card.raw || '');
  const hit = BRANCHES.find((b) => text.includes(b));
  return hit ? `그라운드시소 ${hit}` : '';
}

export default {
  key: 'groundseesaw',
  label: '그라운드시소',
  homepage: BASE,
  museums: ['groundseesaw'],

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [`${BASE}/exhibition`, `${BASE}/`, `${BASE}/exhibition/current`],
      (html, url) => genericParse(html, url),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'groundseesaw',
      venue: branchOf(c),
      posterReferer: `${BASE}/`,
      officialUrl: c.officialUrl || BASE,
    }));
  },
};
