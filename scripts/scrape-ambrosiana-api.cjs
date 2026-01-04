/**
 * Pinacoteca Ambrosiana - API 기반 스크래퍼
 * 
 * API: https://www.ambrosiana.it/en/wp-json/comwork/v1/unifiedentity
 * IIIF: https://cmw-iiif.azurewebsites.net/iiif/2/{imageId}/full/800,/0/default.jpg
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const APP_ID = 'c710d365-89fe-4cf0-901b-965c8aa7f7e3';
const API_BASE = 'https://www.ambrosiana.it/en/wp-json/comwork/v1';
const OUTPUT_FILE = path.join(__dirname, '../public/data/ambrosiana-collection.json');

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// https로 JSON fetch
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error'));
        }
      });
    }).on('error', reject);
  });
}

// IIIF URL에서 이미지 URL 생성
function getImageUrl(imageData, coverUrl) {
  // 1. IIIF 이미지가 있으면 사용
  if (imageData && imageData.imageUrl) {
    return `${imageData.imageUrl}/full/800,/0/default.jpg`;
  }
  // 2. cover URL 사용 (thumbnail 대신 원본)
  if (coverUrl) {
    // thumbnail 제거하고 원본 URL 사용
    return coverUrl.replace('/thumbnail', '');
  }
  return '';
}

// 아티스트 이름 정리
function cleanArtist(creators) {
  if (!creators || creators.length === 0) return 'Unknown';
  let name = creators[0].name || 'Unknown';
  // "(1791/ 1882)" 같은 연도 제거
  name = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // 쉼표나 특수문자 정리
  name = name.replace(/[,;]/g, '').trim();
  return name || 'Unknown';
}

// 연도 추출
function extractYear(dates, subtitle) {
  if (!dates || dates.length === 0) {
    // subtitle에서 연도 추출 시도: "(1477-1478 ca./ 1510)"
    if (subtitle) {
      const match = subtitle.match(/\((\d{4})[^)]*\/\s*(\d{4})\)/);
      if (match) {
        return `${match[1]}–${match[2]}`;
      }
      const singleMatch = subtitle.match(/\((\d{4})/);
      if (singleMatch) {
        return singleMatch[1];
      }
    }
    return '';
  }
  
  const date = dates[0];
  
  // YEAR 타입
  if (date.earliestYear?.year) {
    const early = date.earliestYear.year;
    const late = date.latestYear?.year;
    if (late && late !== early) {
      return `${early}–${late}`;
    }
    return String(early);
  }
  
  // CENTURY 타입 - dateString 사용
  if (date.dateString) {
    return date.dateString;
  }
  
  // earliestCentury에서 추출
  if (date.earliestCentury?.century) {
    const qualifier = date.earliestCentury.centuryQualifier || '';
    return qualifier ? `${qualifier} ${date.earliestCentury.century}` : date.earliestCentury.century;
  }
  
  return '';
}

// 크기 추출
function extractDimensions(dimensions) {
  if (!dimensions || dimensions.length === 0) return '';
  const parts = [];
  for (const dim of dimensions) {
    if (dim.dimension && dim.dimensionValue) {
      parts.push(`${dim.dimensionValue} ${dim.measurementUnit || 'cm'} (${dim.dimension})`);
    }
  }
  return parts.join(' × ');
}

// 재료/기법 추출
function extractMedium(materials) {
  if (!materials || materials.length === 0) return '';
  const parts = [];
  for (const mat of materials) {
    if (mat.technique && mat.technique.length > 0) {
      parts.push(...mat.technique);
    }
    if (mat.material) {
      parts.push(mat.material);
    }
  }
  return parts.join(', ');
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      console.log(`  HTTP ${res.status} for ${url.substring(0, 80)}`);
    } catch (e) {
      console.log(`  Fetch error (attempt ${i + 1}): ${e.message}`);
    }
    await delay(1000);
  }
  return null;
}

async function main() {
  console.log('📚 Pinacoteca Ambrosiana API 스크래핑 시작\n');
  
  // 1. 전체 목록 가져오기
  console.log('목록 가져오는 중...');
  const listUrl = `${API_BASE}/unifiedentity?appid=${APP_ID}&lang=en&page=0&size=2000`;
  const listData = await fetchJson(listUrl);
  
  if (!listData || !listData.result) {
    console.error('목록을 가져올 수 없습니다');
    console.log('Response keys:', Object.keys(listData || {}));
    return;
  }
  
  console.log(`총 ${listData.result.length}개 항목 발견 (전체: ${listData.totalSize})\n`);
  
  const objects = [];
  
  for (let i = 0; i < listData.result.length; i++) {
    const item = listData.result[i];
    
    // 상세 정보 가져오기
    const detailUrl = `${API_BASE}/unifiedentity/${item.guid}?appid=${APP_ID}&lang=en`;
    let detail;
    try {
      detail = await fetchJson(detailUrl);
    } catch (e) {
      console.log(`[${i + 1}/${listData.result.length}] ✗ 스킵: ${item.title?.substring(0, 30)}`);
      continue;
    }
    
    if (!detail) {
      console.log(`[${i + 1}/${listData.result.length}] ✗ 스킵: ${item.title?.substring(0, 30)}`);
      continue;
    }
    
    const catalogData = detail.dataDetails?.catalogueObject || {};
    
    const artwork = {
      id: `ambrosiana-${item.guid}`,
      title: detail.title || 'Untitled',
      artist: cleanArtist(catalogData.creators),
      year: extractYear(catalogData.dates, detail.subtitle),
      medium: extractMedium(catalogData.materials),
      dimensions: extractDimensions(catalogData.dimensions),
      type: detail.objectType || catalogData.objectName || 'artwork',
      room: '',
      image: getImageUrl(detail.image, detail.cover),
      url: `https://www.ambrosiana.it/en/pinacoteca-collections/#/dettaglio/${item.guid}`
    };
    
    objects.push(artwork);
    
    const hasImage = artwork.image ? '✓' : '✗';
    console.log(`[${i + 1}/${listData.result.length}] ${hasImage} ${artwork.title.substring(0, 35)} - ${artwork.artist.substring(0, 20)}`);
    
    // Rate limiting
    if ((i + 1) % 50 === 0) {
      await delay(1000);
    } else {
      await delay(100);
    }
  }
  
  // 결과 저장
  const collection = {
    id: 'pinacoteca-ambrosiana',
    title: 'Pinacoteca Ambrosiana',
    museum: 'Pinacoteca Ambrosiana',
    location: 'Milan, Italy',
    description: 'One of Milan\'s most important art galleries, housing masterpieces by Leonardo da Vinci, Caravaggio, Raphael, and other Renaissance masters.',
    coverImage: objects[0]?.image || '',
    website: 'https://www.ambrosiana.it/en/pinacoteca-collections/',
    objects: objects
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));
  
  console.log(`\n✅ 완료: ${objects.length}개 작품`);
  console.log(`📁 저장: ${OUTPUT_FILE}`);
}

main().catch(console.error);
