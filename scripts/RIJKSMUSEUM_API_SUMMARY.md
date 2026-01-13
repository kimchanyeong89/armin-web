# Rijksmuseum API 조사 결과 요약

## ✅ 메타데이터 API 발견!

### 발견된 API 엔드포인트

1. **검색 API** (목록 + 기본 메타데이터)
   ```
   https://www.rijksmuseum.nl/api/v1/collection/search
   ```
   - 파라미터: `language=en&page=1&sortingType=Popularity&collectionSearchContext=Art&facets[0].id=3159edbfc6b22de59dfb2522fecc2706&facets[0].nodeRelationType=HasObjectType`
   - 반환: `artObjects` 배열
   - 포함 정보:
     - `title`: 제목
     - `makerSubtitleLine`: 작가 및 날짜
     - `objectNumber`: 객체 번호
     - `objectNodeId`: 상세 정보 API용 ID
     - **`museumLocationFacet`**: onDisplay 정보! (null이면 미전시, 객체면 전시 중)
       - `value`: 전시 위치 (예: "Gallery of Honour")
       - `nodeRelationValue`: "On display in"
     - `micrioImage`: 이미지 정보

2. **상세 정보 API** (전체 메타데이터)
   ```
   https://www.rijksmuseum.nl/api/v1/collection/art?objectNodeId={objectNodeId}&language=en
   ```
   - 파라미터: `objectNodeId` (검색 API에서 얻은 값)
   - 반환: 상세 메타데이터
   - 포함 정보:
     - `dimensions`: 크기
     - `preferredDescription`: 설명
     - `usedMaterial`: 재료
     - `dataTab`: 상세 속성들

### onDisplay 정보

`museumLocationFacet` 필드로 확인:
- `null` → 전시 중이 아님
- 객체 존재 → 전시 중
  - `value`: 전시 위치
  - `nodeRelationValue`: "On display in"

### 특징

- ✅ **API 키 불필요**
- ✅ **모든 메타데이터 포함**
- ✅ **onDisplay 정보 포함**
- ✅ **이미지 정보 포함**
- ✅ 빠르고 안정적

## 결론

**API로 모든 데이터를 가져올 수 있습니다!**

검색 API만으로도 충분한 정보를 제공하며, onDisplay 정보도 포함되어 있습니다.

## 다음 단계

1. API를 사용한 새로운 스크립트 작성 (선택사항)
2. 현재 웹스크래핑 스크립트로 100개 테스트 (요청사항)
