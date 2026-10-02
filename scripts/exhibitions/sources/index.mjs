/**
 * 국내 미술관 소스 레지스트리 — 수도권 14곳(2026-09)에 부산·제주·호남·부천 12곳(2026-10-02)을 더했다.
 * 우리 데이터의 한국 미술관 28곳 중 두모악(상설 사진 갤러리, 전시 일정 없음)·하우스오브레퓨즈(사이트 접속 불가)만 빠진다.
 *
 * exhibitions.js 의 미술관 id 와 스크래퍼를 잇는 단일 진입점이다.
 * 새 미술관을 붙이려면 sources/ 에 어댑터를 추가하고 여기에 등록하면 된다.
 */

import apma from './apma.mjs';
import busanart from './busanart.mjs';
import busanmuseum from './busanmuseum.mjs';
import daelim from './daelim.mjs';
import ddp from './ddp.mjs';
import groundseesaw from './groundseesaw.mjs';
import gwangjunm from './gwangjunm.mjs';
import jejugo from './jejugo.mjs';
import jeonjunm from './jeonjunm.mjs';
import kimtschang from './kimtschang.mjs';
import komacon from './komacon.mjs';
import leeumhoam from './leeumhoam.mjs';
import mmca from './mmca.mjs';
import mocabusan from './mocabusan.mjs';
import nfm from './nfm.mjs';
import njpac from './njpac.mjs';
import nmk from './nmk.mjs';
import sac from './sac.mjs';
import sema from './sema.mjs';
import seogwipo from './seogwipo.mjs';

export const SOURCES = [
  // 수도권
  mmca, nmk, nfm, sema, leeumhoam, apma, daelim, sac, ddp, groundseesaw, njpac, komacon,
  // 부산
  busanart, mocabusan, busanmuseum,
  // 제주
  jejugo, kimtschang, seogwipo,
  // 호남
  gwangjunm, jeonjunm,
];

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
  'korea-manhwa': '한국만화박물관',
  'busan-museum-art': '부산시립미술관',
  'moca-busan': '부산현대미술관',
  'busan-museum': '부산박물관',
  'jeju-museum-art': '제주도립미술관',
  'jeju-contemporary-art-museum': '제주현대미술관',
  'kim-tschang-yeul-art-museum': '제주도립 김창열미술관',
  'lee-jung-seop-museum': '이중섭미술관',
  'gidang-art-museum': '기당미술관',
  'soam-memorial-hall': '소암기념관',
  'gwangju-national-museum': '국립광주박물관',
  'jeonju-national-museum': '국립전주박물관',
};

/** key 로 소스를 찾는다 (--source 옵션용) */
export function sourceByKey(key) {
  return SOURCES.find((s) => s.key === key);
}
