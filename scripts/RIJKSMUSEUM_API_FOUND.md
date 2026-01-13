# Rijksmuseum API 발견! ✅

## 발견된 메타데이터 API

### 1. 검색 API (목록)
**엔드포인트**: 
```
https://www.rijksmuseum.nl/api/v1/collection/search
```

**파라미터**:
- `language=en`: 언어
- `page=1`: 페이지 번호
- `sortingType=Popularity`: 정렬
- `collectionSearchContext=Art`: 컬렉션 컨텍스트
- `facets[0].id=3159edbfc6b22de59dfb2522fecc2706`: 필터 (painting)
- `facets[0].nodeRelationType=HasObjectType`: 필터 타입

**응답 구조**:
```json
{
  "artObjects": [
    {
      "title": "Still Life with Flowers in a Glass Vase",
      "makerSubtitleLine": "Jan Davidsz. de Heem, 1650 - 1683",
      "museumLocationFacet": {
        "id": "c94aafe794120035aca21cf248d43c6c",
        "value": "Gallery of Honour",
        "nodeRelationValue": "On display in",
        "nodeType": "MuseumLocation"
      },
      "micrioImage": {
        "micrioId": "Gfuby",
        "width": 5411,
        "height": 7968,
        "isDownloadable": true
      },
      "objectNumber": "SK-C-214",
      "objectNodeId": "9f1ca72cf761e1764fe22a5516b46ecc",
      "objectNodeUri": "https://id.rijksmuseum.nl/20029045"
    }
  ]
}
```

### 2. 작품 상세 API
**엔드포인트**: 
```
https://www.rijksmuseum.nl/api/v1/collection/art?objectNodeId={objectNodeId}&language=en
```

**파라미터**:
- `objectNodeId`: 검색 API에서 얻은 objectNodeId
- `language=en`: 언어

**특징**:
- ✅ API 키 불필요
- ✅ 모든 메타데이터 포함
- ✅ **onDisplay 정보 포함** (`museumLocationFacet`)
- ✅ 이미지 정보 포함 (`micrioImage`)

## onDisplay 정보

`museumLocationFacet` 필드에서 확인:
- `null`: 전시 중이 아님
- 객체 존재: 전시 중
  - `value`: 전시 위치 (예: "Gallery of Honour", "1.18")
  - `nodeRelationValue`: "On display in"

## 이미지 API

`micrioImage.micrioId`를 사용하여 이미지 접근:
- Micrio 서비스를 통해 고해상도 이미지 제공
- 또는 `https://www.rijksmuseum.nl/api/headless/assets/{assetId}` 사용

## 장점

1. ✅ 빠른 속도 (웹스크래핑보다 훨씬 빠름)
2. ✅ 안정적 (웹사이트 구조 변경에 영향 없음)
3. ✅ onDisplay 정보 포함
4. ✅ 모든 메타데이터 포함
5. ✅ API 키 불필요

## 사용 방법

1. 검색 API로 painting 목록 가져오기 (페이지네이션)
2. 각 작품의 `objectNodeId` 추출
3. 상세 API로 각 작품 정보 가져오기 (또는 검색 API 응답만으로도 충분할 수 있음)
