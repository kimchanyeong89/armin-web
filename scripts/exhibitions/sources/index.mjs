/**
 * 수도권(서울·경기) 미술관 소스 레지스트리.
 *
 * exhibitions.js 의 미술관 id 와 스크래퍼를 잇는 단일 진입점이다.
 * 새 미술관을 붙이려면 sources/ 에 어댑터를 추가하고 여기에 등록하면 된다.
 */

import apma from './apma.mjs';
import daelim from './daelim.mjs';
import ddp from './ddp.mjs';
import groundseesaw from './groundseesaw.mjs';
import leeumhoam from './leeumhoam.mjs';
import mmca from './mmca.mjs';
import nfm from './nfm.mjs';
import njpac from './njpac.mjs';
import nmk from './nmk.mjs';
import sac from './sac.mjs';
import sema from './sema.mjs';

export const SOURCES = [mmca, nmk, nfm, sema, leeumhoam, apma, daelim, sac, ddp, groundseesaw, njpac];

/** 이 파이프라인이 관리하는 미술관 id 전체 */
export const MANAGED_MUSEUMS = [...new Set(SOURCES.flatMap((s) => s.museums))];

/** 미술관 id → 사람이 읽는 이름 (리포트용) */
export const MUSEUM_LABELS = {
  'mmca-seoul': '국립현대미술관 서울',
  'mmca-gwacheon': '국립현대미술관 과천',
  'national-museum-korea': '국립중앙박물관',
  'folk-museum': '국립민속박물관',
  'seoul-museum-of-art': '서울시립미술관',
  'leeum-museum': '리움미술관',
  'hoam-museum': '호암미술관',
  apma: '아모레퍼시픽미술관',
  'd-museum': '디뮤지엄',
  'daelim-museum': '대림미술관',
  'hangaram-art-museum': '예술의전당 한가람미술관',
  'ddp-gallery': '동대문디자인플라자',
  groundseesaw: '그라운드시소',
  njpac: '백남준아트센터',
};

/** key 로 소스를 찾는다 (--source 옵션용) */
export function sourceByKey(key) {
  return SOURCES.find((s) => s.key === key);
}
