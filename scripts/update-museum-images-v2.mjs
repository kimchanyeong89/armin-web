/**
 * update-museum-images-v2.mjs
 *
 * 더 정확한 파싱으로 exhibitions.js의 문제있는 이미지 URL 교체
 */

import { readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';

// MD5 기반 Wikimedia thumb URL 생성 (정확한 경로)
function wikiThumb(filename, width = 640) {
  const hash = crypto.createHash('md5').update(filename).digest('hex');
  const h1 = hash[0];
  const h2 = hash.substring(0, 2);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h1}/${h2}/${filename}/${width}px-${filename}`;
}

// Special:FilePath 리다이렉트 (해시 불필요)
function wikiPath(filename, width = 640) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}

// 각 museum ID → 새 이미지 URL
const UPDATES = {

  // ═══ CHINA ═══
  'guangdong-museum-of-art': wikiThumb('Guangdong_Museum_of_Art_1.jpg'),
  'power-station-of-art': wikiThumb('Power_station_of_art_shanghai.JPG'),
  'shanghai-museum': wikiThumb('Shanghai_Museum_by_Colin_W.jpg'),
  'nanjing-museum': wikiThumb('Nanjing_museum_2.JPG'),
  'national-museum-of-china': wikiThumb('National_Museum_of_China_2017.jpg'),
  'shenzhen-museum': wikiThumb('New_Shenzhen_Museum.jpg'),

  // ═══ JAPAN ═══
  'nich-tnm': wikiThumb('Tokyo_National_Museum_Honkan_2010.JPG'),

  // ═══ TAIWAN ═══
  'tfam': wikiThumb('Taipei_Fine_Arts_Museum.jpg'),

  // ═══ UK ═══
  'national-portrait-gallery': wikiThumb('National_Portrait_Gallery_London_2010.jpg'),
  'tate-liverpool': wikiThumb('Tate_Liverpool_and_Merseyside_Maritime_Museum.jpg'),
  'tate-st-ives': wikiThumb('Tate_St_Ives_(geograph_5268083).jpg'),
  'scottish-national-gallery': wikiThumb('The_National_Gallery_of_Scotland.jpg'),
  'serpentine-gallery': wikiThumb('Serpentine_Gallery_June_2012.jpg'),
  'dulwich-picture-gallery': wikiThumb('Dulwich_Picture_Gallery,_main_entrance.JPG'),
  'courtauld-gallery': wikiThumb('Somerset_House_London_150902.jpg'),
  'manchester-art-gallery': wikiThumb('Manchester_Art_Gallery_from_Mosley_Street.jpg'),
  'scottish-national-portrait-gallery': wikiThumb('Scottish_National_Portrait_Gallery,_Edinburgh_2.jpg'),
  'scottish-national-gallery-of-modern-art': wikiThumb('Scottish_National_Gallery_of_Modern_Art.jpg'),
  'wallace-collection': wikiThumb('Wallace_Collection_building_exterior.jpg'),
  'soane-museum': wikiThumb("Sir_John_Soane's_Museum_exterior.jpg"),
  'museum-wales': wikiThumb('National_Museum_Cardiff.JPG'),

  // ═══ FRANCE ═══
  'musee-du-louvre': wikiThumb('Louvre_Museum_Wikimedia_Commons.jpg'),
  'musee-dorsay': wikiThumb("Musée_d'Orsay,_Paris_7th_002.JPG"),
  'centre-pompidou': wikiThumb('Centre_Georges-Pompidou_-_Exterior.jpg'),
  'musee-de-lorangerie': wikiThumb("Musée_de_l'Orangerie_exterior.JPG"),
  'bourse-de-commerce-pinault-collection': wikiThumb('Bourse_de_Commerce_-_Pinault_Collection.jpg'),
  'musee-dart-moderne-de-paris': wikiThumb('Musée_d_Art_Moderne_de_Paris_(cropped).jpg'),
  'musee-marmottan-monet': wikiThumb('Musée_Marmottan_Monet.jpg'),
  'musee-jacquemart-andre': wikiThumb('Musée_Jacquemart-André.jpg'),
  'jeu-de-paume': wikiThumb('Jeu_de_Paume_Paris_2014.jpg'),
  'palais-de-tokyo': wikiThumb('Palais_de_Tokyo_20030101w.JPG'),
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
  'la-piscine': wikiThumb('La_Piscine_Roubaix.jpg'),
  'musee-matisse-nice': wikiThumb('Musée_Matisse_Nice.jpg'),

  // ═══ SPAIN ═══
  'museu-picasso-barcelona': wikiThumb('Museu_Picasso_Barcelona.JPG'),
  'dali-foundation': wikiThumb('Figueres_-_Teatre-Museu_Dalí_0106.JPG'),
  'caixaforum': wikiThumb('CaixaForum_Madrid_-_Noche.jpg'),

  // ═══ SWITZERLAND ═══
  'kunsthaus-zurich': wikiThumb('Kunsthaus_Zürich_01_esterno.JPG'),
  'mah-geneva': wikiThumb("Musée_d'Art_et_d'Histoire_de_Genève.JPG"),

  // ═══ CZECH REPUBLIC ═══
  'national-gallery-prague': wikiThumb('Sternberg_Palace_01.jpg'),

  // ═══ NORDIC ═══
  'smk-collection': wikiThumb('Statens_Museum_for_Kunst,_exterior_-_Copenhagen_-_DSC08295.JPG'),

  // ═══ RUSSIA ═══
  'state-russian-museum': wikiThumb('Mikhailovsky_Palace,_Saint_Petersburg.jpg'),
  'tretyakov-gallery': wikiThumb('Tretyakov_Gallery_main_entrance.jpg'),
  'hermitage-museum': wikiThumb('Saint_Petersburg_Hermitage_Museum,_Palace_Square.jpg'),
  'pushkin-museum': wikiThumb('Pushkin_museum_facade.jpg'),
  'kremlin-museum': wikiThumb('Moscow_Kremlin_from_Kamenny_bridge.jpg'),

  // ═══ TURKEY ═══
  'topkapi-palace': wikiThumb('Topkapi_palace_Constantinople.jpg'),

  // ═══ KOREA (JEJU) ═══
  'lee-jung-seop-museum': wikiPath('Lee_Jung-seob_Art_Museum_Seogwipo.jpg'),
  'gidang-art-museum': 'https://upload.wikimedia.org/wikipedia/ko/thumb/c/c5/%EA%B8%B0%EB%8B%B9%EB%AF%B8%EC%88%A0%EA%B4%80.jpg/640px-%EA%B8%B0%EB%8B%B9%EB%AF%B8%EC%88%A0%EA%B4%80.jpg',
  'soam-memorial-hall': wikiPath('소암기념관.jpg'),
  'jeju-museum-of-art': wikiPath('Jeju_Museum_of_Art.jpg'),
  'kim-tschang-yeul-art-museum': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Kim_Tschang-Yeul_Art_Museum_Jeju.jpg/640px-Kim_Tschang-Yeul_Art_Museum_Jeju.jpg',
  'dumoak': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Jeju_National_Museum.jpg/640px-Jeju_National_Museum.jpg',

  // ═══ SINGAPORE ═══
  'national-gallery-singapore': wikiThumb('National_Gallery_Singapore_2020.jpg'),

  // ═══ USA ═══
  'getty': wikiThumb('GettyCenter_Dusk.JPG'),
};

const EXHIBITIONS_PATH = '/sessions/youthful-clever-heisenberg/mnt/armin-web-main/src/data/exhibitions.js';
let content = readFileSync(EXHIBITIONS_PATH, 'utf8');

// Parse exhibitions array to get correct id → current representativeImage mapping
const exhibitions = eval(content.match(/export const exhibitions = (\[[\s\S]*\]);/)[1]);
const museumMap = {};
exhibitions.forEach(e => {
  museumMap[e.id] = e.representativeImage || '';
});

console.log('\n🔄 Updating museum images in exhibitions.js...\n');
let updated = 0, skipped = 0, notFound = 0;

for (const [id, newUrl] of Object.entries(UPDATES)) {
  if (!(id in museumMap)) {
    console.log(`  ⚠️  Not found: ${id}`);
    notFound++;
    continue;
  }

  const currentImg = museumMap[id];

  // Only update problematic images
  const isProblematic = !currentImg ||
    currentImg.includes('favicon') ||
    (currentImg.endsWith('.svg')) ||
    currentImg.endsWith('.gif') ||
    currentImg.endsWith('.ico') ||
    currentImg === '';

  if (!isProblematic) {
    skipped++;
    continue;
  }

  // Strategy: find the block containing id: "..." and within it replace representativeImage
  // Use a targeted regex to find the specific museum block
  const idPattern = new RegExp(
    `(\\{[^}]*?id:\\s*"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?representativeImage:\\s*)"([^"]*)"`,
    'g'
  );

  let found = false;
  const newContent = content.replace(idPattern, (match, prefix, oldImg) => {
    found = true;
    return `${prefix}"${newUrl}"`;
  });

  if (found) {
    content = newContent;
    console.log(`  ✅ ${id}`);
    console.log(`      "${currentImg}"`);
    console.log(`    → "${newUrl.substring(0, 80)}..."`);
    updated++;
    museumMap[id] = newUrl; // update our local map
  } else {
    // Fallback: direct string replacement of the old value
    const searchStr = `representativeImage: "${currentImg}"`;
    const replaceStr = `representativeImage: "${newUrl}"`;
    if (content.includes(searchStr)) {
      content = content.replace(searchStr, replaceStr);
      console.log(`  ✅ ${id} (fallback replace)`);
      updated++;
    } else {
      console.log(`  ⚠️  Could not replace ${id} (current: "${currentImg}")`);
      skipped++;
    }
  }
}

writeFileSync(EXHIBITIONS_PATH, content, 'utf8');
console.log(`\n📊 Updated: ${updated}, Skipped/OK: ${skipped}, Not found: ${notFound}`);
console.log(`✅ exhibitions.js saved!`);

// Final verification
const finalExhibitions = eval(readFileSync(EXHIBITIONS_PATH, 'utf8').match(/export const exhibitions = (\[[\s\S]*\]);/)[1]);
const remaining = finalExhibitions.filter(e => {
  const img = e.representativeImage || '';
  return !img || img.includes('favicon') ||
    (img.endsWith('.svg') && (img.startsWith('images/') || !img.includes('wikimedia'))) ||
    img.endsWith('.gif') || img.endsWith('.ico');
});

console.log(`\n📈 Final status:`);
console.log(`  Total museums: ${finalExhibitions.length}`);
console.log(`  With proper images: ${finalExhibitions.length - remaining.length}`);
console.log(`  Still problematic: ${remaining.length}`);
if (remaining.length > 0) {
  console.log('\n  Remaining issues:');
  remaining.forEach(e => console.log(`    - ${e.id}: "${e.representativeImage}"`));
}
