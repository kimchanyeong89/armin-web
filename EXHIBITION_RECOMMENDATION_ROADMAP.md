# 전시 추천 기능 로드맵
> 마지막 업데이트: 2026-04-03
> 목표: 사용자의 SigLIP 취향 벡터를 기반으로 현재·예정 전시를 추천하는 기능 구현

---

## 아키텍처 개요

```
[사용자 좋아요 → SigLIP 임베딩 centroid 취향 벡터]
          ↓
[전시 커버 이미지 → SigLIP 임베딩 (CF Worker 배치 처리)]
          ↓
[cosine similarity → 예상 점수 산출]
          ↓
[/exhibitions 페이지에서 위치 기반 필터링 + 점수순 정렬]
```

**핵심 원리:**
- 사용자 취향 벡터: `GlobalSearchBar.tsx`의 `/taste-profile` → centroid 768D 벡터
- 전시 점수: 전시 커버 이미지의 SigLIP 임베딩과 사용자 취향 벡터의 cosine similarity
- 점수 범위: 0~100 (100 = 완벽 취향 일치)

---

## Phase 1: 데이터 레이어 — 한국 미술관 + 임시전시 스키마

**파일:** `src/data/exhibitions.js`, `src/types/Exhibition.ts`

### 1-1. 임시전시 타입 확장

현재 `ExhibitionItem` 타입에 필드 추가:

```typescript
// src/types/Exhibition.ts에 추가
export interface TemporaryExhibition {
  id: string;
  title: string;              // 전시 제목
  titleKo?: string;           // 한국어 제목
  description: string;
  startDate: string;          // ISO 날짜 "2025-03-15"
  endDate: string;            // ISO 날짜 "2025-06-08" 또는 "ongoing"
  coverImage: string;         // 전시 포스터/표지 이미지 URL
  officialUrl?: string;       // 공식 전시 페이지 URL
  admissionFee?: string;      // 입장료 정보
  status: 'ongoing' | 'upcoming' | 'past';
  // 임베딩 관련 (배치 처리 후 채워짐)
  coverEmbedding?: number[];  // 768D SigLIP vector
  embeddingUpdatedAt?: string;
}
```

### 1-2. 한국 주요 미술관 10개 데이터

아래 미술관들을 `exhibitions.js`에 추가 (각각 `temporaryExhibitions` 필드 포함):

| # | 미술관 | ID |
|---|--------|-----|
| 1 | 국립중앙박물관 | `national-museum-korea` |
| 2 | 국립현대미술관 서울관 | `mmca-seoul` |
| 3 | 국립현대미술관 과천관 | `mmca-gwacheon` |
| 4 | 리움미술관 | `leeum-museum` |
| 5 | 서울시립미술관 | `sema-seoul` |
| 6 | 아모레퍼시픽 미술관 | `apma` |
| 7 | 대림미술관 | `daelim-museum` |
| 8 | 호암미술관 | `hoam-museum` |
| 9 | 부산시립미술관 | `busan-museum-art` |
| 10 | 제주도립미술관 | `jeju-museum-art` |

**각 미술관 데이터 구조:**
```javascript
{
  id: "mmca-seoul",
  name: "국립현대미술관 서울관",
  slug: "mmca-seoul",
  location: "서울, 대한민국",
  country: "South Korea",
  region: "Seoul",
  latitude: 37.5788,
  longitude: 126.9794,
  description: "...",
  representativeImage: "...",
  permanentExhibitions: [],
  temporaryExhibitions: [
    {
      id: "mmca-seoul-2025-xxx",
      title: "전시명",
      titleKo: "한국어 제목",
      description: "...",
      startDate: "2025-XX-XX",
      endDate: "2025-XX-XX",
      coverImage: "https://...",
      officialUrl: "https://...",
      status: "ongoing"  // or "upcoming"
    }
  ]
}
```

> **실제 전시 데이터는 아래 Phase 1-3 섹션 참조**

### 1-3. 실제 전시 데이터 (2026-04-03 기준, exhibitions.js에 반영 완료)

| 미술관 | 전시 제목 | 기간 | 상태 |
|--------|-----------|------|------|
| 국립중앙박물관 | 깨달음으로 이끄는 부처: 안동 봉정사 괘불 | 2026-04-07 ~ 2026-06-21 | ongoing |
| 국립중앙박물관 | 이슬람 미술, 빛나는 빛의 여정 (상설) | 2025-11 ~ 2026-11 | ongoing |
| 국립중앙박물관 | 각진 백자 이야기 | 2025-08-26 ~ 2026-06-21 | ongoing |
| 국립중앙박물관 | 보존과학, 새로운 시작 함께하는 미래 | 2025-10-28 ~ 2026-06-30 | ongoing |
| 국립현대미술관 서울 | 데이미언 허스트: Nothing Is True | 2026-03-20 ~ 2026-06-28 | ongoing |
| 국립현대미술관 서울 | 이것은 (개념) 미술이 아니다 | 2026-03 ~ 2026-07 | ongoing |
| 국립현대미술관 서울 | 서도호 대규모 개인전 | 2026-08 ~ 2027-02 | upcoming |
| 국립현대미술관 과천 | 개관 40주년: 빛의 설치전 | 2026-05 ~ 2026-12 | upcoming |
| 국립현대미술관 과천 | 로드 무비: 1945년 이후 한일 미술 | 2026-05 ~ 2026-09 | upcoming |
| 국립현대미술관 과천 | 조지아 오키프와 미국 현대미술 | 2026-11 ~ 2027-03 | upcoming |
| 리움미술관 | 티노 세갈 개인전 | 2026-02 ~ 2026-06 | ongoing |
| 리움미술관 | 가브리엘 오로스코 특별 프로젝트 | 2026-04 ~ 2026-09 | ongoing |
| 리움미술관 | 구정아 개인전: OUSSS | 2026-09-05 ~ 2026-12-27 | upcoming |
| 서울시립미술관 | 가나아트컬렉션: 기술의 저변 | 2026-04-16 ~ 2026-11-22 | ongoing |
| 서울시립미술관 | 유영국: 산은 내 안에 있다 | 2026-05-14 ~ 2026-10-18 | upcoming |
| 서울시립미술관 | 린 허쉬만 리슨 | 2026-10-01 ~ 2027-02-07 | upcoming |
| 아모레퍼시픽 미술관 | APMA, CHAPTER FIVE | 2026-04-01 ~ 2026-08-02 | ongoing |
| 아모레퍼시픽 미술관 | 조나스 우드 개인전 | 2026-09 ~ 2027-02 | upcoming |
| 디뮤지엄 | 취향가옥 2 | 2025-06-28 ~ 2026-09-20 | ongoing |
| 호암미술관 | 김윤신: 합이합일 분이분일 | 2026-03-17 ~ 2026-06-28 | ongoing |
| 호암미술관 | 아트 스펙트럼 2026 | 2026-09 ~ 2026-12 | upcoming |
| 부산시립미술관 | 이우환 공간 상설전 | 상시 운영 | ongoing |
| 부산시립미술관 | 사회와 미술: 해방에서 한국전쟁까지 | 2026-10 ~ 2027-02 | upcoming |
| 부산시립미술관 | 미래 뮤지올로지 | 2026-10 ~ 2027-03 | upcoming |
| 제주도립미술관 | 경계 위의 그녀 | 2026-04-07 ~ 2026-08-02 | ongoing |
| 제주도립미술관 | 2026 제5회 제주비엔날레 | 2026-08-25 ~ 2026-11-15 | upcoming |

---

## Phase 2: 전시 커버 임베딩 배치 처리

**목적:** 전시 커버 이미지 → 768D SigLIP 벡터 사전 계산

### 2-1. Cloudflare Worker 엔드포인트 추가

기존 CF Worker(`armin-semantic-search.armin-art.workers.dev`)에 두 개 엔드포인트 추가:

**`POST /embed-exhibition-covers`**
전시 커버 이미지 URL 배열을 받아 임베딩 계산 후 KV에 저장:
```json
Request:  { "exhibitions": [{ "id": "...", "coverImage": "url" }] }
Response: { "processed": 42, "stored": 42 }
```

**`POST /score-exhibitions`**
사용자 취향 벡터와 전시 목록을 받아 예상 점수 반환:
```json
Request: {
  "userId": "...",
  "exhibitions": [{ "id": "...", "coverImage": "url", "coverEmbedding": [...] }]
}
Response: {
  "scores": [{ "id": "...", "score": 87.3, "rank": 1 }]
}
```

### 2-2. 클라이언트 측 폴백 (브라우저 WASM)

서버 임베딩이 없는 경우 `siglip-encoder.worker.ts` 활용:
- 이미지 URL → text description으로 변환 후 텍스트 임베딩 (근사치)
- 실제 이미지 임베딩은 서버에서만 가능 (SigLIP image encoder 필요)

### 2-3. 임베딩 캐싱 전략

- Cloudflare KV key: `exhibition:cover:{exhibitionId}`
- TTL: 30일 (전시가 바뀌면 자동 만료)
- 새 미술관 추가 시 관리자 페이지에서 수동 트리거 가능

---

## Phase 3: UI — 전시 추천 페이지

**파일:** `src/pages/ExhibitionsNearMePage.tsx` (신규 생성)

### 3-1. 하단 아이콘바에 아이콘 추가

**파일:** `src/components/GlobalNav.tsx`

Drawing 스킨 + Default 스킨 양쪽에 "전시" 아이콘 추가:
- 아이콘: 액자/캘린더 형태의 SVG
- 라우팅: `/exhibitions`
- 애니메이션: 기존 `iconBtnStyle(delay)` 패턴 동일하게 적용

```tsx
// Drawing 스킨 (iconBtnStyle 패턴)
<button title="전시 추천"
    onClick={() => { setIsMenuOpen(false); navigate('/exhibitions'); }}
    style={iconBtnStyle(0.20, currentPath === '/exhibitions')}
>
    <svg width="52" height="52" viewBox="0 0 36 36">
        {/* 액자 + 달력 합성 아이콘 */}
        <rect x="5" y="8" width="26" height="22" rx="2" fill="#111"/>
        <rect x="8" y="13" width="20" height="14" fill="white"/>
        <rect x="5" y="8" width="26" height="5" fill="#111"/>
        {/* 날짜 점 */}
        <circle cx="11" cy="11" r="1.5" fill="white"/>
        <circle cx="25" cy="11" r="1.5" fill="white"/>
    </svg>
</button>
```

### 3-2. 페이지 레이아웃 (`/exhibitions`)

```
┌─────────────────────────────────────────────────────┐
│  📍 내 주변 전시                           [지도 보기] │
│  현재 위치: 서울 강남구                               │
├─────────────────────────────────────────────────────┤
│  ── 추천 전시 ──                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐      │
│  │ 표지 이미지 │  │ 표지 이미지 │  │ 표지 이미지 │      │
│  │ ⭐ 94점    │  │ ⭐ 87점    │  │ ⭐ 81점    │      │
│  │ 전시 제목   │  │ 전시 제목   │  │ 전시 제목   │      │
│  │ 미술관명    │  │ 미술관명    │  │ 미술관명    │      │
│  │ ~2025.6.8  │  │ ~2025.7.1  │  │ ~2025.8.15 │      │
│  └────────────┘  └────────────┘  └────────────┘      │
├─────────────────────────────────────────────────────┤
│  ── 전체 진행중 전시 ──  [거리순 | 점수순 | 종료임박]   │
│  [전시 카드 목록]                                     │
└─────────────────────────────────────────────────────┘
```

### 3-3. 전시 카드 컴포넌트

```typescript
interface ExhibitionCard {
  exhibition: TemporaryExhibition;
  museum: { name: string; location: string; lat: number; lng: number };
  predictedScore?: number;    // 0-100, undefined = 미로그인/좋아요 부족
  distanceKm?: number;        // 사용자 위치 기반
  daysLeft?: number;          // 종료까지 남은 일수
}
```

**카드 디자인 (다크 럭셔리 테마):**
- 표지 이미지 전체 배경 (aspect-ratio 3:4)
- 하단 그라데이션 오버레이
- 예상 점수: 금색 배지 (좋아요 3개 이상 시 표시)
- 종료 임박 (7일 이하): 빨간 배지

### 3-4. 점수 계산 로직 (클라이언트)

```typescript
// 사용자 취향 벡터 가져오기
const { tasteVector } = useContext(TasteProfileContext);

// 전시 점수 계산
async function scoreExhibition(exhibition: TemporaryExhibition): Promise<number> {
  if (!tasteVector || tasteVector.length === 0) return 0;

  // 1. 서버에서 사전 계산된 임베딩이 있으면 사용
  if (exhibition.coverEmbedding) {
    return cosineSim(tasteVector, exhibition.coverEmbedding) * 100;
  }

  // 2. 없으면 서버에 실시간 요청
  const res = await fetch('/score-exhibitions', {
    method: 'POST',
    body: JSON.stringify({ userId, exhibitions: [exhibition] })
  });
  const { scores } = await res.json();
  return scores[0]?.score ?? 0;
}
```

### 3-5. 위치 기반 필터링

```typescript
// Geolocation API 사용
navigator.geolocation.getCurrentPosition((pos) => {
  const { latitude, longitude } = pos.coords;
  // 반경 N km 이내 미술관 필터링
  const nearby = museums.filter(m =>
    haversineDistance(latitude, longitude, m.latitude, m.longitude) <= radiusKm
  );
});

// 거리 계산
function haversineDistance(lat1, lon1, lat2, lon2): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) *
            Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

---

## Phase 4: 백엔드 — CF Worker 확장

**기존 엔드포인트:** `armin-semantic-search.armin-art.workers.dev`

### 4-1. 신규 엔드포인트 구현

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/embed-exhibition-covers` | POST | 전시 커버 이미지 임베딩 배치 처리 |
| `/score-exhibitions` | POST | 사용자 벡터 기반 전시 점수 반환 |
| `/exhibitions/refresh` | POST | 임베딩 캐시 강제 갱신 (Admin) |

### 4-2. KV 스토리지 스키마

```
exhibition:cover:{exhibitionId}  →  { vector: number[], updatedAt: string }
user:taste-vector:{userId}       →  { vector: number[], likedCount: number, updatedAt: string }
```

### 4-3. 점수 계산 알고리즘

```typescript
// CF Worker 내부
async function scoreExhibitions(userId: string, exhibitionIds: string[]) {
  // 1. 사용자 취향 벡터 로드 (KV 캐시)
  const tasteVec = await getTasteVector(userId); // KV lookup

  // 2. 전시 임베딩 로드 (병렬)
  const embeddings = await Promise.all(
    exhibitionIds.map(id => getExhibitionEmbedding(id))
  );

  // 3. cosine similarity 계산
  return exhibitionIds.map((id, i) => ({
    id,
    score: embeddings[i] ? cosineSim(tasteVec, embeddings[i]) * 100 : null,
  }));
}
```

---

## Phase 5: 점진적 개선

### 5-1. 취향 벡터 노출 (TasteProfileContext)

현재 `GlobalSearchBar.tsx` 내부에 갇혀 있는 취향 벡터를 Context로 전역 공유:

```typescript
// src/contexts/TasteProfileContext.tsx (신규)
interface TasteProfileContextValue {
  tasteVector: number[] | null;
  likedCount: number;
  isReady: boolean;
}
export const TasteProfileContext = createContext<TasteProfileContextValue>({...});
```

### 5-2. 전시 상세 모달

전시 카드 클릭 시 모달:
- 전시 정보 (제목, 기간, 설명, 공식 링크)
- 예상 점수 시각화 (원형 게이지)
- "왜 추천하는가" 설명 (유사 좋아요 작품 3개 표시)
- 구글 지도 방향 안내 버튼

### 5-3. 관리자 전시 관리

`/admin` 페이지에 탭 추가:
- 전시 목록 보기 / 추가 / 수정 / 삭제
- 임베딩 수동 재생성 버튼
- 전시 status 업데이트 (ongoing → past)

---

## 구현 순서 (권장)

```
[1일차] Phase 1: exhibitions.js에 한국 미술관 10개 + 전시 데이터 추가
[2일차] Phase 3-1: GlobalNav.tsx에 전시 아이콘 + App.tsx 라우트 추가
[3일차] Phase 3-2~3: ExhibitionsNearMePage.tsx 기본 레이아웃 + 카드 컴포넌트
[4일차] Phase 5-1: TasteProfileContext 추출 + Phase 3-4 점수 로직
[5일차] Phase 4: CF Worker 엔드포인트 추가
[6일차] Phase 5-2: 전시 상세 모달
[7일차] 테스트 + 버그 수정
```

---

## 현재 진행 상태

- [x] 로드맵 작성 완료
- [x] Phase 1: 한국 미술관 10개 + 전시 26건 `exhibitions.js`에 추가
- [x] Phase 1: `Exhibition.ts`에 `TemporaryExhibition` 타입 추가
- [x] Phase 3-1: GlobalNav 전시 아이콘 추가 (drawing + default 양쪽)
- [x] Phase 3-1: App.tsx `/exhibitions` 오버레이 라우트 추가
- [x] Phase 3-2~3: `ExhibitionsNearMePage.tsx` 구현 (취향순/거리순/종료임박순, 상세 모달)
- [ ] Phase 4: CF Worker `/taste-vector`, `/score-exhibitions` 엔드포인트 추가
- [ ] Phase 5-1: TasteProfileContext 추출 (GlobalSearchBar에서 전역화)
- [ ] Phase 5-3: 관리자 전시 관리 탭

---

## 참고 파일

| 파일 | 역할 |
|------|------|
| `src/data/exhibitions.js` | 미술관 + 전시 데이터 원본 |
| `src/types/Exhibition.ts` | Exhibition 타입 정의 |
| `src/components/GlobalNav.tsx` | 하단 아이콘바 |
| `src/components/GlobalSearchBar.tsx` | 취향 벡터 로직 (lines 657-744) |
| `src/utils/siglipSearch.ts` | SigLIP 임베딩 유틸 |
| `src/workers/siglip-encoder.worker.ts` | 브라우저 텍스트 인코더 |
| `src/App.tsx` | 라우팅 |
| `src/pages/HomePage.tsx` | 벡터 수학 헬퍼 (lines 63-75) |
| `src/pages/ExhibitionsNearMePage.tsx` | **신규 생성 예정** |
| `src/contexts/TasteProfileContext.tsx` | **신규 생성 예정** |
