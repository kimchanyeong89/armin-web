/**
 * update-museum-images.mjs
 *
 * exhibitions.js의 88개 문제 이미지를 올바른 URL로 교체한다.
 * - 로컬 JPG 파일이 있는 UK 미술관은 그대로 유지 (이미 fix-museum-images.mjs에서 처리)
 * - 나머지는 Wikimedia Commons 직접 URL 사용
 * - Special:FilePath 리다이렉트 형식 사용 (해시 불필요)
 */

import { readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';

// MD5 기반 Wikimedia thumb URL 생성
function wikiThumb(filename, width = 640) {
  // Wikimedia는 파일명의 MD5 해시로 경로를 결정
  const hash = crypto.createHash('md5').update(filename).digest('hex');
  const h1 = hash[0];
  const h2 = hash.substring(0, 2);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h1}/${h2}/${filename}/${width}px-${filename}`;
}

// Special:FilePath 리다이렉트 형식 (해시 없이 접근)
function wikiPath(filename, width = 640) {
  const encoded = encodeURIComponent(filename);
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`;
}

// 각 미술관의 새 이미지 URL 매핑
// 이미 처리된 6개 (tate-modern, tate-britain, national-gallery, vam, royal-academy, british-museum)는 제외
const UPDATES = {

  // ═══════════════════ CHINA ═══════════════════
  'guangdong-museum-of-art': wikiThumb('Guangdong_Museum_of_Art_1.jpg'),
  'power-station-of-art': wikiThumb('Power_Station_of_Art_(PSA)_Exterior_2015.jpg'),
  'shanghai-museum': wikiThumb('Shanghai_Museum_by_Colin_W.jpg'),
  'nanjing-museum': wikiThumb('Nanjing_museum_2.JPG'),
  'national-museum-of-china': wikiThumb('National_Museum_of_China_2017.jpg'),
  'shenzhen-museum': wikiThumb('Shenzhen_Museum_new_building.jpg'),

  // ═══════════════════ JAPAN ═══════════════════
  'nich-tnm': wikiThumb('Tokyo_National_Museum_Honkan_2010.JPG'),
  'tobikan-collection': wikiThumb('Tokyo_Metropolitan_Art_Museum_2012.jpg'),

  // ═══════════════════ HK / TAIWAN ═══════════════════
  'mplus': wikiThumb('M+_Façade_2021.jpg'),
  'tfam': wikiThumb('Taipei_Fine_Arts_Museum.jpg'),

  // ═══════════════════ UK (without local files) ═══════════════════
  'national-portrait-gallery': wikiThumb('National_Portrait_Gallery_London_2010.jpg'),
  'tate-liverpool': wikiThumb('Tate_Liverpool_and_Merseyside_Maritime_Museum.jpg'),
  'tate-st-ives': wikiThumb('Tate_St_Ives_(geograph_5268083).jpg'),
  'scottish-national-gallery': wikiThumb('The_National_Gallery_of_Scotland.jpg'),
  'serpentine-gallery': wikiThumb('Serpentine_Gallery_June_2012.jpg'),
  'dulwich-picture-gallery': wikiThumb('Dulwich_Picture_Gallery,_main_entrance.JPG'),
  'courtauld-gallery': wikiThumb('Somerset_House_London_150902.jpg'),
  'manchester-art-gallery': wikiThumb('Manchester_Art_Gallery,_Manchester,_UK_-_0961.jpg'),
  'walker-art-gallery': wikiThumb('Walker_Art_Gallery,_Liverpool_161009.JPG'),
  'scottish-national-portrait-gallery': wikiThumb('Scottish_National_Portrait_Gallery,_Edinburgh_2.jpg'),
  'scottish-national-gallery-of-modern-art': wikiThumb('Dean_Gallery_Edinburgh.jpg'),
  'hayward-gallery': wikiThumb('Hayward_Gallery_SE1.jpg'),
  'wallace-collection': wikiThumb('Wallace_Collection_building_exterior.jpg'),
  'soane-museum': wikiThumb("Sir_John_Soane's_Museum_exterior.jpg"),
  'museum-wales': wikiThumb('National_Museum_Cardiff.JPG'),

  // ═══════════════════ FRANCE ═══════════════════
  'musee-du-louvre': wikiThumb('Louvre_Museum_Wikimedia_Commons.jpg'),
  "musee-dorsay": wikiThumb("Musée_d'Orsay,_Paris_7th_002.JPG"),
  'centre-pompidou': wikiThumb('Centre_Georges-Pompidou_-_Exterior.jpg'),
  "musee-de-lorangerie": wikiThumb("Musée_de_l'Orangerie_exterior.JPG"),
  'bourse-de-commerce-pinault-collection': wikiThumb('Bourse_de_Commerce_-_Pinault_Collection.jpg'),
  'musee-dart-moderne-de-paris': wikiThumb('Musée_d_Art_Moderne_de_Paris_(cropped).jpg'),
  'musee-marmottan-monet': wikiThumb('Musée_Marmottan_Monet.jpg'),
  "musee-jacquemart-andre": wikiThumb("Musée_Jacquemart-André.jpg"),
  'jeu-de-paume': wikiThumb('Jeu_de_Paume_Paris_2014.jpg'),
  'maison-europeenne-de-la-photographie': wikiThumb('Maison_Europeenne_de_la_Photographie,_Paris_2013.jpg'),
  'palais-de-tokyo': wikiThumb('Palais_de_Tokyo_20030101w.JPG'),
  'palais-des-beaux-arts-de-lille': wikiThumb('Palais_des_beaux-arts_de_Lille.jpg'),
  'musee-des-beaux-arts-de-rouen': wikiThumb('Musée_des_Beaux-Arts_de_Rouen.jpg'),
  'musee-des-beaux-arts-de-lyon': wikiThumb('Musée_des_beaux-arts_de_Lyon.jpg'),
  'musee-conde': wikiThumb('Chantilly_-_Chateau_-_Facade.jpg'),
  'musee-toulouse-lautrec': wikiThumb('Palais_de_la_Berbie_Albi.jpg'),
  'musee-de-grenoble': wikiThumb('Musée_de_Grenoble.jpg'),
  'musee-granet': wikiThumb('Musée_Granet_Aix-en-Provence.jpg'),
  'mamcs-strasbourg': wikiThumb('Strasbourg_MAMCS_2008.jpg'),
  'musee-des-beaux-arts-de-bordeaux': wikiThumb('Bordeaux_musée_des_beaux_arts.jpg'),
  'musee-rodin': wikiThumb('Hotel_Biron,_Paris.jpg'),
  'fondation-louis-vuitton': wikiThumb('Fondation_Louis_Vuitton,_November_2014_(6).jpg'),
  'mad-paris': wikiThumb('Musée_des_Arts_décoratifs_Paris_2013.jpg'),
  'carnavalet': wikiThumb('Musée_Carnavalet,_Paris.JPG'),
  'musee-armee': wikiThumb('Dôme_des_Invalides,_Paris_7e.jpg'),
  'chateau-de-versailles': wikiThumb('Château_de_Versailles,_France.jpg'),
  'musee-guimet': wikiThumb('Musée_Guimet_Paris_2010.jpg'),
  'macval': wikiThumb('Mac_Val_-_Vitry-sur-Seine_(2018).jpg'),
  'mucem': wikiThumb('Mucem_Marseille_03.jpg'),
  'musee-fabre': wikiThumb('Musée_Fabre_Montpellier_2015.jpg'),
  'musee-chagall': wikiThumb('Musee_national_Marc_Chagall_Nice.jpg'),
  'la-piscine': wikiThumb('La_Piscine_Roubaix.jpg'),
  'musee-matisse-nice': wikiThumb('Musée_Matisse_Nice.jpg'),
  'wallace-collection': wikiThumb('Wallace_Collection_building_exterior.jpg'),
  'soane-museum': wikiThumb("Sir_John_Soane's_Museum_exterior.jpg"),

  // ═══════════════════ SPAIN ═══════════════════
  'museu-picasso-barcelona': wikiThumb('Museu_Picasso_Barcelona.JPG'),
  'dali-foundation': wikiThumb('Figueres_-_Teatre-Museu_Dalí_0106.JPG'),
  'caixaforum': wikiThumb('CaixaForum_Madrid_-_Noche.jpg'),

  // ═══════════════════ SWITZERLAND ═══════════════════
  'kunsthaus-zurich': wikiThumb('Kunsthaus_Zürich_01_esterno.JPG'),
  "mah-geneva": wikiThumb("Musée_d'Art_et_d'Histoire_de_Genève.JPG"),

  // ═══════════════════ CZECH REPUBLIC ═══════════════════
  'national-gallery-prague': wikiThumb('Sternberg_Palace_01.jpg'),

  // ═══════════════════ NORDIC ═══════════════════
  'smk-collection': wikiThumb('Statens_Museum_for_Kunst,_exterior_-_Copenhagen_-_DSC08295.JPG'),
  'ateneum-collection': wikiThumb('Ateneum_Art_Museum_(Konstmuseet_Ateneum)_(Helsinki).jpg'),
  'kiasma-collection': wikiThumb('Kiasma_exterior_2019.jpg'),
  'sinebrychoff-collection': wikiThumb('Sinebrychoff_Palace_Helsinki.jpg'),

  // ═══════════════════ RUSSIA ═══════════════════
  'state-russian-museum': wikiThumb('Mikhailovsky_Palace,_Saint_Petersburg.jpg'),
  'tretyakov-gallery': wikiThumb('Tretyakov_Gallery_main_entrance.jpg'),
  'hermitage-museum': wikiThumb('Saint_Petersburg_Hermitage_Museum,_Palace_Square.jpg'),
  'pushkin-museum': wikiThumb('Pushkin_museum_facade.jpg'),
  'kremlin-museum': wikiThumb('Moscow_Kremlin_from_Kamenny_bridge.jpg'),

  // ═══════════════════ TURKEY ═══════════════════
  'topkapi-palace': wikiThumb('Topkapi_palace_Constantinople.jpg'),

  // ═══════════════════ KOREA (JEJU) ═══════════════════
  'lee-jung-seop-museum': wikiPath('Lee_Jung-seob_Art_Museum_Seogwipo.jpg'),
  'gidang-art-museum': 'https://upload.wikimedia.org/wikipedia/ko/thumb/c/c5/%EA%B8%B0%EB%8B%B9%EB%AF%B8%EC%88%A0%EA%B4%80.jpg/640px-%EA%B8%B0%EB%8B%B9%EB%AF%B8%EC%88%A0%EA%B4%80.jpg',
  'soam-memorial-hall': wikiPath('소암기념관.jpg'),
  'jeju-museum-of-art': wikiThumb('Jeju_Museum_of_Art.jpg'),
  'kim-tschang-yeul-art-museum': wikiPath('김창열미술관.jpg'),
  'dumoak': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jeju_National_Museum.jpg/640px-Jeju_National_Museum.jpg',

  // ═══════════════════ SINGAPORE ═══════════════════
  'national-gallery-singapore': wikiThumb('National_Gallery_Singapore_2020.jpg'),

  // ═══════════════════ USA ═══════════════════
  'getty': wikiThumb('GettyCenter_Dusk.JPG'),
};

// ── Apply updates ──────────────────────────────────────────────────────────────
const EXHIBITIONS_PATH = '/sessions/youthful-clever-heisenberg/mnt/armin-web-main/src/data/exhibitions.js';
let content = readFileSync(EXHIBITIONS_PATH, 'utf8');

// Parse to find current images for each museum
const imageRegex = /\{[\s\S]*?id:\s*"([^"]+)"[\s\S]*?representativeImage:\s*"([^"]*)"/g;
const museumImages = {};
let m;
while ((m = imageRegex.exec(content)) !== null) {
  museumImages[m[1]] = m[2];
}

console.log('\n🔄 Updating museum images...\n');

let updated = 0;
let skipped = 0;

for (const [id, newUrl] of Object.entries(UPDATES)) {
  const currentImg = museumImages[id];
  if (currentImg === undefined) {
    console.log(`  ⚠️  Museum not found: ${id}`);
    skipped++;
    continue;
  }

  // Skip if already has a good non-SVG, non-favicon, non-empty image
  // (only update if current is problematic)
  const isProblematic = !currentImg ||
    currentImg.includes('favicon') ||
    currentImg.endsWith('.svg') ||
    currentImg.endsWith('.gif') ||
    currentImg.endsWith('.ico') ||
    currentImg === '';

  if (!isProblematic) {
    console.log(`  ✓ Skip ${id}: already has good image`);
    skipped++;
    continue;
  }

  // Replace in content
  const escapedCurrent = currentImg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const searchStr = `representativeImage: "${currentImg}"`;
  const replaceStr = `representativeImage: "${newUrl}"`;

  if (content.includes(searchStr)) {
    content = content.replace(searchStr, replaceStr);
    console.log(`  ✅ ${id}`);
    console.log(`      "${currentImg}"`);
    console.log(`    → "${newUrl}"`);
    updated++;
  } else {
    // Try finding by id context
    const idRegex = new RegExp(`(id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?representativeImage:\\s*)"([^"]*)"`, 'g');
    const newContent = content.replace(idRegex, (match, prefix, oldImg) => {
      console.log(`  ✅ ${id} (context match)`);
      console.log(`      "${oldImg}"`);
      console.log(`    → "${newUrl}"`);
      updated++;
      return `${prefix}"${newUrl}"`;
    });
    if (newContent !== content) {
      content = newContent;
    } else {
      console.log(`  ⚠️  Could not replace ${id} (current: "${currentImg}")`);
      skipped++;
    }
  }
}

// Write updated file
writeFileSync(EXHIBITIONS_PATH, content, 'utf8');
console.log(`\n📊 Updated: ${updated}, Skipped: ${skipped}`);
console.log(`✅ exhibitions.js updated successfully!`);

// Verify final state
const finalContent = readFileSync(EXHIBITIONS_PATH, 'utf8');
const remaining = [];
const checkRegex = /id:\s*"([^"]+)"[\s\S]*?representativeImage:\s*"([^"]*)"/g;
let cm;
const seen = new Set();
while ((cm = checkRegex.exec(finalContent)) !== null) {
  const id = cm[1];
  const img = cm[2];
  if (seen.has(id)) continue;
  seen.add(id);
  if (!img || img.includes('favicon') || (img.endsWith('.svg') && img.startsWith('images/')) || img.endsWith('.gif') || img.endsWith('.ico')) {
    remaining.push({ id, img });
  }
}

if (remaining.length === 0) {
  console.log('\n🎉 All museums now have proper images!');
} else {
  console.log(`\n⚠️  ${remaining.length} museums still have problematic images:`);
  remaining.forEach(({ id, img }) => console.log(`  - ${id}: "${img}"`));
}
