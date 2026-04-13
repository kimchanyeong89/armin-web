/**
 * Armin Semantic Search Worker — SigLIP 768D 버전
 *
 * 엔드포인트 목록:
 *  - POST /search-by-text   : 텍스트 → SigLIP 인코딩 → 유사 작품 검색
 *  - POST /search-by-vector : 벡터 직접 검색
 *  - POST /upsert           : 768D 벡터 업로드
 *  - POST /recommend-by-id  : ID 기반 유사 작품 추천
 *  - POST /taste-profile    : 사용자 취향 프로파일 생성/업데이트 (K-Means)
 *  - POST /recommend        : 취향 기반 개인화 추천
 *  - POST /check-ids        : ID 존재 여부 확인
 *  - POST /delete-ids       : Vectorize에서 벡터 삭제
 *  - GET  /status           : 서비스 상태 확인
 */

interface Env {
    VECTORIZE: VectorizeIndex;
    HF_TOKEN: string;
    TASTE_KV: KVNamespace;
}

interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

interface VectorizeIndex {
    query(vector: number[], options: { topK: number; returnMetadata?: 'all' | 'indexed' | 'none' | boolean }): Promise<{ matches: VectorMatch[] }>;
    upsert(vectors: VectorRecord[]): Promise<{ count: number }>;
    getByIds(ids: string[]): Promise<VectorRecord[]>;
    deleteByIds(ids: string[]): Promise<any>;
}

interface VectorRecord {
    id: string;
    values: number[];
    metadata?: Record<string, string | number | boolean>;
}

interface VectorMatch {
    id: string;
    score: number;
    metadata?: Record<string, string | number | boolean>;
}

interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
}

interface TasteProfile {
    centroids: number[][];
    k: number;
    updatedAt: number;
    likedCount: number;
}

const VECTOR_DIM = 768;
const MODEL_ID   = 'google/siglip-base-patch16-224';
const TASTE_KV_TTL = 60 * 60 * 24 * 30; // 30일

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
};

// ============================================================
// SigLIP 텍스트 인코딩 (HuggingFace Feature Extraction API)
// ============================================================
let vectorError = 'unknown';

async function encodeTextWithSigLIP(text: string, hfToken: string): Promise<number[] | null> {
    const endpoints = [
        `https://router.huggingface.co/hf-inference/pipeline/feature-extraction/${MODEL_ID}`,
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${MODEL_ID}`,
        `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`,
    ];

    const parseVector = (raw: any): number[] | null => {
        let vec: number[];
        if (Array.isArray(raw) && Array.isArray(raw[0])) {
            vec = raw[0];
        } else if (Array.isArray(raw)) {
            vec = raw;
        } else {
            return null;
        }
        if (vec.length !== VECTOR_DIM) return null;
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
        if (norm === 0) return null;
        return vec.map(v => v / norm);
    };

    for (const url of endpoints) {
        // 503 cold-start 시 최대 2회 재시도 (총 3회 시도)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${hfToken}`,
                        'Content-Type': 'application/json',
                        'X-Wait-For-Model': 'true',   // HTTP 헤더 버전
                        'X-Use-Cache': 'true',
                    },
                    body: JSON.stringify({ inputs: text, options: { wait_for_model: true, use_cache: true } })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    vectorError = `HF ${res.status} (attempt ${attempt + 1}, ${url.includes('api-inference') ? 'direct' : 'router'}): ${errText.slice(0, 200)}`;
                    if (res.status === 404) break; // 이 엔드포인트는 모델 없음 → 다음 엔드포인트
                    if (res.status === 503 && attempt < 2) {
                        // 모델 콜드 스타트 → 잠깐 기다렸다가 재시도
                        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                        continue;
                    }
                    break; // 다른 에러 → 다음 엔드포인트
                }

                const raw: any = await res.json();
                const vec = parseVector(raw);
                if (vec) return vec;

                vectorError = 'HF response format invalid or dimension mismatch';
                break;
            } catch (err) {
                vectorError = `HF request failed (attempt ${attempt + 1}): ${String(err).slice(0, 200)}`;
                console.error('encodeTextWithSigLIP error:', err);
                if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
            }
        }
    }
    return null;
}

// ============================================================
// K-Means 클러스터링 (취향 군집 분석)
// Center Space Trap 방지: 단일 평균 대신 K개 군집 중심 유지
// ============================================================

function l2Normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm > 0 ? v.map(x => x / norm) : v;
}

function cosineSim(a: number[], b: number[]): number {
    return a.reduce((s, v, i) => s + v * b[i], 0);
}

function vectorMean(vecs: number[][]): number[] {
    if (vecs.length === 0) return new Array(VECTOR_DIM).fill(0);
    const sum = vecs[0].map((_, j) => vecs.reduce((s, v) => s + v[j], 0) / vecs.length);
    return l2Normalize(sum);
}

/**
 * K-Means 클러스터링
 * @param vectors   - 입력 벡터 배열 (각 768D, L2 정규화됨)
 * @param k         - 군집 수
 * @param maxIter   - 최대 반복 횟수
 * @returns k개의 L2 정규화된 centroid 벡터
 */
function kMeans(vectors: number[][], k: number, maxIter: number = 50): number[][] {
    if (vectors.length === 0) return [];
    k = Math.min(k, vectors.length);
    if (k === 1) return [vectorMean(vectors)];

    // Forgy 초기화: 첫 번째는 랜덤, 나머지는 기존 centroid와 가장 먼 것 선택 (K-Means++ 유사)
    const indices = new Set<number>();
    indices.add(Math.floor(Math.random() * vectors.length));
    while (indices.size < k) {
        let maxDist = -1, farthest = 0;
        for (let i = 0; i < vectors.length; i++) {
            if (indices.has(i)) continue;
            const minSim = Math.min(...Array.from(indices).map(j => cosineSim(vectors[i], vectors[j])));
            if (minSim > maxDist) { maxDist = minSim; farthest = i; }
        }
        indices.add(farthest);
    }
    let centroids = Array.from(indices).map(i => [...vectors[i]]);

    for (let iter = 0; iter < maxIter; iter++) {
        const clusters: number[][][] = Array.from({ length: k }, () => []);

        for (const vec of vectors) {
            let bestK = 0, bestSim = -Infinity;
            for (let ci = 0; ci < k; ci++) {
                const sim = cosineSim(vec, centroids[ci]);
                if (sim > bestSim) { bestSim = sim; bestK = ci; }
            }
            clusters[bestK].push(vec);
        }

        const newCentroids = clusters.map((cluster, i) =>
            cluster.length > 0 ? vectorMean(cluster) : centroids[i]
        );

        // 수렴 확인
        if (centroids.every((c, i) => cosineSim(c, newCentroids[i]) > 0.9999)) break;
        centroids = newCentroids;
    }

    return centroids;
}

/**
 * 좋아요 수에 따라 최적 K 결정
 */
function chooseK(likedCount: number): number {
    if (likedCount < 5)  return 1;
    if (likedCount < 16) return 2;
    if (likedCount < 31) return 3;
    return 4;
}

// ============================================================
// 다양성 보정 (Diversity Injection)
// 같은 작가/시대/미술관 편중 방지 → Serendipity 실현
// ============================================================

function getEra(dateStr: string): string {
    const year = parseInt(String(dateStr || '').replace(/[^0-9]/g, '')) || 0;
    if (year === 0)   return 'unknown';
    if (year < 1400)  return 'medieval';
    if (year < 1700)  return 'renaissance';
    if (year < 1850)  return 'baroque_classical';
    if (year < 1920)  return 'impressionism_modern';
    if (year < 1970)  return 'modern';
    return 'contemporary';
}

function diversify(matches: VectorMatch[], limit: number): VectorMatch[] {
    const artistCount  = new Map<string, number>();
    const eraCount     = new Map<string, number>();
    const museumCount  = new Map<string, number>();
    const result: VectorMatch[] = [];

    // 점수 내림차순 정렬
    matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const maxArtist  = 3;
    const maxEra     = Math.ceil(limit * 0.30);
    const maxMuseum  = Math.ceil(limit * 0.40);

    for (const m of matches) {
        if (result.length >= limit) break;
        const artist = String(m.metadata?.a || '');
        const era    = getEra(String(m.metadata?.d || ''));
        const museum = String(m.metadata?.m || '');

        if (artist && (artistCount.get(artist) ?? 0) >= maxArtist)  continue;
        if (era    && (eraCount.get(era)       ?? 0) >= maxEra)     continue;
        if (museum && (museumCount.get(museum) ?? 0) >= maxMuseum)  continue;

        result.push(m);
        if (artist) artistCount.set(artist, (artistCount.get(artist) ?? 0) + 1);
        if (era)    eraCount.set(era,       (eraCount.get(era)       ?? 0) + 1);
        if (museum) museumCount.set(museum, (museumCount.get(museum) ?? 0) + 1);
    }

    // 부족하면 조건 완화해서 채우기 (다양성 조건이 너무 엄격할 경우 대비)
    if (result.length < limit) {
        const resultIds = new Set(result.map(m => m.id));
        for (const m of matches) {
            if (result.length >= limit) break;
            if (!resultIds.has(m.id)) { result.push(m); resultIds.add(m.id); }
        }
    }

    return result;
}

// ============================================================
// 벡터 쿼리 + 메타데이터 조회 (2-step)
//
// Vectorize 제한:
//   returnMetadata=true  → topK 최대 50
//   returnMetadata=false → topK 최대 100, 이후 getByIds로 메타데이터 조회
// ============================================================
async function queryWithMetadata(
    env: Env,
    vector: number[],
    topK: number
): Promise<Array<{ id: string; score: number; [key: string]: any }>> {
    const safeTopK = Math.min(topK, 100);

    if (safeTopK <= 50) {
        // 50개 이하면 단일 쿼리로 메타데이터까지 한 번에 가져옴
        const res = await env.VECTORIZE.query(vector, { topK: safeTopK, returnMetadata: true });
        return res.matches.map(m => ({ id: m.id, score: m.score, ...m.metadata }));
    }

    // 50개 초과: 2-step 쿼리
    // 1단계: ID + score만 가져오기 (returnMetadata='none' 시 topK 100까지 허용)
    const res = await env.VECTORIZE.query(vector, { topK: safeTopK, returnMetadata: 'none' });
    if (!res.matches.length) return [];

    // 2단계: 해당 ID들의 메타데이터를 getByIds로 조회
    const ids = res.matches.map(m => m.id);
    const scoreMap = new Map<string, number>(res.matches.map(m => [m.id, m.score]));

    // getByIds는 최대 20개씩 처리 가능하므로 배치로 분할
    const BATCH = 20;
    const metaRecords: VectorRecord[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
        const batch = await env.VECTORIZE.getByIds(ids.slice(i, i + BATCH));
        metaRecords.push(...batch);
    }

    // score와 metadata 합산, 원래 score 순서 유지
    const metaMap = new Map<string, Record<string, any>>(
        metaRecords.map(r => [r.id, r.metadata || {}])
    );
    return ids.map(id => ({
        id,
        score: scoreMap.get(id) ?? 0,
        ...metaMap.get(id),
    }));
}

// ============================================================
// 메인 핸들러
// ============================================================
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {

            // ──────────────────────────────────────────────
            // POST /search-by-text
            // ──────────────────────────────────────────────
            if (url.pathname === '/search-by-text' && request.method === 'POST') {
                const body = await request.json() as { text: string; limit?: number };
                const { text, limit = 50 } = body;

                if (!text || typeof text !== 'string' || text.trim().length < 2) {
                    return Response.json({ error: 'text must be at least 2 characters' }, { status: 400, headers: corsHeaders });
                }
                if (!env.HF_TOKEN) {
                    return Response.json({ error: 'HF_TOKEN not configured' }, { status: 500, headers: corsHeaders });
                }

                const vector = await encodeTextWithSigLIP(text.trim(), env.HF_TOKEN);
                if (!vector) {
                    return Response.json({ error: 'Failed to encode text.', detail: vectorError }, { status: 503, headers: corsHeaders });
                }

                const results = await queryWithMetadata(env, vector, Math.min(limit, 100));
                return Response.json({ results }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /search-by-vector
            // ──────────────────────────────────────────────
            if (url.pathname === '/search-by-vector' && request.method === 'POST') {
                const body = await request.json() as { vector: number[]; limit?: number };
                const { vector, limit = 50 } = body;

                if (!vector || !Array.isArray(vector) || vector.length !== VECTOR_DIM) {
                    return Response.json(
                        { error: `Invalid vector (must be ${VECTOR_DIM} dimensions, got ${vector?.length ?? 'none'})` },
                        { status: 400, headers: corsHeaders }
                    );
                }

                const results = await queryWithMetadata(env, vector, Math.min(limit, 100));
                return Response.json({ results }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /upsert
            // ──────────────────────────────────────────────
            if (url.pathname === '/upsert' && request.method === 'POST') {
                const { vectors } = await request.json() as {
                    vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>
                };

                if (!vectors?.length) {
                    return Response.json({ error: 'No vectors provided' }, { status: 400, headers: corsHeaders });
                }

                const valid = vectors.filter(v => v.id && Array.isArray(v.values) && v.values.length === VECTOR_DIM);
                if (valid.length === 0) {
                    return Response.json({ error: `No valid ${VECTOR_DIM}-dim vectors found` }, { status: 400, headers: corsHeaders });
                }

                const records: VectorRecord[] = valid.map(v => ({ id: v.id, values: v.values, metadata: v.metadata || {} }));
                try {
                    await env.VECTORIZE.upsert(records);
                    return Response.json({ success: true, count: records.length }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // POST /recommend-by-id
            // ──────────────────────────────────────────────
            if (url.pathname === '/recommend-by-id' && request.method === 'POST') {
                const { id, limit = 6 } = await request.json() as { id: string; limit?: number };
                if (!id) return Response.json({ error: 'ID is required' }, { status: 400, headers: corsHeaders });

                try {
                    const vectors = await env.VECTORIZE.getByIds([id]);
                    if (!vectors?.length) return Response.json({ results: [] }, { headers: corsHeaders });

                    const searchResults = await env.VECTORIZE.query(vectors[0].values, {
                        topK: Math.min(limit + 20, 50),
                        returnMetadata: true
                    });

                    const candidates = searchResults.matches.filter(m => m.id !== id);
                    // Apply diversity filtering to prevent same-museum / same-artist bias
                    const matches = diversify(candidates, limit);
                    return Response.json({
                        results: matches.map(m => ({ id: m.id, score: m.score, ...m.metadata }))
                    }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ results: [] }, { headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // POST /taste-profile
            // 하트 목록 → K-Means → KV에 취향 centroids 저장
            // Body: { userId: string, likedIds: string[] }
            // ──────────────────────────────────────────────
            if (url.pathname === '/taste-profile' && request.method === 'POST') {
                const body = await request.json() as { userId: string; likedIds: string[] };
                const { userId, likedIds } = body;

                if (!userId || typeof userId !== 'string') {
                    return Response.json({ error: 'userId required' }, { status: 400, headers: corsHeaders });
                }
                if (!likedIds || !Array.isArray(likedIds) || likedIds.length === 0) {
                    return Response.json({ error: 'likedIds array required' }, { status: 400, headers: corsHeaders });
                }

                // Vectorize에서 하트 작품 벡터 fetch (최대 300개, 배치로)
                // 많은 하트 중 앞쪽이 임베딩 없을 수 있어 셔플 후 시도
                const shuffledIds = [...likedIds].sort(() => Math.random() - 0.5);
                const BATCH = 30; // Vectorize getByIds 배치 크기
                const allVecs: number[][] = [];
                for (let i = 0; i < Math.min(shuffledIds.length, 300); i += BATCH) {
                    const batch = shuffledIds.slice(i, i + BATCH);
                    try {
                        const fetched = await env.VECTORIZE.getByIds(batch);
                        for (const rec of fetched) {
                            if (rec.values && rec.values.length === VECTOR_DIM) {
                                allVecs.push(rec.values);
                            }
                        }
                    } catch {
                        // 배치 오류 시 스킵
                    }
                    if (allVecs.length >= 60) break; // 충분하면 조기 종료
                }

                if (allVecs.length === 0) {
                    return Response.json({ error: 'No vectors found for likedIds' }, { status: 404, headers: corsHeaders });
                }

                // K 결정 + K-Means
                const k = chooseK(allVecs.length);
                const centroids = kMeans(allVecs, k);

                const profile: TasteProfile = {
                    centroids,
                    k,
                    updatedAt: Date.now(),
                    likedCount: allVecs.length,
                };

                if (env.TASTE_KV) {
                    await env.TASTE_KV.put(`taste:${userId}`, JSON.stringify(profile), {
                        expirationTtl: TASTE_KV_TTL,
                    });
                }

                return Response.json({ success: true, k, likedCount: allVecs.length }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /recommend
            // 취향 프로파일 기반 개인화 추천
            // Body: { userId: string, likedIds: string[], limit?: number }
            // ──────────────────────────────────────────────
            if (url.pathname === '/recommend' && request.method === 'POST') {
                const body = await request.json() as {
                    userId: string;
                    likedIds: string[];
                    limit?: number;
                    themeVector?: number[]; // 주간 전시용 테마 벡터 (옵션)
                    themeWeight?: number;   // 테마 벡터 혼합 비율 (0~1, 기본 0)
                };
                const { userId, likedIds, limit = 20, themeVector, themeWeight = 0 } = body;

                if (!userId) {
                    return Response.json({ error: 'userId required' }, { status: 400, headers: corsHeaders });
                }

                // KV에서 취향 프로파일 로드
                let profile: TasteProfile | null = null;
                if (env.TASTE_KV) {
                    const raw = await env.TASTE_KV.get(`taste:${userId}`);
                    if (raw) {
                        try { profile = JSON.parse(raw); } catch { /* 손상된 데이터 무시 */ }
                    }
                }

                // 프로파일 없으면 즉석 계산 (첫 요청 대응 — 셔플로 벡터 없는 IDs 우회)
                if (!profile && likedIds?.length >= 1) {
                    const shuffled = [...likedIds].sort(() => Math.random() - 0.5);
                    const vecs: number[][] = [];
                    for (let i = 0; i < Math.min(shuffled.length, 150); i += 30) {
                        try {
                            const batch = await env.VECTORIZE.getByIds(shuffled.slice(i, i + 30));
                            for (const rec of batch) {
                                if (rec.values?.length === VECTOR_DIM) vecs.push(rec.values);
                            }
                        } catch { /* skip */ }
                        if (vecs.length >= 30) break; // 충분하면 조기 종료
                    }
                    if (vecs.length > 0) {
                        const k = chooseK(vecs.length);
                        profile = { centroids: kMeans(vecs, k), k, updatedAt: Date.now(), likedCount: vecs.length };
                    }
                }

                if (!profile || !profile.centroids?.length) {
                    return Response.json({ results: [], reason: 'no_profile' }, { headers: corsHeaders });
                }

                // 각 centroid에서 Vectorize 검색 (적절히 여유있게 pull)
                const likedSet = new Set(likedIds ?? []);
                const perK     = Math.ceil((limit * 3) / profile.centroids.length);
                const allMatches = new Map<string, VectorMatch>();

                for (let ci = 0; ci < profile.centroids.length; ci++) {
                    let searchVec = profile.centroids[ci];

                    // 테마 벡터 혼합 (주간 전시 모드)
                    if (themeVector?.length === VECTOR_DIM && themeWeight > 0) {
                        const tw = Math.max(0, Math.min(1, themeWeight));
                        searchVec = l2Normalize(
                            searchVec.map((v, j) => v * (1 - tw) + themeVector[j] * tw)
                        );
                    }

                    try {
                        const res = await env.VECTORIZE.query(searchVec, {
                            topK: Math.min(perK + Math.min(likedIds?.length ?? 0, 200), 100),
                            returnMetadata: true,
                        });
                        for (const m of res.matches) {
                            if (likedSet.has(m.id)) continue; // 이미 하트한 것 제외
                            const existing = allMatches.get(m.id);
                            if (!existing || existing.score < m.score) {
                                allMatches.set(m.id, m);
                            }
                        }
                    } catch { /* centroid 검색 실패 시 스킵 */ }
                }

                // 다양성 보정 후 최종 결과
                const diversified = diversify(Array.from(allMatches.values()), limit);

                return Response.json({
                    results: diversified.map(m => ({ id: m.id, score: m.score, ...m.metadata })),
                    k: profile.k,
                    likedCount: profile.likedCount,
                }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /delete-ids
            // ──────────────────────────────────────────────
            if (url.pathname === '/delete-ids' && request.method === 'POST') {
                const { ids } = await request.json() as { ids: string[] };
                if (!ids || !Array.isArray(ids) || ids.length === 0) {
                    return Response.json({ error: 'ids array required' }, { status: 400, headers: corsHeaders });
                }
                try {
                    const result = await env.VECTORIZE.deleteByIds(ids);
                    return Response.json({ success: true, deleted: result }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // POST /check-ids
            // ──────────────────────────────────────────────
            if (url.pathname === '/check-ids' && request.method === 'POST') {
                const { ids } = await request.json() as { ids: string[] };
                try {
                    const found = await env.VECTORIZE.getByIds(ids);
                    return Response.json({ count: found.length, foundIds: found.map(f => f.id) }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // GET /status
            // ──────────────────────────────────────────────
            if (url.pathname === '/status') {
                return Response.json({
                    status: 'ok',
                    model: MODEL_ID,
                    dimensions: VECTOR_DIM,
                    textEncoding: 'server-side (HuggingFace API)',
                    browserDownload: '0MB',
                    vectorize: 'armin-art-search-768',
                    features: ['search-by-text', 'search-by-vector', 'taste-profile', 'recommend'],
                }, { headers: corsHeaders });
            }

            return Response.json(
                { error: 'Not found. Endpoints: /search-by-text, /search-by-vector, /upsert, /recommend-by-id, /taste-profile, /recommend, /check-ids, /delete-ids, /status' },
                { status: 404, headers: corsHeaders }
            );

        } catch (err: any) {
            console.error('Worker error:', err);
            return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
    }
};
