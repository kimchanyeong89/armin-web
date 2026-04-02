# 🎨 Armin 개인화 추천 시스템 구현 로드맵

> **목적**: 사용자의 하트(좋아요) 데이터를 분석해 취향에 맞는 작품을 추천하고,
> 주간 개인화 온라인 전시를 구독 서비스로 제공.
>
> **이 문서로 어디서든 이어서 작업 가능** — 각 Phase마다 체크리스트 포함.

---

## ⚠️ 벡터 평균(단일 centroid)의 한계와 해결 전략

### 문제: Center Space Trap

사용자가 서로 멀리 떨어진 두 스타일을 모두 좋아할 때 (예: 인상파 + 추상표현주의),
단순 가중 평균은 두 군집의 **중간 공간**에 위치한 "어정쩡한" 작품을 추천.

```
[인상파 군집]          [평균 벡터]          [추상 군집]
    ●●●●●     ←————————★————————→     ●●●●●
   (모네류)          (아무도 없음)        (말레비치류)
```

### 해결: Multi-Centroid 접근법

1개의 평균 대신 **K-Means로 K개의 취향 군집 중심**을 유지.
각 군집에서 독립적으로 추천 후 합산.

```
좋아요 목록 (N개 작품 벡터)
       ↓
  K-Means 클러스터링 (K=2~5)
       ↓
  [군집1 중심]  [군집2 중심]  [군집3 중심]
       ↓              ↓              ↓
  Vectorize 검색  Vectorize 검색  Vectorize 검색
  (각 topK=40)    (각 topK=40)    (각 topK=40)
       ↓
  결과 병합 → 다양성 보정 → 최종 추천
```

**K 결정 방법**: 좋아요 수에 따라 동적으로 결정
- 좋아요 < 5개: K=1 (단일 벡터)
- 5~15개: K=2
- 16~30개: K=3
- 31개+: K=4 (최대)

---

## 📐 전체 아키텍처

```
[Firebase - 사용자 하트 데이터]
         ↓
[Cloudflare Worker: /taste-profile]
  - 하트 작품 ID 목록 수신
  - Vectorize에서 각 작품 벡터 pull (getByIds)
  - K-Means로 K개 취향 군집 계산
  - 각 군집 중심 벡터를 Cloudflare KV에 저장
         ↓
[Cloudflare Worker: /recommend]
  - K개 군집 벡터로 Vectorize 검색 (각 topK=40)
  - 결과 병합 + 중복 제거
  - 다양성 보정 (같은 작가 최대 3개, 같은 시대 최대 30%)
  - 이미 하트 누른 작품 제외
  - 최종 N개 반환
         ↓
[Frontend: 추천 탭 / 주간 전시 페이지]
```

---

## 🗂️ Phase별 구현 계획

### Phase 0: 인프라 준비 ✅ (이미 완료)
- [x] Cloudflare Vectorize (`armin-art-search-768`) — 768D 벡터 DB
- [x] Cloudflare Worker (`armin-semantic-search`) — /search-by-vector 엔드포인트
- [x] Firebase Auth + Firestore — 사용자 인증 및 하트 데이터
- [x] search-index — 작품 메타데이터 (e, n, a, i, m 필드)

---

### Phase 1: 취향 프로파일 Worker 🔧
**파일**: `workers/semantic-search/src/index.ts`

#### 1-1. `/taste-profile` 엔드포인트 추가

```typescript
// POST /taste-profile
// Body: { userId: string, likedIds: string[] }
// 응답: { centroids: number[][], k: number }

if (url.pathname === '/taste-profile' && request.method === 'POST') {
    const { userId, likedIds } = await request.json();

    // 1. Vectorize에서 하트 작품 벡터 가져오기
    const vectors = await env.VECTORIZE.getByIds(likedIds);
    const vecs = vectors.map(v => v.values);

    // 2. K 결정
    const k = likedIds.length < 5 ? 1
            : likedIds.length < 16 ? 2
            : likedIds.length < 31 ? 3 : 4;

    // 3. K-Means 실행
    const centroids = kMeans(vecs, k, 50); // 50 iterations

    // 4. KV에 저장 (TTL: 7일)
    await env.TASTE_KV.put(
        `taste:${userId}`,
        JSON.stringify({ centroids, k, updatedAt: Date.now() }),
        { expirationTtl: 604800 }
    );

    return Response.json({ success: true, k, centroids });
}
```

#### 1-2. K-Means 구현 (Worker 내 순수 JS)

```typescript
function kMeans(vectors: number[][], k: number, maxIter: number): number[][] {
    // Forgy 초기화 (랜덤 k개 선택)
    let centroids = shuffle(vectors).slice(0, k).map(v => [...v]);

    for (let iter = 0; iter < maxIter; iter++) {
        // 각 벡터를 가장 가까운 centroid에 할당
        const clusters: number[][][] = Array.from({ length: k }, () => []);
        for (const vec of vectors) {
            const nearest = centroids.reduce((best, c, i) =>
                cosineSim(vec, c) > cosineSim(vec, centroids[best]) ? i : best, 0);
            clusters[nearest].push(vec);
        }
        // 새 centroid 계산 (L2 정규화 포함)
        const newCentroids = clusters.map((cluster, i) => {
            if (cluster.length === 0) return centroids[i];
            const mean = cluster[0].map((_, j) =>
                cluster.reduce((s, v) => s + v[j], 0) / cluster.length);
            const norm = Math.sqrt(mean.reduce((s, v) => s + v * v, 0));
            return norm > 0 ? mean.map(v => v / norm) : mean;
        });
        // 수렴 확인
        if (centroids.every((c, i) => cosineSim(c, newCentroids[i]) > 0.9999)) break;
        centroids = newCentroids;
    }
    return centroids;
}

function cosineSim(a: number[], b: number[]): number {
    return a.reduce((s, v, i) => s + v * b[i], 0);
}
```

#### 1-3. `/recommend` 엔드포인트

```typescript
// POST /recommend
// Body: { userId: string, likedIds: string[], limit?: number }
// 응답: { results: ArtworkResult[] }

if (url.pathname === '/recommend' && request.method === 'POST') {
    const { userId, likedIds, limit = 20 } = await request.json();

    // 1. KV에서 취향 프로파일 로드
    const profileJson = await env.TASTE_KV.get(`taste:${userId}`);
    if (!profileJson) {
        return Response.json({ results: [] });
    }
    const { centroids } = JSON.parse(profileJson);

    // 2. 각 centroid로 Vectorize 검색
    const likedSet = new Set(likedIds);
    const perK = Math.ceil(limit * 2.5 / centroids.length); // 여유 있게 pull

    const allResults = new Map<string, VectorMatch>();
    for (const centroid of centroids) {
        const res = await env.VECTORIZE.query(centroid, {
            topK: perK,
            returnMetadata: true,
        });
        for (const match of res.matches) {
            if (likedSet.has(match.id)) continue; // 이미 좋아요한 것 제외
            if (!allResults.has(match.id) || allResults.get(match.id)!.score < match.score) {
                allResults.set(match.id, match);
            }
        }
    }

    // 3. 다양성 보정
    const diversified = diversify(Array.from(allResults.values()), limit);

    return Response.json({
        results: diversified.map(m => ({ id: m.id, score: m.score, ...m.metadata }))
    });
}
```

#### 1-4. 다양성 보정 함수

```typescript
function diversify(matches: VectorMatch[], limit: number): VectorMatch[] {
    const artistCount = new Map<string, number>();
    const eraCount    = new Map<string, number>();
    const museumCount = new Map<string, number>();
    const result: VectorMatch[] = [];

    // 점수 내림차순 정렬
    matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    for (const m of matches) {
        if (result.length >= limit) break;
        const artist = String(m.metadata?.a || '');
        const era    = getEra(String(m.metadata?.d || ''));
        const museum = String(m.metadata?.m || '');

        // 제약: 같은 작가 최대 3개, 같은 시대 최대 30%, 같은 미술관 최대 40%
        if ((artistCount.get(artist) ?? 0) >= 3) continue;
        if ((eraCount.get(era) ?? 0) >= Math.ceil(limit * 0.30)) continue;
        if ((museumCount.get(museum) ?? 0) >= Math.ceil(limit * 0.40)) continue;

        result.push(m);
        artistCount.set(artist, (artistCount.get(artist) ?? 0) + 1);
        eraCount.set(era,       (eraCount.get(era) ?? 0) + 1);
        museumCount.set(museum, (museumCount.get(museum) ?? 0) + 1);
    }

    // 부족하면 완화된 조건으로 채우기
    if (result.length < limit) {
        const resultIds = new Set(result.map(m => m.id));
        for (const m of matches) {
            if (result.length >= limit) break;
            if (!resultIds.has(m.id)) result.push(m);
        }
    }
    return result;
}

function getEra(dateStr: string): string {
    const year = parseInt(dateStr.replace(/[^0-9]/g, '')) || 0;
    if (year < 1400) return 'medieval';
    if (year < 1700) return 'renaissance';
    if (year < 1850) return 'baroque_classical';
    if (year < 1920) return 'impressionism';
    if (year < 1970) return 'modern';
    return 'contemporary';
}
```

**TODO 체크리스트 Phase 1:**
- [ ] `workers/semantic-search/src/index.ts`에 위 엔드포인트 추가
- [ ] Cloudflare KV 네임스페이스 `TASTE_KV` 생성 및 wrangler.toml 바인딩
- [ ] Worker 배포 (`wrangler deploy`)
- [ ] Postman/curl로 `/taste-profile` 테스트
- [ ] Postman/curl로 `/recommend` 테스트

---

### Phase 2: 하트 누를 때 실시간 취향 업데이트 🔧
**파일**: `src/components/GlobalSearchBar.tsx` (또는 하트 로직이 있는 곳)

#### 현재 하트 로직 위치 확인
```bash
grep -n "toggleLike\|addLike\|likedArtworks" src/components/GlobalSearchBar.tsx | head -20
```

#### 하트 후 취향 프로파일 업데이트 (디바운스 적용)

```typescript
// 하트 토글 후 호출
const updateTasteProfile = useMemo(() =>
    debounce(async (likedIds: string[]) => {
        const user = auth.currentUser;
        if (!user || likedIds.length < 3) return; // 최소 3개 이상

        try {
            await fetch('https://armin-semantic-search.armin-art.workers.dev/taste-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, likedIds }),
            });
        } catch (err) {
            console.warn('Taste profile update failed:', err);
        }
    }, 3000) // 3초 디바운스 (연속 클릭 방지)
, []);

// toggleLike 함수에 추가:
const toggleLikeArtwork = async (e, artwork) => {
    // ... 기존 Firebase 업데이트 로직 ...

    // 취향 프로파일 업데이트 (비동기, 비차단)
    const newLikedIds = Array.from(newLikedSet);
    updateTasteProfile(newLikedIds);
};
```

**TODO 체크리스트 Phase 2:**
- [ ] `toggleLikeArtwork` 함수 찾아서 `updateTasteProfile` 훅 추가
- [ ] 3초 디바운스 적용 (연속 하트 클릭 시 마지막 1번만 API 호출)
- [ ] Firebase 하트 데이터 로드 후 초기 취향 프로파일 생성 (첫 로그인 시)

---

### Phase 3: 추천 탭 UI 🎨
**파일**: `src/components/GlobalSearchBar.tsx` 또는 새 컴포넌트

#### 추천 탭 위치
검색 결과 패널 내 탭 추가 (현재 "일반" / "AI" 탭 → "일반" / "AI" / "추천" 탭)

```tsx
// 추천 탭 렌더링
{activeTab === 'recommend' && (
    <RecommendationPanel
        likedIds={Array.from(likedArtworks)}
        currentUser={currentUser}
    />
)}
```

#### RecommendationPanel 컴포넌트

```tsx
const RecommendationPanel: React.FC<{
    likedIds: string[];
    currentUser: User | null;
}> = ({ likedIds, currentUser }) => {
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [clusters, setClusters] = useState(1); // 감지된 군집 수

    useEffect(() => {
        if (!currentUser || likedIds.length < 3) return;
        setLoading(true);

        fetch('https://armin-semantic-search.armin-art.workers.dev/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.uid,
                likedIds,
                limit: 30,
            }),
        })
        .then(r => r.json())
        .then(data => {
            setResults(data.results || []);
            setClusters(data.k || 1);
        })
        .finally(() => setLoading(false));
    }, [currentUser?.uid, likedIds.length]);

    if (likedIds.length < 3) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                작품에 하트를 3개 이상 눌러주세요 💙
                <br />취향을 분석해 맞춤 추천을 드립니다.
            </div>
        );
    }

    return (
        <div>
            {clusters > 1 && (
                <div style={{ padding: '8px 16px', fontSize: 12, color: '#aaa' }}>
                    {clusters}가지 취향 스타일 감지됨
                </div>
            )}
            {/* 기존 SearchResult 카드 컴포넌트 재사용 */}
            {results.map(art => <SearchResultCard key={art.id} art={art} />)}
        </div>
    );
};
```

**TODO 체크리스트 Phase 3:**
- [ ] GlobalSearchBar.tsx에 "추천" 탭 추가
- [ ] RecommendationPanel 컴포넌트 구현
- [ ] 로딩 상태 UI (스켈레톤 카드)
- [ ] "왜 추천했나요?" 툴팁 (메타데이터 기반 설명)

---

### Phase 4: 주간 개인화 전시 (구독) 📅

#### 4-1. 전시 생성 Cron Worker

```typescript
// workers/weekly-exhibition/src/index.ts
// Cloudflare Cron: 매주 월요일 09:00 KST

export default {
    async scheduled(event, env, ctx) {
        // 구독 유저 목록 가져오기 (Firestore REST API)
        const subscribers = await getSubscribers(env);

        // 이번 주 테마 (계절 + 큐레이터 선정)
        const theme = getWeeklyTheme(); // "봄의 색채", "도시의 고독", ...
        const themeVector = await encodeTextWithSigLIP(theme, env.HF_TOKEN);

        for (const user of subscribers) {
            // 취향 프로파일 로드
            const profile = await env.TASTE_KV.get(`taste:${user.uid}`);
            if (!profile) continue;
            const { centroids } = JSON.parse(profile);

            // 테마 벡터(30%) + 취향 벡터(70%) 혼합
            const mixed = blendVectors(themeVector, centroids[0], 0.3);

            // 10~15개 작품 추천
            const exhibition = await buildExhibition(mixed, env, user.uid);

            // Firestore에 개인화 전시 저장
            await saveExhibition(user.uid, exhibition, theme, env);
        }
    }
};
```

#### 4-2. 구독 플로우

```
사용자 → 구독 버튼 클릭
       → Stripe 결제 (월 $X)
       → Firebase에 subscriber 마킹
       → 다음 월요일부터 주간 전시 수신
       → 이메일 / 앱 푸시 알림
```

**구독 전시 페이지** (`/my-exhibition`):
- 이번 주 내 큐레이션 전시 (10~15작품)
- "왜 이 작품들?" 설명 (테마 + 취향 기반)
- 각 작품 하트/공유 가능
- 지난 주 전시 아카이브

**TODO 체크리스트 Phase 4:**
- [ ] `workers/weekly-exhibition/src/index.ts` 생성
- [ ] wrangler.toml에 Cron trigger 설정 (`0 0 * * 1` = 월요일 00:00 UTC)
- [ ] `getWeeklyTheme()` 함수 (하드코딩 or Firestore 어드민 설정)
- [ ] `blendVectors()` 함수
- [ ] `/my-exhibition` 페이지 컴포넌트
- [ ] Stripe 결제 연동
- [ ] 이메일 템플릿 (React Email + Resend)

---

### Phase 5: 고도화 (유저 증가 후) 🚀

#### 5-1. 암묵적 피드백 추가
현재: 하트만 사용
향후: 조회 시간 + 작품 페이지 방문 + 공유 행동도 가중치에 반영

```
가중치:
  하트        = 1.0  (가장 강한 신호)
  5초 이상 봄 = 0.3  (관심 있음)
  공유        = 0.8  (매우 좋아함)
  바로 넘김   = -0.1 (관심 없음)
```

#### 5-2. 협업 필터링 레이어 추가 (유저 1만명+)

```
유사 취향 유저 발견:
  나의 취향 벡터 ↔ 다른 유저 취향 벡터의 코사인 유사도
  → 유사도 상위 50명이 하트 눌렀지만 나는 아직 안 본 작품 추천
```

#### 5-3. 작가 선호도 가중치

```
같은 작가 작품을 3개 이상 하트 → 해당 작가 가중치 1.5배
→ "/search?artist=claude-monet" 링크 자동 제안
```

---

## 🗃️ Cloudflare 인프라 추가 필요 항목

| 리소스 | 용도 | 생성 방법 |
|--------|------|-----------|
| KV Namespace `TASTE_KV` | 취향 벡터 저장 (user_id → centroids) | `wrangler kv:namespace create TASTE_KV` |
| KV Namespace `EXHIBITION_KV` | 주간 전시 캐시 | `wrangler kv:namespace create EXHIBITION_KV` |
| Cron Worker | 주간 전시 생성 | `wrangler.toml` crons 설정 |

### wrangler.toml 추가 바인딩

```toml
# workers/semantic-search/wrangler.toml에 추가
[[kv_namespaces]]
binding = "TASTE_KV"
id = "..." # wrangler kv:namespace create 후 생성된 ID
```

---

## 📊 데이터 플로우 다이어그램

```
[사용자 액션: 하트 클릭]
         |
         ▼
[Firebase Firestore]
  users/{uid}/likedArtworks: [id1, id2, ...]
         |
         | (디바운스 3초)
         ▼
[Worker: POST /taste-profile]
  1. Vectorize.getByIds([id1, id2, ...])
     → 각 작품의 768D 벡터
  2. K-Means(k=2~4)
     → k개의 취향 군집 중심
  3. KV.put(taste:{uid}, {centroids, k})
         |
         ▼
[Worker: POST /recommend]  ← 추천 탭 열 때
  1. KV.get(taste:{uid})
     → centroids 로드
  2. 각 centroid로 Vectorize.query(topK=40)
  3. 결과 병합 + 중복 제거
  4. diversify() 다양성 보정
  5. 응답
         |
         ▼
[Frontend: RecommendationPanel]
  → 추천 작품 카드 표시
  → 각 카드에 하트/공유 버튼
```

---

## 🚦 구현 순서 (우선순위)

| 순서 | 작업 | 예상 시간 | 상태 |
|------|------|-----------|------|
| 1 | Cloudflare KV 생성 + wrangler.toml 설정 | 15분 | ⬜ |
| 2 | Worker에 K-Means + `/taste-profile` + `/recommend` 추가 | 2시간 | ⬜ |
| 3 | Worker 배포 및 API 테스트 | 30분 | ⬜ |
| 4 | Frontend: 하트 시 취향 프로파일 업데이트 | 1시간 | ⬜ |
| 5 | Frontend: 추천 탭 + RecommendationPanel UI | 2시간 | ⬜ |
| 6 | 주간 전시 Cron Worker | 3시간 | ⬜ |
| 7 | 구독 결제 (Stripe) 연동 | 4시간 | ⬜ |
| 8 | 이메일 알림 (Resend) | 2시간 | ⬜ |

---

## 📁 파일 구조 (완성 시)

```
workers/
  semantic-search/src/index.ts     # ← /taste-profile, /recommend 엔드포인트 추가
  weekly-exhibition/src/index.ts   # ← NEW: 주간 전시 Cron Worker

src/
  components/
    GlobalSearchBar.tsx             # ← 추천 탭 추가, 하트 시 taste-profile 업데이트
    RecommendationPanel.tsx         # ← NEW: 추천 결과 UI
    WeeklyExhibition.tsx            # ← NEW: 주간 전시 페이지
  pages/
    MyExhibitionPage.tsx            # ← NEW: /my-exhibition 라우트

docs/
  RECOMMENDATION_SYSTEM_ROADMAP.md # ← 이 파일
```

---

## 🔑 환경변수 / Secrets

| 변수명 | 용도 | 위치 |
|--------|------|------|
| `HF_TOKEN` | SigLIP 텍스트 인코딩 | Worker Secret (기존) |
| `FIREBASE_SERVICE_ACCOUNT` | Firestore REST API | Worker Secret (신규) |
| `STRIPE_SECRET_KEY` | 구독 결제 | Worker Secret (신규) |
| `RESEND_API_KEY` | 이메일 발송 | Worker Secret (신규) |

---

*문서 작성: 2026-03-28*
*다음 작업 시작점: Phase 1 — Worker에 /taste-profile + /recommend 엔드포인트 추가*
