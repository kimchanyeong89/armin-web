/**
 * 국립민속박물관 (NFM)
 * 봇 차단이 있어 실패할 수 있다. 실패 시 해당 미술관 데이터는 그대로 둔다.
 */

import { genericParse, tryUrls } from '../lib/source-utils.mjs';

const BASE = 'https://www.nfm.go.kr';

export default {
  key: 'nfm',
  label: '국립민속박물관',
  homepage: BASE,
  museums: ['folk-museum'],

  async fetch({ log }) {
    const { cards } = await tryUrls(
      [
        `${BASE}/home/exhibition/current.do`,
        `${BASE}/home/subIndex/676.do`,
        `${BASE}/user/exhibition/home/676/selectExhibitionCurrentList.do`,
      ],
      (html, url) => genericParse(html, url),
      { referer: `${BASE}/`, log }
    );

    return cards.map((c) => ({
      ...c,
      museumId: 'folk-museum',
      posterReferer: `${BASE}/`,
      officialUrl: c.officialUrl || `${BASE}/home/exhibition/current.do`,
    }));
  },
};
