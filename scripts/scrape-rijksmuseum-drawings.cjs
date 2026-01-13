/**
 * Rijksmuseum Drawings Collection Scraper - API 버전
 * Facet ID: c4837a33241400022d46dedaed28fd91
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'www.rijksmuseum.nl';
const SEARCH_API = '/api/v1/collection/search';
const DETAIL_API = '/api/v1/collection/art';

const OUTPUT_FILE = path.join(__dirname, '../public/data/rijksmuseum-drawings-collection.json');
const PROGRESS_FILE = path.join(__dirname, '../downloads/rijksmuseum-drawings-progress.json');
const LOG_FILE = path.join(__dirname, '../downloads/rijksmuseum-drawings-log.txt');

// Rate limiting
const DELAY_BETWEEN_PAGES = 500;
const DELAY_BETWEEN_DETAILS = 300;

// Facet ID
const FACET_ID = 'c4837a33241400022d46dedaed28fd91';

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
      const artworksCount = data.artworks?.length || 0;
      const searchResultsCount = data.allSearchResults?.length || 0;
      log(`📥 진행 상황 로드: ${artworksCount}개 작품 수집됨, ${searchResultsCount}개 검색 결과, 마지막 페이지: ${data.lastPage || 1}`);
      return data;
    } catch (e) {
      log('⚠️ 진행 상황 파일 읽기 실패, 새로 시작');
    }
  }
  return { artworks: [], processedNodeIds: [], allSearchResults: [], lastPage: 1 };
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
  const path = `${SEARCH_API}?language=en&page=${page}&sortingType=Popularity&collectionSearchContext=Art&facets%5B0%5D.id=${FACET_ID}&facets%5B0%5D.nodeRelationType=HasObjectType`;
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
    const parts = item.makerSubtitleLine.split(',');
    if (parts.length > 0) {
      artwork.artist = parts[0].trim();
      if (parts.length > 1) {
        artwork.date = parts.slice(1).join(',').trim();
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
    artwork.imageUrl = `https://iiif.micr.io/${micrioId}/full/max/0/default.jpg`;
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
    const idMatch = item.objectNodeUri.match(/\/(\d+)$/);
    if (idMatch) {
      artwork.sourceUrl = `https://www.rijksmuseum.nl/en/collection/${idMatch[1]}`;
    }
  }

  // 상세 정보가 있으면 추가
  if (detail) {
    if (detail.preferredDescription) {
      artwork.description = detail.preferredDescription;
    }

    if (detail.dimensions && Array.isArray(detail.dimensions) && detail.dimensions.length > 0) {
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

    if (detail.usedMaterial && Array.isArray(detail.usedMaterial) && detail.usedMaterial.length > 0) {
      artwork.medium = detail.usedMaterial.join(', ');
    } else if (detail.physicalFeatures && typeof detail.physicalFeatures === 'string' && detail.physicalFeatures.trim()) {
      artwork.medium = detail.physicalFeatures.trim();
    } else if (detail.usedTechnique && Array.isArray(detail.usedTechnique) && detail.usedTechnique.length > 0) {
      artwork.medium = detail.usedTechnique.join(', ');
    }

    if (detail.hasObjectType && Array.isArray(detail.hasObjectType) && detail.hasObjectType.length > 0) {
      artwork.category = detail.hasObjectType[0];
    }

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
  log('✏️ Rijksmuseum Drawings Collection Scraper - API 버전');
  log('='.repeat(60));

  let progress = loadProgress();
  const processedNodeIds = new Set(progress.processedNodeIds || []);
  let artworks = progress.artworks || [];
  
  // 기존 JSON 파일에서 작품 로드 (상세 정보 수집 재개를 위해)
  if (artworks.length === 0 && fs.existsSync(OUTPUT_FILE)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (existingData.artworks && Array.isArray(existingData.artworks)) {
        artworks = existingData.artworks;
        // 기존 작품의 ID들을 processedNodeIds에 추가
        artworks.forEach(artwork => {
          if (artwork.id) processedNodeIds.add(artwork.id);
          if (artwork.objectNumber) processedNodeIds.add(artwork.objectNumber);
        });
        log(`📥 기존 JSON 파일에서 ${artworks.length}개 작품 로드됨`);
      }
    } catch (e) {
      log(`⚠️ 기존 JSON 파일 로드 실패: ${e.message}`);
    }
  }

  try {
    // 기존 검색 결과 로드 (이전에 수집한 결과 재사용)
    let allSearchResults = progress.allSearchResults || [];
    const existingSearchResultsCount = allSearchResults.length;
    
    // 검색 결과가 이미 충분히 많으면 (1만개 이상) 검색 결과 수집 단계 건너뛰기
    if (existingSearchResultsCount >= 10000) {
      log(`📋 기존 검색 결과 ${existingSearchResultsCount}개 충분함, 검색 결과 수집 단계 건너뛰고 상세 정보 수집 시작`);
    } else {
      log('📋 작품 목록 수집 시작...');
      let currentPage = progress.lastPage || 1;
      let hasMore = true;
      
      if (existingSearchResultsCount > 0) {
        log(`📋 기존 검색 결과 ${existingSearchResultsCount}개 로드됨, 페이지 ${currentPage}부터 계속 수집`);
      }

      while (hasMore) {
        let retryCount = 0;
        const MAX_RETRIES = 3;
        let pageSuccess = false;
        
        while (retryCount < MAX_RETRIES && !pageSuccess) {
          try {
            const searchResult = await fetchSearchPage(currentPage);
            
            if (searchResult.artObjects && Array.isArray(searchResult.artObjects)) {
              log(`페이지 ${currentPage}: ${searchResult.artObjects.length}개 작품 발견`);
              allSearchResults.push(...searchResult.artObjects);
              pageSuccess = true;
              
              // 검색 결과를 progress에 저장 (매 페이지마다)
              progress.allSearchResults = allSearchResults;
              progress.lastPage = currentPage;
              saveProgress(progress);
              
              if (searchResult.artObjects.length < 20) {
                hasMore = false;
              } else {
                currentPage++;
                await sleep(DELAY_BETWEEN_PAGES);
              }
            } else {
              log(`페이지 ${currentPage}: 결과 없음`);
              hasMore = false;
              pageSuccess = true;
            }
          } catch (error) {
            retryCount++;
            if (retryCount < MAX_RETRIES) {
              log(`⚠️ 페이지 ${currentPage} 오류 (재시도 ${retryCount}/${MAX_RETRIES}): ${error.message}`);
              await sleep(DELAY_BETWEEN_PAGES * 2);
            } else {
              log(`⚠️ 페이지 ${currentPage} 오류 (최대 재시도 횟수 초과): ${error.message}`);
              log(`⚠️ 페이지 ${currentPage} 건너뛰고 계속 진행...`);
              currentPage++;
              await sleep(DELAY_BETWEEN_PAGES);
              pageSuccess = true;
            }
          }
        }
      }
      
      log(`✅ 총 ${allSearchResults.length}개 작품 목록 수집 완료`);
    }

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
        const detail = await fetchArtworkDetail(objectNodeId);
        const artwork = transformArtwork(item, detail);
        artworks.push(artwork);
        processedNodeIds.add(objectNodeId);
      } catch (error) {
        const artwork = transformArtwork(item, null);
        artworks.push(artwork);
        processedNodeIds.add(objectNodeId);
        log(`⚠️ 상세 정보 가져오기 실패 (${objectNodeId}): ${error.message}`);
      }

      if ((i + 1) % 20 === 0) {
        progress.artworks = artworks;
        progress.processedNodeIds = Array.from(processedNodeIds);
        progress.allSearchResults = allSearchResults; // 검색 결과도 함께 저장
        progress.lastPage = progress.lastPage || 1;
        saveProgress(progress);
        process.stdout.write(' 💾');
      }

      await sleep(DELAY_BETWEEN_DETAILS);
    }

    log('\n✅ 모든 작품 수집 완료');

    const output = {
      museum: 'Rijksmuseum',
      collection: 'Drawings',
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
