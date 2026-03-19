/**
 * fix-museum-images.mjs
 *
 * 1) 88개의 문제있는 미술관 이미지를 수집 (Wikipedia API + 직접 URL)
 * 2) 이미지를 다운로드하여 Cloudflare R2에 업로드
 * 3) exhibitions.js의 representativeImage를 R2 URL로 업데이트
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import https from 'https';
import http from 'http';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ── R2 Config ─────────────────────────────────────────────────────────────────
const R2_ACCOUNT_ID = '6ce5ae60b244951ac36ffd277fd6ef76';
const R2_ACCESS_KEY_ID = 'dd3d2a42f7c7fdae26cae7f226890716';
const R2_SECRET_ACCESS_KEY = 'b553415f73881914c052fc7bd0c3c8700879a7200f018696abff22c7cd815897';
const R2_BUCKET = 'armin-gallery-images';
const R2_PUBLIC_URL = 'https://pub-6ce5ae60b244951ac36ffd277fd6ef76.r2.dev';
const R2_PREFIX = 'armin-web/museum-logos';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const BASE_DIR = '/sessions/youthful-clever-heisenberg/mnt/armin-web-main';
const TMP_DIR = join(BASE_DIR, 'tmp-museum-logos');
if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

// ── Known-good replacement URLs ────────────────────────────────────────────────
// Priority: Wikimedia Commons (stable, free) > official museum site > other
const REPLACEMENTS = {
  // === CHINA ===
  'guangdong-museum-of-art': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Guangdong_Museum_of_Art_1.jpg/640px-Guangdong_Museum_of_Art_1.jpg',
    wikiTitle: 'Guangdong Museum of Art'
  },
  'power-station-of-art': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/PSA_Shanghai_%282016%29.jpg/640px-PSA_Shanghai_%282016%29.jpg',
    wikiTitle: 'Power Station of Art'
  },
  'shanghai-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Shanghai_Museum.jpg/640px-Shanghai_Museum.jpg',
    wikiTitle: 'Shanghai Museum'
  },
  'nanjing-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Nanjing_Museum_Entrance.jpg/640px-Nanjing_Museum_Entrance.jpg',
    wikiTitle: 'Nanjing Museum'
  },
  'national-museum-of-china': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/National_Museum_of_China_2017.jpg/640px-National_Museum_of_China_2017.jpg',
    wikiTitle: 'National Museum of China'
  },
  'shenzhen-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Shenzhen_Museum_%28new_building%29.jpg/640px-Shenzhen_Museum_%28new_building%29.jpg',
    wikiTitle: 'Shenzhen Museum'
  },

  // === JAPAN ===
  'nich-tnm': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Tokyo_National_Museum%2C_Honkan_2010.jpg/640px-Tokyo_National_Museum%2C_Honkan_2010.jpg',
    wikiTitle: 'Tokyo National Museum'
  },
  'tobikan-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Tokyo_Metropolitan_Art_Museum_2012.jpg/640px-Tokyo_Metropolitan_Art_Museum_2012.jpg',
    wikiTitle: 'Tokyo Metropolitan Art Museum'
  },

  // === HONG KONG / TAIWAN ===
  'mplus': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/M%2B_museum_Hong_Kong_2021.jpg/640px-M%2B_museum_Hong_Kong_2021.jpg',
    wikiTitle: 'M+ (museum)'
  },
  'tfam': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Taipei_Fine_Arts_Museum.jpg/640px-Taipei_Fine_Arts_Museum.jpg',
    wikiTitle: 'Taipei Fine Arts Museum'
  },

  // === UK — use existing local files where available ===
  'tate-modern': { localFile: 'images/tate-modern.jpg' },
  'tate-britain': { localFile: 'images/tate-britain-building.jpg' },
  'national-gallery': { localFile: 'images/national-gallery.jpg' },
  'national-portrait-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/National_Portrait_Gallery%2C_London.JPG/640px-National_Portrait_Gallery%2C_London.JPG',
    wikiTitle: 'National Portrait Gallery, London'
  },
  'vam': { localFile: 'images/vam.jpg' },
  'tate-liverpool': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Tate_Liverpool_2006.jpg/640px-Tate_Liverpool_2006.jpg',
    wikiTitle: 'Tate Liverpool'
  },
  'tate-st-ives': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Tate_St_Ives_exterior.jpg/640px-Tate_St_Ives_exterior.jpg',
    wikiTitle: 'Tate St Ives'
  },
  'scottish-national-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Scottish_National_Gallery%2C_Edinburgh.jpg/640px-Scottish_National_Gallery%2C_Edinburgh.jpg',
    wikiTitle: 'Scottish National Gallery'
  },
  'royal-academy': { localFile: 'images/royal-academy-rep.jpg' },
  'serpentine-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Serpentine_Gallery_2014.jpg/640px-Serpentine_Gallery_2014.jpg',
    wikiTitle: 'Serpentine Galleries'
  },
  'dulwich-picture-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Dulwich_Picture_Gallery_01.jpg/640px-Dulwich_Picture_Gallery_01.jpg',
    wikiTitle: 'Dulwich Picture Gallery'
  },
  'courtauld-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Somerset_House_%28London%29_%282014%29.jpg/640px-Somerset_House_%28London%29_%282014%29.jpg',
    wikiTitle: 'Courtauld Gallery'
  },
  'manchester-art-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Manchester_Art_Gallery_2009.jpg/640px-Manchester_Art_Gallery_2009.jpg',
    wikiTitle: 'Manchester Art Gallery'
  },
  'walker-art-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Walker_Art_Gallery_Liverpool.jpg/640px-Walker_Art_Gallery_Liverpool.jpg',
    wikiTitle: 'Walker Art Gallery'
  },
  'scottish-national-portrait-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Scottish_National_Portrait_Gallery.jpg/640px-Scottish_National_Portrait_Gallery.jpg',
    wikiTitle: 'Scottish National Portrait Gallery'
  },
  'scottish-national-gallery-of-modern-art': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Scottish_National_Gallery_of_Modern_Art%2C_Edinburgh.jpg/640px-Scottish_National_Gallery_of_Modern_Art%2C_Edinburgh.jpg',
    wikiTitle: 'Scottish National Gallery of Modern Art'
  },
  'british-museum': { localFile: 'images/british-museum.jpg' },
  'hayward-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Hayward_Gallery%2C_London.jpg/640px-Hayward_Gallery%2C_London.jpg',
    wikiTitle: 'Hayward Gallery'
  },
  'wallace-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Wallace_Collection_-_Manchester_Square.jpg/640px-Wallace_Collection_-_Manchester_Square.jpg',
    wikiTitle: 'Wallace Collection'
  },
  'soane-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Sir_John_Soane%27s_Museum%2C_exterior_2023.jpg/640px-Sir_John_Soane%27s_Museum%2C_exterior_2023.jpg',
    wikiTitle: "Sir John Soane's Museum"
  },
  'museum-wales': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Cardiff_-_National_Museum_-_Exterior.jpg/640px-Cardiff_-_National_Museum_-_Exterior.jpg',
    wikiTitle: 'National Museum Wales'
  },

  // === FRANCE ===
  'musee-du-louvre': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Louvre_Museum_Wikimedia_Commons.jpg/640px-Louvre_Museum_Wikimedia_Commons.jpg',
    wikiTitle: 'Louvre'
  },
  'musee-dorsay': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Mus%C3%A9e_d%27Orsay%2C_North_face%2C_2019.jpg/640px-Mus%C3%A9e_d%27Orsay%2C_North_face%2C_2019.jpg',
    wikiTitle: "Musée d'Orsay"
  },
  'centre-pompidou': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Centre_Georges_Pompidou%2C_Paris_2013.jpg/640px-Centre_Georges_Pompidou%2C_Paris_2013.jpg',
    wikiTitle: 'Centre Pompidou'
  },
  'musee-de-lorangerie': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Mus%C3%A9e_de_l%27Orangerie_-_facade_principale_2012.jpg/640px-Mus%C3%A9e_de_l%27Orangerie_-_facade_principale_2012.jpg',
    wikiTitle: "Musée de l'Orangerie"
  },
  'bourse-de-commerce-pinault-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Bourse_de_commerce_de_Paris_2022.jpg/640px-Bourse_de_commerce_de_Paris_2022.jpg',
    wikiTitle: 'Bourse de Commerce'
  },
  'musee-dart-moderne-de-paris': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Pal%C3%A1cio_de_Tóquio%2C_Paris%2C_França.jpg/640px-Pal%C3%A1cio_de_Tóquio%2C_Paris%2C_França.jpg',
    wikiTitle: 'Musée d\'Art Moderne de Paris'
  },
  'musee-marmottan-monet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Mus%C3%A9e_Marmottan-Monet%2C_Paris_2015.jpg/640px-Mus%C3%A9e_Marmottan-Monet%2C_Paris_2015.jpg',
    wikiTitle: 'Musée Marmottan Monet'
  },
  'musee-jacquemart-andre': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Mus%C3%A9e_Jacquemart-Andr%C3%A9%2C_Paris_2012.jpg/640px-Mus%C3%A9e_Jacquemart-Andr%C3%A9%2C_Paris_2012.jpg',
    wikiTitle: 'Musée Jacquemart-André'
  },
  'jeu-de-paume': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Jeu_de_Paume_Paris_2014.jpg/640px-Jeu_de_Paume_Paris_2014.jpg',
    wikiTitle: 'Jeu de Paume (Paris)'
  },
  'maison-europeenne-de-la-photographie': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Maison_Europ%C3%A9enne_de_la_Photographie_%28Paris%29.jpg/640px-Maison_Europ%C3%A9enne_de_la_Photographie_%28Paris%29.jpg',
    wikiTitle: 'Maison Européenne de la Photographie'
  },
  'palais-de-tokyo': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Palais_de_Tokyo_2012.jpg/640px-Palais_de_Tokyo_2012.jpg',
    wikiTitle: 'Palais de Tokyo'
  },
  'palais-des-beaux-arts-de-lille': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Palais_des_beaux-arts_de_Lille%2C_facade.jpg/640px-Palais_des_beaux-arts_de_Lille%2C_facade.jpg',
    wikiTitle: 'Palais des Beaux-Arts de Lille'
  },
  'musee-des-beaux-arts-de-rouen': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Mus%C3%A9e_des_Beaux-Arts_de_Rouen.jpg/640px-Mus%C3%A9e_des_Beaux-Arts_de_Rouen.jpg',
    wikiTitle: 'Musée des Beaux-Arts de Rouen'
  },
  'musee-des-beaux-arts-de-lyon': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Mus%C3%A9e_des_beaux-arts_de_Lyon%2C_facade.jpg/640px-Mus%C3%A9e_des_beaux-arts_de_Lyon%2C_facade.jpg',
    wikiTitle: 'Musée des Beaux-Arts de Lyon'
  },
  'musee-conde': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Chantilly_-_Chateau_-_vue_g%C3%A9n%C3%A9rale.jpg/640px-Chantilly_-_Chateau_-_vue_g%C3%A9n%C3%A9rale.jpg',
    wikiTitle: 'Musée Condé'
  },
  'musee-toulouse-lautrec': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Palais_de_la_Berbie.jpg/640px-Palais_de_la_Berbie.jpg',
    wikiTitle: 'Musée Toulouse-Lautrec'
  },
  'musee-de-grenoble': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Mus%C3%A9e_de_Grenoble_-_facade.jpg/640px-Mus%C3%A9e_de_Grenoble_-_facade.jpg',
    wikiTitle: 'Musée de Grenoble'
  },
  'musee-granet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Musee_Granet-_Aix-en-Provence_%28low-res%29.jpg/640px-Musee_Granet-_Aix-en-Provence_%28low-res%29.jpg',
    wikiTitle: 'Musée Granet'
  },
  'mamcs-strasbourg': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Strasbourg_MAMCS_2008.jpg/640px-Strasbourg_MAMCS_2008.jpg',
    wikiTitle: 'Musée d\'Art Moderne et Contemporain de Strasbourg'
  },
  'musee-des-beaux-arts-de-bordeaux': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Mus%C3%A9e_des_beaux-arts_de_Bordeaux%2C_facade.jpg/640px-Mus%C3%A9e_des_beaux-arts_de_Bordeaux%2C_facade.jpg',
    wikiTitle: 'Musée des Beaux-Arts de Bordeaux'
  },
  'musee-rodin': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Hotel-biron.jpg/640px-Hotel-biron.jpg',
    wikiTitle: 'Musée Rodin'
  },
  'fondation-louis-vuitton': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Fondation_Louis_Vuitton_2014.jpg/640px-Fondation_Louis_Vuitton_2014.jpg',
    wikiTitle: 'Fondation Louis Vuitton'
  },
  'mad-paris': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Musee_des_Arts_Decoratifs_Paris_2013.jpg/640px-Musee_des_Arts_Decoratifs_Paris_2013.jpg',
    wikiTitle: 'Musée des Arts Décoratifs, Paris'
  },
  'carnavalet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Musee_Carnavalet_-_Hotel_Carnavalet_-_Paris.jpg/640px-Musee_Carnavalet_-_Hotel_Carnavalet_-_Paris.jpg',
    wikiTitle: 'Musée Carnavalet'
  },
  'musee-armee': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/H%C3%B4tel_des_Invalides_-_Dôme_des_Invalides_-_Paris_-_Exterior.jpg/640px-H%C3%B4tel_des_Invalides_-_Dôme_des_Invalides_-_Paris_-_Exterior.jpg',
    wikiTitle: 'Musée de l\'Armée'
  },
  'chateau-de-versailles': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Versailles_Palace_Royal_Court.jpg/640px-Versailles_Palace_Royal_Court.jpg',
    wikiTitle: 'Palace of Versailles'
  },
  'musee-guimet': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Mus%C3%A9e_Guimet%2C_Paris_-_ext%C3%A9rieur_%28cropped%29.jpg/640px-Mus%C3%A9e_Guimet%2C_Paris_-_ext%C3%A9rieur_%28cropped%29.jpg',
    wikiTitle: 'Musée Guimet'
  },
  'macval': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Mac_Val%2C_Vitry-sur-Seine.jpg/640px-Mac_Val%2C_Vitry-sur-Seine.jpg',
    wikiTitle: 'MAC VAL'
  },
  'mucem': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/MUCEM%2C_Marseille%2C_2013.jpg/640px-MUCEM%2C_Marseille%2C_2013.jpg',
    wikiTitle: 'MuCEM'
  },
  'musee-fabre': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Musee_Fabre_Montpellier_2015.jpg/640px-Musee_Fabre_Montpellier_2015.jpg',
    wikiTitle: 'Musée Fabre'
  },
  'musee-chagall': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Mus%C3%A9e_national_Marc-Chagall%2C_Nice.jpg/640px-Mus%C3%A9e_national_Marc-Chagall%2C_Nice.jpg',
    wikiTitle: 'Musée national Marc Chagall'
  },
  'la-piscine': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/La_Piscine_Mus%C3%A9e%2C_Roubaix.jpg/640px-La_Piscine_Mus%C3%A9e%2C_Roubaix.jpg',
    wikiTitle: 'La Piscine (museum)'
  },
  'musee-matisse-nice': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Nice_mus%C3%A9e_Matisse.jpg/640px-Nice_mus%C3%A9e_Matisse.jpg',
    wikiTitle: 'Musée Matisse, Nice'
  },

  // === SPAIN ===
  'museu-picasso-barcelona': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Museu_Picasso_Barcelona_2011.jpg/640px-Museu_Picasso_Barcelona_2011.jpg',
    wikiTitle: 'Museu Picasso'
  },
  'dali-foundation': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Teatro-Museo_Dali_de_Figueres.jpg/640px-Teatro-Museo_Dali_de_Figueres.jpg',
    wikiTitle: 'Dalí Theatre and Museum'
  },
  'caixaforum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/CaixaForum_Madrid.JPG/640px-CaixaForum_Madrid.JPG',
    wikiTitle: 'CaixaForum'
  },

  // === SWITZERLAND ===
  'kunsthaus-zurich': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Kunsthaus_Z%C3%BCrich_2012.jpg/640px-Kunsthaus_Z%C3%BCrich_2012.jpg',
    wikiTitle: 'Kunsthaus Zürich'
  },
  'mah-geneva': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Geneva%2C_Mus%C3%A9e_d%27art_et_d%27histoire%2C_facade.jpg/640px-Geneva%2C_Mus%C3%A9e_d%27art_et_d%27histoire%2C_facade.jpg',
    wikiTitle: "Musée d'art et d'histoire (Geneva)"
  },

  // === CZECH REPUBLIC ===
  'national-gallery-prague': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Sternberg_Palace_01.jpg/640px-Sternberg_Palace_01.jpg',
    wikiTitle: 'National Gallery Prague'
  },

  // === NORDIC ===
  'smk-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Statens_Museum_for_Kunst_-_Copenhagen.jpg/640px-Statens_Museum_for_Kunst_-_Copenhagen.jpg',
    wikiTitle: 'Statens Museum for Kunst'
  },
  'ateneum-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Ateneum_Helsinki.jpg/640px-Ateneum_Helsinki.jpg',
    wikiTitle: 'Ateneum'
  },
  'kiasma-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Kiasma_Helsinki_2011.jpg/640px-Kiasma_Helsinki_2011.jpg',
    wikiTitle: 'Kiasma'
  },
  'sinebrychoff-collection': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Helsinki_-_Sinebrychoff_Art_Museum.jpg/640px-Helsinki_-_Sinebrychoff_Art_Museum.jpg',
    wikiTitle: 'Sinebrychoff Art Museum'
  },

  // === RUSSIA ===
  'state-russian-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Mikhailovsky_Palace%2C_Mikhailovsky_Square.jpg/640px-Mikhailovsky_Palace%2C_Mikhailovsky_Square.jpg',
    wikiTitle: 'Russian Museum'
  },
  'tretyakov-gallery': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Tretyakov_Gallery_Main_Entrance.jpg/640px-Tretyakov_Gallery_Main_Entrance.jpg',
    wikiTitle: 'Tretyakov Gallery'
  },
  'hermitage-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Hermitage_museum.jpg/640px-Hermitage_museum.jpg',
    wikiTitle: 'Hermitage Museum'
  },
  'pushkin-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Pushkin_Museum_02.jpg/640px-Pushkin_Museum_02.jpg',
    wikiTitle: 'Pushkin Museum of Fine Arts'
  },
  'kremlin-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Moscow_Kremlin_from_Kamenny_bridge.jpg/640px-Moscow_Kremlin_from_Kamenny_bridge.jpg',
    wikiTitle: 'Moscow Kremlin Museums'
  },

  // === TURKEY ===
  'topkapi-palace': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Topkapi_palace_Constantinople.jpg/640px-Topkapi_palace_Constantinople.jpg',
    wikiTitle: 'Topkapı Palace'
  },

  // === KOREA ===
  'lee-jung-seop-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Lee_Jung-seob_Art_Museum_Seogwipo.jpg/640px-Lee_Jung-seob_Art_Museum_Seogwipo.jpg',
    wikiTitle: 'Lee Jung-seob Art Museum'
  },
  'gidang-art-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/ko/thumb/c/c5/기당미술관.jpg/640px-기당미술관.jpg',
    wikiTitle: '기당미술관'
  },
  'soam-memorial-hall': {
    url: 'https://upload.wikimedia.org/wikipedia/ko/thumb/7/7c/소암기념관.jpg/640px-소암기념관.jpg',
    wikiTitle: '소암기념관'
  },
  'jeju-museum-of-art': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Jeju_Museum_of_Art.jpg/640px-Jeju_Museum_of_Art.jpg',
    wikiTitle: 'Jeju Museum of Art'
  },
  'kim-tschang-yeul-art-museum': {
    url: 'https://upload.wikimedia.org/wikipedia/ko/thumb/e/e8/이중섭미술관.jpg/640px-이중섭미술관.jpg',
    wikiTitle: '김창열미술관'
  },
  'dumoak': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Jeju_National_Museum.jpg/640px-Jeju_National_Museum.jpg',
    wikiTitle: 'Jeju'
  },

  // === SINGAPORE ===
  'national-gallery-singapore': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/National_Gallery_Singapore%2C_August_2020.jpg/640px-National_Gallery_Singapore%2C_August_2020.jpg',
    wikiTitle: 'National Gallery Singapore'
  },

  // === USA ===
  'getty': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/The_Getty_Center_-_panoramio.jpg/640px-The_Getty_Center_-_panoramio.jpg',
    wikiTitle: 'Getty Center'
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ArminGallery/1.0)',
        ...options.headers
      },
      timeout: 15000,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, options));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || 'image/jpeg' }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// Use Wikipedia API to get the best image for a museum
async function fetchWikipediaImage(title) {
  const encoded = encodeURIComponent(title);
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encoded}&prop=pageimages&format=json&pithumbsize=640&pilicense=any`;
  try {
    const { buffer } = await fetchUrl(apiUrl, { headers: { 'Accept': 'application/json' } });
    const data = JSON.parse(buffer.toString());
    const pages = data.query?.pages || {};
    for (const page of Object.values(pages)) {
      if (page.thumbnail?.source) return page.thumbnail.source;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function uploadToR2(buffer, key, contentType) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    }));
    return `${R2_PUBLIC_URL}/${key}`;
  } catch (e) {
    console.error(`  R2 upload failed for ${key}: ${e.message}`);
    return null;
  }
}

function getExt(contentType, fallback = 'jpg') {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('svg')) return 'svg';
  return fallback;
}

// ── Main ───────────────────────────────────────────────────────────────────────
const EXHIBITIONS_PATH = join(BASE_DIR, 'src/data/exhibitions.js');
const content = readFileSync(EXHIBITIONS_PATH, 'utf8');
const match = content.match(/export const exhibitions = (\[[\s\S]*\]);/);
if (!match) throw new Error('Could not parse exhibitions.js');
let exhibitions = eval(match[1]);

const updates = {}; // id → new URL
let success = 0, failed = 0;

for (const [id, cfg] of Object.entries(REPLACEMENTS)) {
  const museum = exhibitions.find(e => e.id === id);
  if (!museum) {
    console.log(`  ⚠️  Not found in data: ${id}`);
    continue;
  }

  // Handle local file references (already exist in public/)
  if (cfg.localFile) {
    const localPath = join(BASE_DIR, 'public', cfg.localFile);
    if (existsSync(localPath)) {
      console.log(`  📁 ${id}: Using existing local file ${cfg.localFile}`);
      updates[id] = cfg.localFile;
      success++;
      continue;
    }
    console.log(`  ⚠️  Local file not found: ${cfg.localFile}`);
    // Fall through to try URL
  }

  let imageUrl = cfg.url;

  // If we have a wikiTitle but no URL, or URL failed, try Wikipedia API
  if (!imageUrl && cfg.wikiTitle) {
    console.log(`  🔍 ${id}: Fetching from Wikipedia API for "${cfg.wikiTitle}"`);
    imageUrl = await fetchWikipediaImage(cfg.wikiTitle);
    if (imageUrl) {
      console.log(`  ✓ Found Wikipedia image: ${imageUrl}`);
    }
  }

  if (!imageUrl) {
    console.log(`  ✗ ${id}: No image URL found`);
    failed++;
    continue;
  }

  // Download image
  let buffer, contentType;
  try {
    const result = await fetchUrl(imageUrl);
    buffer = result.buffer;
    contentType = result.contentType;
    console.log(`  ⬇️  ${id}: Downloaded ${buffer.length} bytes (${contentType})`);
  } catch (e) {
    // Try Wikipedia API as fallback
    if (cfg.wikiTitle) {
      console.log(`  ↩️  ${id}: Direct download failed, trying Wikipedia API...`);
      const wikiUrl = await fetchWikipediaImage(cfg.wikiTitle);
      if (wikiUrl) {
        try {
          const result = await fetchUrl(wikiUrl);
          buffer = result.buffer;
          contentType = result.contentType;
          imageUrl = wikiUrl;
          console.log(`  ✓ ${id}: Downloaded via Wikipedia API: ${buffer.length} bytes`);
        } catch (e2) {
          console.log(`  ✗ ${id}: All downloads failed: ${e2.message}`);
          failed++;
          continue;
        }
      } else {
        console.log(`  ✗ ${id}: Wikipedia API returned no image: ${e.message}`);
        failed++;
        continue;
      }
    } else {
      console.log(`  ✗ ${id}: Download failed: ${e.message}`);
      failed++;
      continue;
    }
  }

  // Skip SVGs (keep using direct URL instead)
  if (contentType.includes('svg') || imageUrl.endsWith('.svg')) {
    // For SVG, just use the URL directly if it's external, or upload as-is
    // But we want raster images, so try Wikipedia API instead
    if (cfg.wikiTitle) {
      console.log(`  ↩️  ${id}: Got SVG, trying Wikipedia API for raster image...`);
      const wikiUrl = await fetchWikipediaImage(cfg.wikiTitle);
      if (wikiUrl && !wikiUrl.endsWith('.svg')) {
        try {
          const result = await fetchUrl(wikiUrl);
          buffer = result.buffer;
          contentType = result.contentType;
          imageUrl = wikiUrl;
          console.log(`  ✓ ${id}: Got raster from Wikipedia: ${buffer.length} bytes`);
        } catch (e) {
          // Use direct URL as fallback
          console.log(`  ⚠️  ${id}: Using direct URL (SVG): ${imageUrl}`);
          updates[id] = imageUrl;
          success++;
          continue;
        }
      } else {
        updates[id] = imageUrl;
        success++;
        continue;
      }
    }
  }

  // Check minimum size (avoid tiny images)
  if (buffer.length < 5000) {
    console.log(`  ⚠️  ${id}: Image too small (${buffer.length} bytes), trying Wikipedia...`);
    if (cfg.wikiTitle) {
      const wikiUrl = await fetchWikipediaImage(cfg.wikiTitle);
      if (wikiUrl) {
        try {
          const result = await fetchUrl(wikiUrl);
          buffer = result.buffer;
          contentType = result.contentType;
          imageUrl = wikiUrl;
          console.log(`  ✓ ${id}: Better image from Wikipedia: ${buffer.length} bytes`);
        } catch (e) { /* use what we have */ }
      }
    }
    if (buffer.length < 5000) {
      console.log(`  ✗ ${id}: Still too small, skipping`);
      failed++;
      continue;
    }
  }

  // Upload to R2
  const ext = getExt(contentType);
  const r2Key = `${R2_PREFIX}/${id}.${ext}`;
  console.log(`  ☁️  ${id}: Uploading to R2 as ${r2Key}...`);
  const r2Url = await uploadToR2(buffer, r2Key, contentType);

  if (r2Url) {
    updates[id] = r2Url;
    success++;
    console.log(`  ✅ ${id}: ${r2Url}`);
  } else {
    // Fall back to using the source URL directly
    updates[id] = imageUrl;
    success++;
    console.log(`  ⚠️  ${id}: R2 failed, using source URL: ${imageUrl}`);
  }
}

console.log(`\n📊 Summary: ${success} succeeded, ${failed} failed`);
console.log(`\n🖊️  Updating exhibitions.js...`);

// Apply updates to exhibitions.js
let updatedContent = content;
for (const [id, newUrl] of Object.entries(updates)) {
  const museum = exhibitions.find(e => e.id === id);
  if (!museum) continue;

  const oldImg = museum.representativeImage || '';
  // Escape the old URL for regex
  const escapedOld = oldImg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build replacement pattern - find the representativeImage line for this specific museum
  // We need to find the right occurrence. Use context-aware replacement.
  const searchStr = `representativeImage: "${oldImg}"`;
  const replaceStr = `representativeImage: "${newUrl}"`;

  if (updatedContent.includes(searchStr)) {
    // Only replace the first occurrence (ordered by id, so this is fine for unique values)
    // But we need to handle duplicates - find the museum's section
    updatedContent = updatedContent.replace(searchStr, replaceStr);
    console.log(`  ✓ Updated ${id}: "${oldImg}" → "${newUrl}"`);
  } else {
    console.log(`  ⚠️  Could not find "${searchStr}" for ${id}`);
  }
}

// Write updated file
writeFileSync(EXHIBITIONS_PATH, updatedContent, 'utf8');
console.log(`\n✅ exhibitions.js updated successfully!`);

// Write results report
const reportPath = join(BASE_DIR, 'museum-images-report.json');
writeFileSync(reportPath, JSON.stringify({ success, failed, updates }, null, 2));
console.log(`📋 Report saved to museum-images-report.json`);
