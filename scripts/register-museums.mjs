// 수집이 끝난 컬렉션을 src/data/exhibitions.js 에 등록한다.
//
//   node scripts/register-museums.mjs            # dry-run: 무엇이 추가될지만 출력
//   node scripts/register-museums.mjs --apply    # 실제 삽입
//
// 등록 조건: public/data/{id}-collection.json 이 존재하고 artworks 가 1건 이상일 것.
// 아직 수집이 안 끝난 미술관은 건너뛰므로, 파이프라인 중간에 몇 번 실행해도 안전하다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXHIBITIONS = path.join(ROOT, 'src/data/exhibitions.js');
const R2 = 'https://pub-396fad1f96754c2f816f260faf970e63.r2.dev';

// 한국어 소개는 번역투를 피하고 네이티브 문장으로 쓴다(memory: feedback_korean_natively).
const MUSEUMS = [
  {
    id: 'faam-fukuoka',
    name: 'Fukuoka Asian Art Museum',
    name_ko: '후쿠오카 아시아미술관',
    location: 'Fukuoka, Japan',
    latitude: 33.5966, longitude: 130.4103,
    country: 'Japan', region: 'Fukuoka',
    description: 'The only museum in the world that systematically collects and exhibits modern and contemporary Asian art, covering 23 countries and regions.',
    description_ko: '아시아 근현대미술만 체계적으로 모으는 세계에서 드문 미술관이다. 23개 나라와 지역의 작품을 다루며, 김환기·윤형근·박서보·김창열 등 한국 작가의 회화도 폭넓게 소장한다.',
    collectionName: 'Asian Modern and Contemporary Art',
    collectionDesc: 'Modern and contemporary art from across Asia, including Korean, Chinese, Indian and Southeast Asian painting.',
  },
  // 愛知県美術館 은 제거했다(2026-09-09). 공개 이미지가 작품 재현이 아니라 자료 촬영본이라
  // 전시장 벽·컬러 캘리브레이션 차트·마운트 테이프가 프레임에 그대로 들어온다.
  // 해상도(1200px)와 색은 통과해서 자동 필터로는 안 잡히고, 눈으로 봐야 드러난다.

  {
    id: 'momas-saitama',
    name: 'The Museum of Modern Art, Saitama',
    name_ko: '사이타마현립근대미술관',
    location: 'Saitama, Japan',
    latitude: 35.9077, longitude: 139.6480,
    country: 'Japan', region: 'Saitama',
    description: 'A Kisho Kurokawa building in Kitaurawa Park, holding modern Japanese and European painting alongside a noted collection of designer chairs.',
    description_ko: '기타우라와 공원에 구로카와 기쇼가 설계한 건물로 서 있다. 모네·피카소·샤갈과 일본 근대미술을 소장하며, 앉아볼 수 있는 디자이너 의자 컬렉션으로도 알려져 있다.',
    collectionName: 'Collection',
    collectionDesc: 'Modern Japanese and European painting, drawings and prints.',
  },
  {
    id: 'kyoto-national-museum',
    name: 'Kyoto National Museum',
    name_ko: '교토국립박물관',
    location: 'Kyoto, Japan',
    latitude: 34.9899, longitude: 135.7728,
    country: 'Japan', region: 'Kyoto',
    description: 'Opened in 1897, one of Japan\'s four national museums, holding Japanese and East Asian painting from the Heian to the Edo period.',
    description_ko: '1897년에 문을 연 일본 4대 국립박물관 가운데 하나다. 헤이안부터 에도까지의 일본·동아시아 회화를 소장하고, 가타야마 도쿠마가 설계한 메이지 시대 벽돌 건물이 그대로 남아 있다.',
    collectionName: 'Painting',
    collectionDesc: 'Japanese and East Asian painting from the Heian through Edo periods.',
  },
  {
    id: 'barnes-foundation',
    name: 'The Barnes Foundation',
    name_ko: '반스 재단',
    location: 'Philadelphia, USA',
    latitude: 39.9656, longitude: -75.1730,
    country: 'USA', region: 'Pennsylvania',
    description: 'Albert Barnes\'s collection of post-impressionist and early modern painting, hung in the dense ensembles he arranged himself, with 181 Renoirs, 69 Cézannes and 59 Matisses.',
    description_ko: '앨버트 반스가 모은 후기인상주의·초기 근대회화를 그가 직접 짠 벽면 배치 그대로 건다. 르누아르 181점, 세잔 69점, 마티스 59점을 소장해 한 화가를 한자리에서 깊이 볼 수 있다.',
    collectionName: 'Collection',
    collectionDesc: 'Post-impressionist and early modern painting, drawings and prints from the Barnes ensembles.',
  },
  {
    id: 'mimoca',
    name: 'Marugame Genichiro-Inokuma Museum of Contemporary Art',
    name_ko: '마루가메시 이노쿠마 겐이치로 현대미술관',
    location: 'Marugame, Kagawa, Japan',
    latitude: 34.2894, longitude: 133.7986,
    country: 'Japan', region: 'Kagawa',
    description: 'A Yoshio Taniguchi building facing Marugame Station, built around some 20,000 works donated by the painter Genichiro Inokuma.',
    description_ko: '마루가메역 앞에 다니구치 요시오가 설계했다. 화가 이노쿠마 겐이치로가 기증한 2만여 점을 중심으로 하며, 역과 미술관이 광장으로 바로 이어진다.',
    collectionName: 'Collection',
    collectionDesc: 'Works by Genichiro Inokuma and postwar Japanese contemporary art.',
  },
];

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function entryFor(M, count) {
  return `  {
    id: "${M.id}",
    description_ko: "${esc(M.description_ko)}",
    slug: "${M.id}",
    name: "${esc(M.name)}",
    name_ko: "${esc(M.name_ko)}",
    location: "${esc(M.location)}",
    description: "${esc(M.description)}",
    latitude: ${M.latitude},
    longitude: ${M.longitude},
    country: "${M.country}",
    region: "${esc(M.region)}",
    representativeImage: "${R2}/museums/${M.id}-representative.webp",
    permanentExhibitions: [
      {
        id: "${M.id}-collection",
        name: "${esc(M.collectionName)}",
        title: "${esc(M.collectionName)}",
        description: "${esc(M.collectionDesc)}",
        startDate: "Permanent",
        endDate: "Permanent",
        collectionFile: "${M.id}-collection.json"
      }
    ],
    temporaryExhibitions: [],
    pastExhibitions: []
  }`;
}

const APPLY = process.argv.includes('--apply');
let src = fs.readFileSync(EXHIBITIONS, 'utf8');

const added = [], skipped = [];
for (const M of MUSEUMS) {
  if (src.includes(`id: "${M.id}"`)) { skipped.push(`${M.name_ko} — 이미 등록됨`); continue; }
  const file = path.join(ROOT, 'public/data', `${M.id}-collection.json`);
  if (!fs.existsSync(file)) { skipped.push(`${M.name_ko} — 컬렉션 파일 없음(수집 미완료)`); continue; }
  let count = 0;
  try { count = (JSON.parse(fs.readFileSync(file, 'utf8')).artworks || []).length; } catch { /* 무시 */ }
  if (count === 0) { skipped.push(`${M.name_ko} — 작품 0건`); continue; }
  added.push({ M, count });
}

if (!added.length) {
  console.log('추가할 미술관 없음');
  skipped.forEach(s => console.log('  건너뜀:', s));
  process.exit(0);
}

// 배열 마지막 항목 뒤에 삽입 — 파일 끝의 "];" 앞
const close = src.lastIndexOf('];');
if (close < 0) { console.error('exhibitions 배열의 끝을 찾지 못했습니다'); process.exit(1); }
// 원본이 이미 후행 쉼표로 끝나면(`},\n];`) 여기서 또 붙여 `},,` 가 되고,
// 그 이중 쉼표가 배열에 undefined 구멍을 만든다. 공백과 함께 쉼표도 먼저 지운다.
const before = src.slice(0, close).replace(/[\s,]*$/, '');
const block = added.map(({ M, count }) => entryFor(M, count)).join(',\n');
const next = `${before},\n${block}\n];\n`;

console.log(`추가 ${added.length}곳:`);
added.forEach(({ M, count }) => console.log(`  ${M.name_ko} / ${M.name} — ${count.toLocaleString()}점`));
skipped.forEach(s => console.log('  건너뜀:', s));

if (APPLY) {
  fs.writeFileSync(EXHIBITIONS, next);
  console.log('\nexhibitions.js 갱신 완료');
} else {
  console.log('\n(dry-run — 실제 반영하려면 --apply)');
}
