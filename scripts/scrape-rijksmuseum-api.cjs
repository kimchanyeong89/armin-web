/**
 * Rijksmuseum Painting Collection Scraper - API 버전
 * 
 * 발견된 API 사용:
 * 1. Search API: /api/v1/collection/search
 * 2. Detail API: /api/v1/collection/art?objectNodeId={id}
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'www.rijksmuseum.nl';
const SEARCH_API = '/api/v1/collection/search';
const DETAIL_API = '/api/v1/collection/art';

const OUTPUT_FILE = path.join(__dirname, '../public/data/rijksmuseum-paintings-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/rijksmuseum-api-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijksmuseum-api-log.txt');

// Rate limiting
const DELAY_BETWEEN_PAGES = 500;
const DELAY_BETWEEN_DETAILS = 300;

// 디렉토리 생성
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);
const DOWNLOADS_DIR = path.dirname(PROGRESS_FILE);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      log(`📥 진행 상황 로드: ${data.artworks?.length || 0}개 작품, 마지막 페이지: ${data.lastPage || 1}`);
      return data;
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패, 새로 시작');
    }
  }
  return { artworks: [], processedNodeIds: [], lastPage: 1 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// HTTP 요청 함수
function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 검색 API로 작품 목록 가져오기
async function fetchSearchPage(page = 1) {
  // URL 인코딩된 facets 파라미터 사용
  const path = `${SEARCH_API}?language=en&page=${page}&sortingType=Popularity&collectionSearchContext=Art&facets%5B0%5D.id=3159edbfc6b22de59dfb2522fecc2706&facets%5B0%5D.nodeRelationType=HasObjectType`;
  log(`검색 API 호출: page ${page}`);
  return fetchJSON(path);
}

// 상세 정보 API로 작품 정보 가져오기
async function fetchArtworkDetail(objectNodeId) {
  const path = `${DETAIL_API}?objectNodeId=${encodeURIComponent(objectNodeId)}&language=en`;
  return fetchJSON(path);
}

// API 응답을 표준 형식으로 변환
function transformArtwork(item, detail = null) {
  const artwork = {
    id: item.objectNumber || item.objectNodeId || '',
    objectNumber: item.objectNumber || '',
    title: item.title || '',
    artist: '',
    date: '',
    year: null,
    medium: item.physicalFeatures || '',
    dimensions: '',
    description: '',
    imageUrl: '',
    thumbnailUrl: '',
    onDisplay: false,
    displayLocation: '',
    sourceUrl: '',
    category: '', // object type
    metadata: {}
  };

  // Artist (makerSubtitleLine에서 추출)
  if (item.makerSubtitleLine) {
    // "Jan Davidsz. de Heem, 1650 - 1683" 또는 "Johannes Vermeer, c. 1660" 형식
    const parts = item.makerSubtitleLine.split(',');
    if (parts.length > 0) {
      artwork.artist = parts[0].trim();
      // 날짜 정보도 추출
      if (parts.length > 1) {
        artwork.date = parts.slice(1).join(',').trim();
        // 첫 번째 4자리 연도 추출
        const yearMatch = artwork.date.match(/\b(\d{4})\b/);
        if (yearMatch) {
          artwork.year = parseInt(yearMatch[1], 10);
        }
      }
    }
  }

  // Micrio 이미지 정보
  if (item.micrioImage && item.micrioImage.micrioId) {
    const micrioId = item.micrioImage.micrioId;
    // IIIF Micrio 이미지 URL 생성
    // 고해상도: https://iiif.micr.io/{micrioId}/full/max/0/default.jpg
    artwork.imageUrl = `https://iiif.micr.io/${micrioId}/full/max/0/default.jpg`;
    // 썸네일: 작은 크기로
    artwork.thumbnailUrl = `https://iiif.micr.io/${micrioId}/full/400,/0/default.jpg`;
  }

  // On Display 정보
  if (item.museumLocationFacet) {
    artwork.onDisplay = true;
    artwork.displayLocation = item.museumLocationFacet.value || '';
  }

  // Source URL
  if (item.objectNumber) {
    artwork.sourceUrl = `https://www.rijksmuseum.nl/en/collection/${item.objectNumber}`;
  } else if (item.objectNodeUri) {
    // objectNodeUri는 https://id.rijksmuseum.nl/200108369 형식
    const idMatch = item.objectNodeUri.match(/\/(\d+)$/);
    if (idMatch) {
      artwork.sourceUrl = `https://www.rijksmuseum.nl/en/collection/${idMatch[1]}`;
    }
  }

  // 상세 정보가 있으면 추가
  if (detail) {
    // Description
    if (detail.preferredDescription) {
      artwork.description = detail.preferredDescription;
    }

    // Dimensions
    if (detail.dimensions && Array.isArray(detail.dimensions) && detail.dimensions.length > 0) {
      // dimensions는 객체 배열일 수 있음: [{value: "379.5 cm", type: "height"}, ...]
      const dimStrings = detail.dimensions.map(dim => {
        if (typeof dim === 'string') return dim;
        if (dim.value && dim.type) return `${dim.value} (${dim.type})`;
        if (dim.value) return dim.value;
        return '';
      }).filter(d => d);
      if (dimStrings.length > 0) {
        artwork.dimensions = dimStrings.join(' × ');
      }
    }

    // Medium (Materials)
    if (detail.usedMaterial && Array.isArray(detail.usedMaterial) && detail.usedMaterial.length > 0) {
      artwork.medium = detail.usedMaterial.join(', ');
    } else if (detail.physicalFeatures && typeof detail.physicalFeatures === 'string' && detail.physicalFeatures.trim()) {
      artwork.medium = detail.physicalFeatures.trim();
    } else if (detail.usedTechnique && Array.isArray(detail.usedTechnique) && detail.usedTechnique.length > 0) {
      artwork.medium = detail.usedTechnique.join(', ');
    }

    // Object Type / Category
    if (detail.hasObjectType && Array.isArray(detail.hasObjectType) && detail.hasObjectType.length > 0) {
      artwork.category = detail.hasObjectType[0]; // 첫 번째 object type 사용 (보통 "painting")
    }

    // Date (상세 정보에서 더 정확한 정보가 있으면 업데이트)
    if (detail.dataTab && detail.dataTab.components) {
      for (const component of detail.dataTab.components) {
        if (component.title === 'Creation' && component.properties) {
          for (const prop of component.properties) {
            if (prop.name === 'Dating' && prop.values && prop.values.length > 0) {
              artwork.date = prop.values[0];
              const yearMatch = artwork.date.match(/\b(\d{4})\b/);
              if (yearMatch) {
                artwork.year = parseInt(yearMatch[1], 10);
              }
              break;
            }
          }
        }
      }
    }
  }

  return artwork;
}

async function main() {
  log('🎨 Rijksmuseum Painting Collection Scraper - API 버전');
  log('='.repeat(60));

  let progress = loadProgress();
  const processedNodeIds = new Set(progress.processedNodeIds || []);
  let artworks = progress.artworks || [];

  try {
    // 1단계: 검색 API로 작품 목록 가져오기
    log('📋 작품 목록 수집 시작...');
    let currentPage = progress.lastPage || 1;
    let hasMore = true;
    const allSearchResults = [];

    while (hasMore) {
      try {
        const searchResult = await fetchSearchPage(currentPage);
        
        if (searchResult.artObjects && Array.isArray(searchResult.artObjects)) {
          log(`페이지 ${currentPage}: ${searchResult.artObjects.length}개 작품 발견`);
          allSearchResults.push(...searchResult.artObjects);
          
          // 다음 페이지 확인 (artObjects가 20개 미만이면 마지막 페이지)
          if (searchResult.artObjects.length < 20) {
            hasMore = false;
          } else {
            currentPage++;
            await sleep(DELAY_BETWEEN_PAGES);
          }
        } else {
          log(`페이지 ${currentPage}: 결과 없음`);
          hasMore = false;
        }
      } catch (error) {
        log(`⚠️ 페이지 ${currentPage} 오류: ${error.message}`);
        hasMore = false;
      }
    }

    log(`✅ 총 ${allSearchResults.length}개 작품 목록 수집 완료`);

    // 2단계: 각 작품의 상세 정보 가져오기 (dimensions, medium 등 추가 정보)
    log(`\n📊 상세 정보 수집 시작...`);
    const startIndex = artworks.length;

    for (let i = startIndex; i < allSearchResults.length; i++) {
      const item = allSearchResults[i];
      const objectNodeId = item.objectNodeId;

      if (!objectNodeId || processedNodeIds.has(objectNodeId)) {
        continue;
      }

      process.stdout.write(`\r📄 ${i + 1}/${allSearchResults.length} 처리 중...`);

      try {
        // 상세 정보 가져오기 (dimensions, medium 등)
        const detail = await fetchArtworkDetail(objectNodeId);
        const artwork = transformArtwork(item, detail);
        artworks.push(artwork);
        processedNodeIds.add(objectNodeId);
      } catch (error) {
        // 상세 정보 실패해도 기본 정보는 사용
        const artwork = transformArtwork(item, null);
        artworks.push(artwork);
        processedNodeIds.add(objectNodeId);
        log(`⚠️ 상세 정보 가져오기 실패 (${objectNodeId}): ${error.message}`);
      }

      // 진행 상황 저장 (매 20개마다)
      if ((i + 1) % 20 === 0) {
        progress.artworks = artworks;
        progress.processedNodeIds = Array.from(processedNodeIds);
        progress.lastPage = currentPage;
        saveProgress(progress);
        process.stdout.write(' 💾');
      }

      await sleep(DELAY_BETWEEN_DETAILS);
    }

    log('\n✅ 모든 작품 수집 완료');

    // 최종 저장
    const output = {
      museum: 'Rijksmuseum',
      collection: 'Paintings',
      website: 'https://www.rijksmuseum.nl',
      scraped_date: new Date().toISOString(),
      total_count: artworks.length,
      artworks: artworks
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    log(`💾 최종 파일 저장: ${OUTPUT_FILE}`);
    log(`📊 총 ${artworks.length}개 작품 수집 완료`);

  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  }
}

main().catch(console.error);
