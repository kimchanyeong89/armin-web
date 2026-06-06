/**
 * Armin Semantic Search Worker — SigLIP 768D 버전
 *
 * 엔드포인트 목록:
 *  - POST /search-by-text   : 텍스트 → SigLIP 인코딩 → 유사 작품 검색
 *  - POST /search-by-vector : 벡터 직접 검색
 *  - POST /encode           : 텍스트 → SigLIP 768D 벡터 (raw, for external clients)
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
    /** Jina CLIP v2 1024D 인덱스. 마이그레이션 중. */
    VECTORIZE_JINA?: VectorizeIndex;
    /** Modal에 배포된 Jina v2 텍스트 인코더 URL. 미설정 시 기본값 사용. */
    JINA_TEXT_ENCODER_URL?: string;
    HF_TOKEN: string;
    TASTE_KV: KVNamespace;
    /** D1 database for keyword text search (FTS5 on artwork name/artist/museum).
     *  Created via:  npx wrangler d1 create armin-text-search
     *  Schema seeded from workers/semantic-search/schema.sql + d1-seed.sql */
    DB?: D1Database;
    /** Optional: full URL to a self-hosted SigLIP encoder (e.g. HF Space FastAPI).
     *  Expected: POST {url}/encode  → { vector: number[768] } or { embeddings: [[768D]] }
     *  When set, this is tried FIRST. Falls back to HF Inference Providers afterwards.
     *  Configure via:  npx wrangler secret put SIGLIP_ENDPOINT_URL
     */
    SIGLIP_ENDPOINT_URL?: string;
    /** Optional: bearer token for the self-hosted encoder (if it requires auth). */
    SIGLIP_ENDPOINT_TOKEN?: string;
    /** Cloudflare Workers AI binding — used to translate non-English queries
     *  (Korean / Japanese / Chinese / etc.) into English before SigLIP encoding,
     *  because the deployed SigLIP base model is English-only. */
    AI?: {
        run(model: string, input: Record<string, unknown>): Promise<unknown>;
    };
}

interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement;
    all(): Promise<{ results: any[] }>;
    first<T = any>(): Promise<T | null>;
    run(): Promise<any>;
}

interface D1Database {
    prepare(query: string): D1PreparedStatement;
    exec(query: string): Promise<any>;
    batch(statements: D1PreparedStatement[]): Promise<any>;
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
const QUERY_CACHE_TTL = 60 * 60 * 24 * 7; // 쿼리 벡터 캐시 7일
const QUERY_CACHE_PREFIX = 'qcache:v2:'; // bump suffix to invalidate cache
const TRANSLATION_CACHE_TTL = 60 * 60 * 24 * 90; // 번역 캐시 90일 (의미가 거의 안 변함)
const TRANSLATION_CACHE_PREFIX = 'tx:v2:'; // v2: m2m100 → llama instruct 전환 시 캐시 무효화

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
};

// Vectorize hard-caps record IDs at 64 bytes (VECTOR_GET_ERROR 40008).
// Any longer ID we generate a deterministic short alias for. Short IDs are
// only used internally — the worker swaps them back to the original ID
// (carried in metadata.o) before responding, so the frontend never sees them.
const VECTORIZE_ID_MAX_BYTES = 64;
const SHORT_ID_PREFIX = 'vbz_'; // 4 bytes; leaves 60 for the hash

async function shortenId(originalId: string): Promise<string> {
    const data = new TextEncoder().encode(originalId);
    const digest = await crypto.subtle.digest('SHA-1', data);
    // hex slice — 16 chars after the prefix → 20-byte total ID, far under 64.
    let hex = '';
    const bytes = new Uint8Array(digest);
    for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return SHORT_ID_PREFIX + hex;
}

/**
 * Map an arbitrary artwork ID to the form actually stored in Vectorize.
 * Short IDs (≤64 bytes) pass through unchanged so the existing 612K records
 * stay accessible. Longer IDs get a deterministic SHA-1 alias prefixed with
 * `vbz_` — the alias is 20 bytes and guaranteed to round-trip the same way.
 */
async function effectiveVectorId(originalId: string): Promise<string> {
    if (!originalId) return '';
    if (originalId.startsWith(SHORT_ID_PREFIX)) return originalId; // already short
    if (new TextEncoder().encode(originalId).length <= VECTORIZE_ID_MAX_BYTES) return originalId;
    return shortenId(originalId);
}

/**
 * Replace short IDs with their `metadata.o` (original ID) before sending to
 * the client. Preserves all other fields and removes the now-redundant `o`
 * key. Idempotent — records with no `o` field are returned untouched.
 */
function denormalizeRecord<T extends { id: string; metadata?: Record<string, any> } | { id: string; [key: string]: any }>(rec: T): T {
    const r = rec as any;
    const original = r?.metadata?.o ?? r?.o;
    if (typeof original === 'string' && original.length > 0) {
        if (r.metadata && 'o' in r.metadata) {
            const { o, ...rest } = r.metadata;
            r.metadata = rest;
        } else if ('o' in r) {
            const { o, ...rest } = r;
            return { ...rest, id: original } as T;
        }
        r.id = original;
    }
    return r;
}

// ============================================================
// 쿼리 벡터 캐시 (KV)
// 동일 검색어 재요청 시 HF 호출을 우회하여 비용/지연 감소.
// ============================================================
async function sha256Hex(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function cacheKey(text: string): Promise<string> {
    // normalize: lowercase + collapse whitespace → 같은 의미 쿼리는 같은 키
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return QUERY_CACHE_PREFIX + (await sha256Hex(normalized));
}

async function getCachedVector(env: Env, text: string, expectedDim: number = VECTOR_DIM): Promise<number[] | null> {
    if (!env.TASTE_KV) return null;
    try {
        const key = await cacheKey(text);
        const raw = await env.TASTE_KV.get(key);
        if (!raw) return null;
        const vec = JSON.parse(raw) as number[];
        if (!Array.isArray(vec) || vec.length !== expectedDim) return null;
        return vec;
    } catch {
        return null;
    }
}

async function putCachedVector(env: Env, text: string, vec: number[]): Promise<void> {
    if (!env.TASTE_KV) return;
    try {
        const key = await cacheKey(text);
        await env.TASTE_KV.put(key, JSON.stringify(vec), { expirationTtl: QUERY_CACHE_TTL });
    } catch (err) {
        console.warn('query-cache put failed:', err);
    }
}

// ─────────────────────────────────────────────────────────────
// 검색 결과 자체 캐시 — 인코더 호출 + Vectorize 쿼리 둘 다 건너뜀.
// 인기 query (예: "추상화", "풍경") cache hit 시 latency 0-50ms.
// 7일 TTL.
// ─────────────────────────────────────────────────────────────
const SEARCH_RESULT_TTL = 60 * 60 * 24 * 7;  // 7일

async function getCachedSearchResults(env: Env, cacheKeyStr: string): Promise<any[] | null> {
    if (!env.TASTE_KV) return null;
    try {
        const key = 'sres:' + (await sha256Hex(cacheKeyStr));
        const raw = await env.TASTE_KV.get(key);
        if (!raw) return null;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : null;
    } catch {
        return null;
    }
}

async function putCachedSearchResults(env: Env, cacheKeyStr: string, results: any[]): Promise<void> {
    if (!env.TASTE_KV) return;
    try {
        const key = 'sres:' + (await sha256Hex(cacheKeyStr));
        await env.TASTE_KV.put(key, JSON.stringify(results), { expirationTtl: SEARCH_RESULT_TTL });
    } catch (err) {
        console.warn('search-result cache put failed:', err);
    }
}

// ============================================================
// 비영어 쿼리 → 영어 번역 (Cloudflare Workers AI)
//
// SigLIP base 모델은 영어 캡션만으로 학습되어 한국어/일본어/중국어 등은
// 토큰화 단계에서 망가진다. 따라서 비라틴 쿼리는 m2m100으로 영어 번역 후 인코딩.
// 번역 결과는 KV에 90일 캐시 (같은 쿼리 재요청 시 AI 호출 0회).
// ============================================================

/**
 * 텍스트의 주요 스크립트로 언어 코드를 추정한다.
 * 순수 ASCII/Latin이면 null — 영어로 간주, 번역을 건너뛴다.
 * 비영어 코드를 반환하면 호출부는 번역 경로를 탄다 (코드 자체는 게이트 용도).
 *
 * 일본어는 한자(漢字)를 포함하므로 가나(かな) 존재 여부를 한자보다 먼저 검사한다.
 */
function detectSourceLang(text: string): string | null {
    if (/[가-힣ㄱ-ㆎ]/.test(text)) return 'ko';   // 한글
    if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';     // 히라가나·가타카나 → 일본어
    if (/[一-鿿]/.test(text)) return 'zh';          // 한자만 → 중국어
    if (/[Ѐ-ӿ]/.test(text)) return 'ru';           // 키릴
    if (/[؀-ۿ]/.test(text)) return 'ar';           // 아랍
    if (/[ऀ-ॿ]/.test(text)) return 'hi';           // 데바나가리
    if (/[฀-๿]/.test(text)) return 'th';           // 태국
    if (/[֐-׿]/.test(text)) return 'he';           // 히브리
    return null;
}

// SigLIP's text encoder expects caption-like text; a bare keyword ("tiger") lands
// near the modality-gap centroid and retrieves near-random images. Wrapping the
// query in a minimal caption restores text→image alignment.
function toSiglipCaption(query: string): string {
    const q = (query || '').trim();
    return q ? `a painting of ${q}` : q;
}

async function translationCacheKey(text: string): Promise<string> {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return TRANSLATION_CACHE_PREFIX + (await sha256Hex(normalized));
}

async function getCachedTranslation(env: Env, text: string): Promise<string | null> {
    if (!env.TASTE_KV) return null;
    try {
        const key = await translationCacheKey(text);
        return await env.TASTE_KV.get(key);
    } catch {
        return null;
    }
}

async function putCachedTranslation(env: Env, original: string, translated: string): Promise<void> {
    if (!env.TASTE_KV) return;
    try {
        const key = await translationCacheKey(original);
        await env.TASTE_KV.put(key, translated, { expirationTtl: TRANSLATION_CACHE_TTL });
    } catch (err) {
        console.warn('translation-cache put failed:', err);
    }
}

/**
 * Cloudflare Workers AI LLM(llama-3.1-8b-instruct)으로 임의 언어 → 영어 번역.
 *
 * 전용 번역 모델(m2m100)보다 instruct LLM을 쓰는 이유: AI 검색은 "자연어로
 * 자유롭게" 검색하는 것이 핵심이라 시적·서술적 쿼리가 많은데, m2m100은 짧은
 * 비문법 구절에서 의미를 흘린다(예: "고요한 풍경" → "a silent sight", 'scenery' 누락).
 * LLM은 검색 의도를 보존한 자연스러운 영어 구절을 만든다.
 *
 * 결과는 90일 캐시되므로 호출당 neuron 비용은 사실상 무시 가능.
 * 실패 시 null — 호출자는 원문을 그대로 인코딩 시도해야 한다.
 */
async function translateToEnglish(text: string, env: Env): Promise<string | null> {
    if (!env.AI) return null;
    try {
        const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
                {
                    role: 'system',
                    content: 'You translate art-image search queries into English. ' +
                        'The query may be in any language. Output ONLY the English translation ' +
                        'as a short, natural, descriptive search phrase — no quotes, no explanation, ' +
                        'no preamble. Preserve the visual and emotional intent of the query. ' +
                        'If the input is already English, return it unchanged.',
                },
                { role: 'user', content: text },
            ],
            max_tokens: 64,
            temperature: 0,
        });
        const raw = (result as { response?: string })?.response;
        if (typeof raw !== 'string') return null;
        // LLM이 가끔 따옴표·마침표를 붙이므로 정리
        const cleaned = raw.trim().replace(/^["'`]|["'`]$/g, '').trim();
        return cleaned.length > 0 ? cleaned : null;
    } catch (err) {
        console.warn('[translate] llama failed:', err);
        return null;
    }
}

/** FTS5 키워드 토큰화: 연산자·제어 문자 제거 → 소문자 → 공백 분리 → 2자 이상만 남김 */
function ftsTokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/["'()\\]/g, ' ')
        .replace(/[ -]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2);
}

// ============================================================
// SigLIP 텍스트 인코딩
//
// HuggingFace는 google/siglip-base-patch16-224 의 feature-extraction
// 호스팅을 hf-inference 프로바이더에서 종료했습니다 (2025-late~).
// 어떤 Inference Provider도 현재 이 모델을 호스팅하지 않습니다.
//
// 따라서 우선순위는:
//   1. SIGLIP_ENDPOINT_URL — 사용자 자체 호스팅 (HF Space CPU FastAPI 등)
//   2. HF Router /hf-inference/models/... — 추후 복구되면 자동 사용 가능
//   3. HF api-inference.huggingface.co — 레거시 fallback
//
// 모든 경로 실패 시 null 반환 (호출 측에서 503 + code=siglip_unavailable 응답).
// ============================================================
let vectorError = 'unknown';

function parseHFVector(raw: any): number[] | null {
    let vec: any;
    // 자체 호스팅 응답: { vector: [...] } 또는 { embedding: [...] } 또는 { embeddings: [[...]] }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        vec = raw.vector ?? raw.embedding ?? raw.embeddings ?? null;
        if (Array.isArray(vec) && Array.isArray(vec[0])) vec = vec[0];
    }
    // HF Inference API 응답: [[...]] 또는 [...]
    if (vec == null) {
        if (Array.isArray(raw) && Array.isArray(raw[0])) vec = raw[0];
        else if (Array.isArray(raw)) vec = raw;
    }
    if (!Array.isArray(vec) || vec.length !== VECTOR_DIM) return null;
    if (typeof vec[0] !== 'number') return null;
    const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
    if (norm === 0) return null;
    return vec.map((v: number) => v / norm);
}

async function tryEndpoint(
    url: string,
    headers: Record<string, string>,
    body: any,
    label: string,
    timeoutMs: number = 60_000,
): Promise<number[] | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
            clearTimeout(timer);

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                vectorError = `${label} ${res.status} (attempt ${attempt + 1}): ${errText.slice(0, 200)}`;
                if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) return null;
                if ((res.status === 503 || res.status === 502 || res.status === 504) && attempt < 2) {
                    // cold start → wait then retry
                    await new Promise(r => setTimeout(r, 2500 * (attempt + 1)));
                    continue;
                }
                return null;
            }

            const raw: any = await res.json();
            const vec = parseHFVector(raw);
            if (vec) return vec;
            vectorError = `${label}: response format invalid or dimension mismatch`;
            return null;
        } catch (err: any) {
            clearTimeout(timer);
            const msg = err?.name === 'AbortError' ? 'timeout' : String(err);
            vectorError = `${label} request failed (attempt ${attempt + 1}): ${msg.slice(0, 200)}`;
            if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
        }
    }
    return null;
}

/**
 * Encode an image (by URL) into a 768-D SigLIP vector. Used by the
 * /encode-and-upsert endpoint when re-embedding artworks whose IDs were
 * too long for Vectorize's 64-byte limit.
 *
 * Tries the self-hosted endpoint first with several common payload
 * shapes (different SigLIP FastAPI servers use different keys), then
 * falls back to HuggingFace Inference API with the image bytes.
 */
async function encodeImageWithSigLIP(imageUrl: string, env: Env): Promise<number[] | null> {
    if (env.SIGLIP_ENDPOINT_URL) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (env.SIGLIP_ENDPOINT_TOKEN) headers['Authorization'] = `Bearer ${env.SIGLIP_ENDPOINT_TOKEN}`;

        // Path 1: dedicated /encode-image endpoint
        const baseUrl = env.SIGLIP_ENDPOINT_URL.replace(/\/+$/, '');
        const candidates: Array<{ url: string; body: any; label: string }> = [
            { url: `${baseUrl}/encode-image`, body: { image_url: imageUrl }, label: 'self-host /encode-image image_url' },
            { url: `${baseUrl}/encode-image`, body: { url: imageUrl }, label: 'self-host /encode-image url' },
            { url: `${baseUrl}/embed-image`, body: { image_url: imageUrl }, label: 'self-host /embed-image' },
            { url: `${baseUrl}/encode`, body: { image_url: imageUrl }, label: 'self-host /encode image_url' },
            { url: `${baseUrl}/encode`, body: { url: imageUrl }, label: 'self-host /encode url' },
        ];
        for (const cand of candidates) {
            const vec = await tryEndpoint(cand.url, headers, cand.body, cand.label, 90_000);
            if (vec) return vec;
        }
    }

    if (env.HF_TOKEN) {
        // HF expects raw image bytes for image feature extraction.
        try {
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) {
                vectorError = `image fetch failed (${imgRes.status})`;
                return null;
            }
            const bytes = await imgRes.arrayBuffer();
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 60_000);
            try {
                const res = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${MODEL_ID}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.HF_TOKEN}`,
                        'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
                        'X-Wait-For-Model': 'true',
                    },
                    body: bytes,
                    signal: ctrl.signal,
                });
                clearTimeout(timer);
                if (!res.ok) {
                    vectorError = `HF image (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`;
                    return null;
                }
                const raw = await res.json();
                return parseHFVector(raw);
            } finally { clearTimeout(timer); }
        } catch (err: any) {
            vectorError = `HF image request failed: ${String(err).slice(0, 200)}`;
            return null;
        }
    }

    return null;
}

async function encodeTextWithSigLIP(text: string, env: Env): Promise<number[] | null> {
    // ── Tier 1: 사용자 자체 호스팅 (FastAPI HF Space 등) ──
    if (env.SIGLIP_ENDPOINT_URL) {
        const url = env.SIGLIP_ENDPOINT_URL.replace(/\/+$/, '') + '/encode';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (env.SIGLIP_ENDPOINT_TOKEN) headers['Authorization'] = `Bearer ${env.SIGLIP_ENDPOINT_TOKEN}`;
        const vec = await tryEndpoint(url, headers, { text }, 'self-host', 60_000);
        if (vec) return vec;
    }

    // ── Tier 2: HF Inference Providers (currently broken for SigLIP) ──
    if (env.HF_TOKEN) {
        const hfHeaders: Record<string, string> = {
            'Authorization': `Bearer ${env.HF_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Wait-For-Model': 'true',
            'X-Use-Cache': 'true',
        };
        const hfBody = { inputs: text, options: { wait_for_model: true, use_cache: true } };
        const hfEndpoints = [
            `https://router.huggingface.co/hf-inference/pipeline/feature-extraction/${MODEL_ID}`,
            `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`,
            `https://api-inference.huggingface.co/pipeline/feature-extraction/${MODEL_ID}`,
        ];
        for (const url of hfEndpoints) {
            const vec = await tryEndpoint(url, hfHeaders, hfBody, `HF (${url.includes('api-inference') ? 'direct' : 'router'})`, 30_000);
            if (vec) return vec;
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

// ── 취향 군집(K-Means) 설정 ──────────────────────────────────────────
// K(군집 수)는 좋아요 수에 비례해 늘어난다. 단, /recommend가 centroid마다
// Vectorize를 1회씩 순차 호출하므로 worker 부하 보호를 위해 MAX_TASTE_K로 상한.
const TASTE_K_PER_LIKES = 8;                              // 좋아요 8개당 군집 1개
const MAX_TASTE_K = 24;                                   // 군집 수 상한
const TASTE_SAMPLE_CAP = MAX_TASTE_K * TASTE_K_PER_LIKES; // 클러스터링 표본 상한(=192) — K 상한 도달에 필요한 최소 벡터 수
const TASTE_ID_SCAN_CAP = 400;                            // Vectorize에서 시도할 최대 좋아요 ID 수

/**
 * 좋아요 수에 비례해 취향 군집 수 K를 결정한다.
 * 좋아요 TASTE_K_PER_LIKES개당 군집 1개씩 늘어나며 MAX_TASTE_K에서 상한.
 */
function chooseK(likedCount: number): number {
    return Math.max(1, Math.min(MAX_TASTE_K, Math.ceil(likedCount / TASTE_K_PER_LIKES)));
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

function diversify(matches: VectorMatch[], limit: number, preSorted = false): VectorMatch[] {
    const artistCount  = new Map<string, number>();
    const eraCount     = new Map<string, number>();
    const museumCount  = new Map<string, number>();
    const result: VectorMatch[] = [];

    // 점수 내림차순 정렬 — preSorted=true면 호출자가 정한 순서(취향 군집 인터리브)를 유지
    if (!preSorted) matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

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
        return res.matches.map(m => {
            const md = m.metadata || {};
            // metadata.o is the original ID for shortened-ID records;
            // swap it back so the client never sees the internal vbz_ alias.
            const original = typeof md.o === 'string' ? md.o : '';
            const { o, ...rest } = md as any;
            return {
                id: original || m.id,
                score: m.score,
                ...rest,
            };
        });
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
    return ids.map(id => {
        const md = metaMap.get(id) || {};
        const original = typeof md.o === 'string' ? md.o : '';
        const { o, ...rest } = md as any;
        return {
            id: original || id,
            score: scoreMap.get(id) ?? 0,
            ...rest,
        };
    });
}

// ============================================================
// 메인 핸들러
// ============================================================
export default {
    /**
     * 매 4분마다 Cloud Run Jina 인코더에 /warmup 호출 → cold start 회피.
     * Cloud Run min=0 (비용 절감)이라 idle 시 컨테이너 종료 → 첫 요청 cold.
     * scheduled 으로 항상-warm 유지. CF Workers scheduled = 무료 무제한.
     */
    async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
        const url = env.JINA_TEXT_ENCODER_URL;
        if (!url) return;
        try {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 25000);
            const r = await fetch(`${url}/warmup`, { signal: ctl.signal });
            clearTimeout(timer);
            console.log(`[warmup] HTTP ${r.status}`);
        } catch (err: any) {
            console.warn(`[warmup] failed: ${err.message}`);
        }
    },

    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {

            // ──────────────────────────────────────────────
            // POST /search-by-text
            //
            // 라우팅: Jina v2 (한국어 native) 시도 → 실패 시 SigLIP+번역 fallback
            //   - body.engine = 'siglip' 강제 지정 시 우회 가능 (A/B용)
            //   - Jina 인코더 다운/타임아웃 시 자동 SigLIP fallback → 검색 영구 작동
            //   - 응답에 engine 필드로 어느 path가 사용됐는지 표시
            // ──────────────────────────────────────────────
            if (url.pathname === '/search-by-text' && request.method === 'POST') {
                const body = await request.json() as { text: string; limit?: number; engine?: 'auto' | 'jina' | 'siglip' };
                const { text, limit = 50, engine = 'auto' } = body;

                if (!text || typeof text !== 'string' || text.trim().length < 2) {
                    return Response.json({ error: 'text must be at least 2 characters' }, { status: 400, headers: corsHeaders });
                }

                const trimmed = text.trim();

                // ── Jina path (auto/jina) ──
                // 인코더는 외부(Modal). 5초 timeout. 실패 시 SigLIP로 fallback.
                if (engine !== 'siglip' && env.VECTORIZE_JINA) {
                    const encoderUrl = env.JINA_TEXT_ENCODER_URL
                        || 'https://kimchanyeong89--jina-text-encoder-textencoder-encode.modal.run';

                    // 1) 검색 결과 통째 캐시 (인코더 + Vectorize 둘 다 건너뜀)
                    const resultsCacheKey = `jina:res:${trimmed}:${Math.min(limit, 100)}`;
                    const cachedResults = await getCachedSearchResults(env, resultsCacheKey);
                    if (cachedResults) {
                        return Response.json({
                            results: cachedResults,
                            cached: true,
                            cacheLayer: 'results',
                            engine: 'jina-clip-v2',
                        }, { headers: corsHeaders });
                    }

                    try {
                        const cacheKey = `jinavec:${trimmed}`;
                        let vec: number[] | null = await getCachedVector(env, cacheKey, 1024);
                        let cached = !!vec;
                        if (!vec) {
                            const ctl = new AbortController();
                            // 30초 — Cloud Run cold start (min=0) 시 ~20초 모델 로드 허용.
                            // warm 상태면 보통 1-3초.
                            const timer = setTimeout(() => ctl.abort(), 30000);
                            const enc = await fetch(encoderUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: trimmed }),
                                signal: ctl.signal,
                            });
                            clearTimeout(timer);
                            if (enc.ok) {
                                const data = await enc.json() as { vectors?: number[][] };
                                vec = data.vectors?.[0] ?? null;
                                if (vec) ctx.waitUntil(putCachedVector(env, cacheKey, vec));
                            }
                        }
                        if (vec) {
                            const safeTopK = Math.min(limit, 100);
                            const qres = await env.VECTORIZE_JINA.query(vec, { topK: safeTopK, returnMetadata: 'none' });
                            if (qres.matches.length) {
                                const ids = qres.matches.map(m => m.id);
                                const scoreMap = new Map<string, number>(qres.matches.map(m => [m.id, m.score]));
                                const BATCH = 20;
                                const slices: string[][] = [];
                                for (let i = 0; i < ids.length; i += BATCH) slices.push(ids.slice(i, i + BATCH));
                                // 두 인덱스(Jina+SigLIP)의 모든 배치를 순차가 아니라 병렬 조회.
                                // limit=100이면 ~10번의 직렬 왕복이 한 번의 물결로 합쳐진다.
                                // SigLIP은 해당 ID가 없을 수 있어(768 인덱스 미보유) 빈 배치로 가드.
                                const [jinaBatches, sigBatches] = await Promise.all([
                                    Promise.all(slices.map(s => env.VECTORIZE_JINA.getByIds(s))),
                                    Promise.all(slices.map(s => env.VECTORIZE.getByIds(s).catch(() => [] as VectorRecord[]))),
                                ]);
                                const jinaMeta: VectorRecord[] = jinaBatches.flat();
                                const sigMeta: VectorRecord[] = sigBatches.flat();
                                const jmm = new Map<string, Record<string, any>>(jinaMeta.map(r => [r.id, r.metadata || {}]));
                                const smm = new Map<string, Record<string, any>>(sigMeta.map(r => [r.id, r.metadata || {}]));
                                const results = ids
                                    .map(id => {
                                        const jm = jmm.get(id) || {};
                                        const sm = smm.get(id) || {};
                                        const original = typeof jm.o === 'string' ? jm.o : null;
                                        const { o: _o, ...sigRest } = sm as any;
                                        return {
                                            id: original || id,
                                            score: scoreMap.get(id),
                                            ...sigRest,
                                            ...(jm.e ? { e: jm.e } : {}),
                                        };
                                    })
                                    .filter(r => r.score !== undefined);
                                // 결과 캐시 저장 (다음 같은 query는 인코더 + Vectorize 둘 다 스킵)
                                ctx.waitUntil(putCachedSearchResults(env, resultsCacheKey, results));
                                return Response.json({
                                    results,
                                    cached,
                                    cacheLayer: cached ? 'vector' : 'none',
                                    engine: 'jina-clip-v2',
                                }, { headers: corsHeaders });
                            }
                        }
                        // 인코더 다운 / 빈 결과 → SigLIP fallback
                    } catch (err) {
                        // Jina path 예외 → SigLIP fallback
                    }
                }

                // ── SigLIP fallback path ──
                if (!env.HF_TOKEN && !env.SIGLIP_ENDPOINT_URL) {
                    return Response.json({
                        error: 'AI search is temporarily unavailable.',
                        code: 'siglip_unavailable',
                        detail: 'Both Jina and SigLIP unavailable. Neither HF_TOKEN nor SIGLIP_ENDPOINT_URL configured.',
                    }, { status: 503, headers: corsHeaders });
                }

                // ── 비영어 → 영어 자동 번역 (SigLIP 영어 전용 모델 보완) ──
                // 인코딩에 쓸 쿼리(queryForEncoding)와 응답에 표시할 메타데이터(translatedFrom/effectiveQuery)를 분리.
                // 캐시 키도 번역된 영어 쿼리 기준이라야 한국어/일본어/중국어가 같은 의미면 같은 벡터를 재사용한다.
                let queryForEncoding = trimmed;
                let translatedFrom: string | null = null;
                if (detectSourceLang(trimmed)) {
                    let translated = await getCachedTranslation(env, trimmed);
                    if (!translated) {
                        translated = await translateToEnglish(trimmed, env);
                        if (translated) {
                            ctx.waitUntil(putCachedTranslation(env, trimmed, translated));
                        }
                    }
                    if (translated) {
                        queryForEncoding = translated;
                        translatedFrom = trimmed;
                    }
                    // 번역 실패 시 원문 그대로 진행 — SigLIP이 영어 단어가 섞여 있다면 부분적 신호라도 잡을 수 있음
                }

                // Encode a caption ("a painting of …"), not the bare query.
                // Cache is keyed on the caption so it never collides with the
                // raw-text vectors stored by the /encode endpoint.
                const captionForEncoding = toSiglipCaption(queryForEncoding);

                let vector = await getCachedVector(env, captionForEncoding);
                let cacheHit = !!vector;

                if (!vector) {
                    vector = await encodeTextWithSigLIP(captionForEncoding, env);
                    if (!vector) {
                        return Response.json({
                            error: 'AI search is temporarily unavailable.',
                            code: 'siglip_unavailable',
                            detail: vectorError,
                        }, { status: 503, headers: corsHeaders });
                    }
                    // fire-and-forget cache write — don't block response
                    ctx.waitUntil(putCachedVector(env, captionForEncoding, vector));
                }

                const results = await queryWithMetadata(env, vector, Math.min(limit, 100));
                return Response.json({
                    results,
                    cached: cacheHit,
                    ...(translatedFrom ? { translatedFrom, effectiveQuery: queryForEncoding } : {}),
                }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /search-by-text-jina  (한국어 native, Jina CLIP v2 1024D)
            // 마이그레이션 검증용 신규 엔드포인트. 검증 후 /search-by-text 도 이쪽으로 라우팅 전환.
            // ──────────────────────────────────────────────
            if (url.pathname === '/search-by-text-jina' && request.method === 'POST') {
                if (!env.VECTORIZE_JINA) {
                    return Response.json({ error: 'VECTORIZE_JINA not configured' }, { status: 503, headers: corsHeaders });
                }
                const body = await request.json() as { text: string; limit?: number };
                const { text, limit = 50 } = body;
                if (!text || typeof text !== 'string' || text.trim().length < 2) {
                    return Response.json({ error: 'text must be at least 2 characters' }, { status: 400, headers: corsHeaders });
                }
                const trimmed = text.trim();
                const encoderUrl = env.JINA_TEXT_ENCODER_URL
                    || 'https://kimchanyeong89--jina-text-encoder-textencoder-encode.modal.run';

                // 1) Modal text encoder 호출 → 1024D vector
                let vector: number[];
                try {
                    const enc = await fetch(encoderUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: trimmed }),
                    });
                    if (!enc.ok) {
                        return Response.json({ error: `text encoder ${enc.status}` }, { status: 502, headers: corsHeaders });
                    }
                    const data = await enc.json() as { vectors?: number[][]; error?: string };
                    if (data.error || !data.vectors?.[0]) {
                        return Response.json({ error: data.error || 'encoder returned no vector' }, { status: 502, headers: corsHeaders });
                    }
                    vector = data.vectors[0];
                } catch (e: any) {
                    return Response.json({ error: `text encoder fetch failed: ${e.message}` }, { status: 502, headers: corsHeaders });
                }

                // 2) Vectorize Jina 인덱스 쿼리
                const safeTopK = Math.min(limit, 100);
                const queryRes = await env.VECTORIZE_JINA.query(vector, { topK: safeTopK, returnMetadata: 'none' });
                if (!queryRes.matches.length) {
                    return Response.json({ results: [] }, { headers: corsHeaders });
                }

                // 3) 메타데이터 조회 — Jina 인덱스는 {e, o} 만 저장.
                //    n(작품명), a(작가) 등 풀 메타는 SigLIP 인덱스(armin-art-search-768)에 있어 거기서 보강.
                const ids = queryRes.matches.map(m => m.id);
                const scoreMap = new Map<string, number>(queryRes.matches.map(m => [m.id, m.score]));
                const BATCH = 20;

                // 3a) Jina 인덱스에서 e, o 조회
                const jinaMeta: VectorRecord[] = [];
                for (let i = 0; i < ids.length; i += BATCH) {
                    const batch = await env.VECTORIZE_JINA.getByIds(ids.slice(i, i + BATCH));
                    jinaMeta.push(...batch);
                }
                const jinaMetaMap = new Map<string, Record<string, any>>(
                    jinaMeta.map(r => [r.id, r.metadata || {}])
                );

                // 3b) SigLIP 인덱스에서 n, a, m 등 풀 메타 조회 (같은 ID로 저장되어 있음)
                const sigMeta: VectorRecord[] = [];
                for (let i = 0; i < ids.length; i += BATCH) {
                    try {
                        const batch = await env.VECTORIZE.getByIds(ids.slice(i, i + BATCH));
                        sigMeta.push(...batch);
                    } catch { /* SigLIP에 없는 ID는 무시 — Jina에만 있는 신규 항목 */ }
                }
                const sigMetaMap = new Map<string, Record<string, any>>(
                    sigMeta.map(r => [r.id, r.metadata || {}])
                );

                // 4) Jina + SigLIP 메타 머지, 원본 ID 복원
                const results = ids
                    .map(id => {
                        const jm = jinaMetaMap.get(id) || {};
                        const sm = sigMetaMap.get(id) || {};
                        const original = typeof jm.o === 'string' ? jm.o : null;
                        const { o: _o, ...sigRest } = sm as any;
                        return {
                            id: original || id,
                            score: scoreMap.get(id),
                            ...sigRest,                       // n, a, m, c 등 SigLIP 메타가 우선
                            ...(jm.e ? { e: jm.e } : {}),     // exhibition id는 Jina 쪽 사용
                        };
                    })
                    .filter(r => r.score !== undefined);

                return Response.json({ results, engine: 'jina-clip-v2' }, { headers: corsHeaders });
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
            // GET /image-proxy?url=...
            // Cloudflare POP에서 박물관 서버로 fetch — 가정용 IP 차단 우회용.
            // 마이그레이션 임시 도구이므로 응답에 CORS 모두 허용.
            // ──────────────────────────────────────────────
            if (url.pathname === '/image-proxy' && request.method === 'GET') {
                const target = url.searchParams.get('url');
                if (!target || !/^https?:\/\//.test(target)) {
                    return new Response('invalid url', { status: 400, headers: corsHeaders });
                }
                try {
                    const upstream = await fetch(target, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        cf: { cacheTtl: 3600, cacheEverything: true },
                    });
                    if (!upstream.ok) {
                        return new Response(`upstream ${upstream.status}`, {
                            status: upstream.status,
                            headers: corsHeaders,
                        });
                    }
                    return new Response(upstream.body, {
                        headers: {
                            ...corsHeaders,
                            'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
                            'Cache-Control': 'public, max-age=3600',
                        },
                    });
                } catch (err: any) {
                    return new Response(`proxy error: ${err.message}`, { status: 502, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // GET /jina-stats  (마이그레이션 모니터링 — 외부에서 폴링)
            // ──────────────────────────────────────────────
            if (url.pathname === '/jina-stats' && request.method === 'GET') {
                if (!env.VECTORIZE_JINA) {
                    return Response.json({ error: 'VECTORIZE_JINA not configured' }, { status: 503, headers: corsHeaders });
                }
                try {
                    const desc = await env.VECTORIZE_JINA.describe() as any;
                    const count = desc.vectorCount ?? desc.vectorsCount ?? 0;
                    return Response.json({
                        index: 'armin-art-search-jina-1024',
                        vectorCount: count,
                        dimensions: desc.dimensions,
                        target: 609251,
                        progressPct: Number((count / 609251 * 100).toFixed(2)),
                        processedUpToDatetime: desc.processedUpToDatetime,
                        ts: new Date().toISOString(),
                    }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // POST /upsert-jina  (Jina CLIP v2 1024D, 마이그레이션 진행 중)
            // ──────────────────────────────────────────────
            if (url.pathname === '/upsert-jina' && request.method === 'POST') {
                if (!env.VECTORIZE_JINA) {
                    return Response.json(
                        { error: 'VECTORIZE_JINA binding not configured' },
                        { status: 503, headers: corsHeaders }
                    );
                }
                const { vectors } = await request.json() as {
                    vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string> }>
                };
                if (!vectors?.length) {
                    return Response.json({ error: 'No vectors provided' }, { status: 400, headers: corsHeaders });
                }
                const JINA_DIM = 1024;
                const valid = vectors.filter(v => v.id && Array.isArray(v.values) && v.values.length === JINA_DIM);
                if (valid.length === 0) {
                    return Response.json({ error: `No valid ${JINA_DIM}-dim vectors found` }, { status: 400, headers: corsHeaders });
                }
                // Vectorize는 ID 64바이트 한도. 더 긴 ID는 SHA-1 short alias로 매핑하고
                // 원본은 metadata.o에 저장 — 조회 시 denormalizeRecord로 역변환.
                // 일부 컬렉션은 ID가 number 타입으로 오므로 명시적 String() 캐스팅.
                const records: VectorRecord[] = await Promise.all(
                    valid.map(async (v) => {
                        const origStr = String(v.id);
                        const effectiveId = await effectiveVectorId(origStr);
                        const md: Record<string, string> = { ...(v.metadata || {}) };
                        if (effectiveId !== origStr) md.o = origStr;
                        return { id: effectiveId, values: v.values, metadata: md };
                    })
                );
                try {
                    await env.VECTORIZE_JINA.upsert(records);
                    return Response.json({ success: true, count: records.length, index: 'jina-1024' }, { headers: corsHeaders });
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
                    // Translate long original IDs to their internal short alias.
                    // For ≤64-byte IDs this is a no-op (returns input unchanged).
                    const lookupId = await effectiveVectorId(id);
                    const vectors = await env.VECTORIZE.getByIds([lookupId]);
                    if (!vectors?.length) return Response.json({ results: [] }, { headers: corsHeaders });

                    const searchResults = await env.VECTORIZE.query(vectors[0].values, {
                        topK: Math.min(limit + 20, 50),
                        returnMetadata: true
                    });

                    // Filter out the source artwork itself by matching either the
                    // internal short id OR the carried-back original id.
                    const candidates = searchResults.matches.filter((m) => {
                        if (m.id === lookupId) return false;
                        const original = m.metadata?.o;
                        if (typeof original === 'string' && original === id) return false;
                        return true;
                    });
                    const matches = diversify(candidates, limit);
                    return Response.json({
                        results: matches.map((m) => {
                            const md = m.metadata || {};
                            const original = typeof md.o === 'string' ? md.o : '';
                            const { o, ...rest } = md as any;
                            return { id: original || m.id, score: m.score, ...rest };
                        })
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

                // Vectorize에서 하트 작품 벡터 fetch (배치로)
                // 많은 하트 중 앞쪽이 임베딩 없을 수 있어 셔플 후 시도
                const shuffledIds = [...likedIds].sort(() => Math.random() - 0.5);
                const BATCH = 30; // Vectorize getByIds 배치 크기
                const allVecs: number[][] = [];
                for (let i = 0; i < Math.min(shuffledIds.length, TASTE_ID_SCAN_CAP); i += BATCH) {
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
                    if (allVecs.length >= TASTE_SAMPLE_CAP) break; // 표본 상한 도달 시 조기 종료
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
                    for (let i = 0; i < Math.min(shuffled.length, TASTE_ID_SCAN_CAP); i += 30) {
                        try {
                            const batch = await env.VECTORIZE.getByIds(shuffled.slice(i, i + 30));
                            for (const rec of batch) {
                                if (rec.values?.length === VECTOR_DIM) vecs.push(rec.values);
                            }
                        } catch { /* skip */ }
                        if (vecs.length >= TASTE_SAMPLE_CAP) break; // 표본 상한 도달 시 조기 종료
                    }
                    if (vecs.length > 0) {
                        const k = chooseK(vecs.length);
                        profile = { centroids: kMeans(vecs, k), k, updatedAt: Date.now(), likedCount: vecs.length };
                    }
                }

                if (!profile || !profile.centroids?.length) {
                    return Response.json({ results: [], reason: 'no_profile' }, { headers: corsHeaders });
                }

                // 각 centroid(취향 군집)에서 Vectorize 검색.
                // ⚠️ 결과를 한 풀에 합쳐 점수순 정렬하면 안 된다 — cosine 점수는
                // centroid마다 스케일이 다르다(밀집 군집=고점수, 느슨한 군집=저점수).
                // 그대로 정렬하면 가장 밀집된 한 군집이 상위를 독식한다.
                // → 군집별 리스트를 따로 보관해 라운드로빈으로 인터리브한다.
                const likedSet = new Set(likedIds ?? []);
                const perK     = Math.ceil((limit * 3) / profile.centroids.length);
                const perCentroid: VectorMatch[][] = [];

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
                        const list = res.matches
                            .filter(m => !likedSet.has(m.id)) // 이미 하트한 것 제외
                            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
                        perCentroid.push(list);
                    } catch {
                        perCentroid.push([]); // centroid 검색 실패 → 빈 슬롯
                    }
                }

                // 라운드로빈 인터리브 — 모든 군집의 rank 0을 먼저, 그다음 rank 1 …
                // 같은 작품이 여러 군집에 걸치면 가장 먼저(최고 순위) 만난 곳에서 채택.
                const seen = new Set<string>();
                const interleaved: VectorMatch[] = [];
                const maxRank = perCentroid.reduce((mx, l) => Math.max(mx, l.length), 0);
                for (let rank = 0; rank < maxRank; rank++) {
                    for (const list of perCentroid) {
                        const m = list[rank];
                        if (!m || seen.has(m.id)) continue;
                        seen.add(m.id);
                        interleaved.push(m);
                    }
                }

                // 다양성 보정(작가/시대/미술관 편중 제거). 인터리브 순서를 지켜야
                // 하므로 점수 재정렬은 건너뛴다(preSorted=true).
                const diversified = diversify(interleaved, limit, true);

                return Response.json({
                    results: diversified.map(m => ({ id: m.id, score: m.score, ...m.metadata })),
                    k: profile.k,
                    likedCount: profile.likedCount,
                }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /search-text   (KEYWORD search via D1 FTS5)
            // ──────────────────────────────────────────────
            // Returns artworks whose name / artist / museum matches the query
            // tokens.  Server-side replacement for the 170MB client-side text
            // index — first results in <200ms, no chunk download required.
            if (url.pathname === '/search-text' && request.method === 'POST') {
                if (!env.DB) {
                    return Response.json(
                        { error: 'D1 not configured. Run scripts/build-d1-index.mjs and add the d1_databases binding to wrangler.toml.' },
                        { status: 503, headers: corsHeaders }
                    );
                }
                let body: { query?: string; limit?: number; museum?: string; artist?: string };
                try { body = await request.json() as any; }
                catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders }); }

                const rawQuery = String(body?.query || '').trim();
                const limit = Math.max(1, Math.min(100, Number(body?.limit) || 50));

                if (!rawQuery || rawQuery.length < 2) {
                    return Response.json({ results: [], query: rawQuery }, { headers: corsHeaders });
                }

                // 비영어 쿼리 → 영어 번역. 코퍼스는 대부분 영어 제목이라
                // "고양이"는 "cat"으로 번역해야 영어 제목 작품이 잡힌다.
                // 단 원문 토큰도 함께 유지 — 한국어 제목 작품은 원문으로 직접 매칭.
                let translatedQuery: string | null = null;
                if (detectSourceLang(rawQuery)) {
                    translatedQuery = await getCachedTranslation(env, rawQuery);
                    if (!translatedQuery) {
                        translatedQuery = await translateToEnglish(rawQuery, env);
                        if (translatedQuery) ctx.waitUntil(putCachedTranslation(env, rawQuery, translatedQuery));
                    }
                }

                // FTS5 쿼리: 그룹 내부는 implicit AND(모든 토큰 매칭),
                // 원문 그룹과 번역 그룹 사이는 OR — 어느 쪽이든 맞으면 매칭.
                const ftsGroups: string[] = [];
                const origTokens = ftsTokenize(rawQuery);
                if (origTokens.length) {
                    ftsGroups.push('(' + origTokens.map((t) => `"${t}"*`).join(' ') + ')');
                }
                if (translatedQuery) {
                    const trTokens = ftsTokenize(translatedQuery);
                    if (trTokens.length) {
                        ftsGroups.push('(' + trTokens.map((t) => `"${t}"*`).join(' ') + ')');
                    }
                }

                if (ftsGroups.length === 0) {
                    return Response.json({ results: [], query: rawQuery }, { headers: corsHeaders });
                }

                const ftsQuery = ftsGroups.join(' OR ');

                try {
                    const stmt = env.DB.prepare(
                        `SELECT a.id AS id, a.name AS n, a.artist AS a, a.museum AS m,
                                a.exhibition_id AS e, a.image AS i, a.date AS d, a.source_url AS u,
                                a.category AS c, fts.rank AS rank
                         FROM artworks_fts fts
                         JOIN artworks a ON a.rowid = fts.rowid
                         WHERE artworks_fts MATCH ?
                         ORDER BY fts.rank
                         LIMIT ?`
                    ).bind(ftsQuery, limit);
                    const result = await stmt.all();
                    return Response.json(
                        {
                            results: result.results || [],
                            query: rawQuery,
                            count: (result.results || []).length,
                            ...(translatedQuery ? { translatedFrom: rawQuery, effectiveQuery: translatedQuery } : {}),
                        },
                        { headers: corsHeaders }
                    );
                } catch (err: any) {
                    return Response.json(
                        { error: err?.message || String(err), query: rawQuery, ftsQuery },
                        { status: 500, headers: corsHeaders }
                    );
                }
            }

            // ──────────────────────────────────────────────
            // POST /refresh-metadata
            // ──────────────────────────────────────────────
            // Re-attaches metadata (n,a,m,i,e,d,c,u) to existing Vectorize
            // records WITHOUT changing the embedding vector.  Many records
            // were upserted historically with empty metadata; their embedding
            // exists but the search/recommend response carries blank
            // image/title/artist fields and the UI shows blank cards.
            //
            // Body: { records: [{id, metadata: {n,a,m,i,e,d,c,u}}, ...] }
            // For each id we getByIds → preserve `values` → upsert with new metadata.
            // Returns: { updated, missing, failed }
            if (url.pathname === '/refresh-metadata' && request.method === 'POST') {
                let body: { records?: Array<{ id: string; metadata?: Record<string, string> }> };
                try { body = await request.json() as any; }
                catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders }); }

                const records = Array.isArray(body?.records) ? body.records : [];
                if (records.length === 0) {
                    return Response.json({ error: 'records array required' }, { status: 400, headers: corsHeaders });
                }
                if (records.length > 20) {
                    return Response.json({ error: 'max 20 records per call (Vectorize getByIds caps at 20)' }, { status: 400, headers: corsHeaders });
                }

                // Translate every input ID through effectiveVectorId so callers
                // can keep passing the long original IDs.  Long IDs map to the
                // internal vbz_ alias; short IDs pass through unchanged.
                // We also stamp `o: <originalId>` into the metadata so the
                // alias is reversible on the way back out.
                const lookupIds: string[] = [];
                const originalById = new Map<string, string>(); // lookupId → originalId
                const metadataByLookup = new Map<string, Record<string, string>>();
                for (const r of records) {
                    if (!r.id) continue;
                    const lookupId = await effectiveVectorId(r.id);
                    lookupIds.push(lookupId);
                    originalById.set(lookupId, r.id);
                    if (r.metadata) {
                        // Preserve the original ID for response-side denormalization.
                        const md = lookupId !== r.id ? { ...r.metadata, o: r.id } : { ...r.metadata };
                        metadataByLookup.set(lookupId, md);
                    }
                }

                let existing: VectorRecord[] = [];
                try { existing = await env.VECTORIZE.getByIds(lookupIds); }
                catch (err: any) {
                    return Response.json({ error: 'getByIds failed: ' + err.message }, { status: 500, headers: corsHeaders });
                }

                const found = new Set(existing.map((e) => e.id));
                const missing = lookupIds
                    .filter((id) => !found.has(id))
                    .map((id) => originalById.get(id) || id);

                const upserts: VectorRecord[] = existing.map((e) => {
                    const md = metadataByLookup.get(e.id) || e.metadata || {};
                    return { id: e.id, values: e.values, metadata: md };
                });

                if (upserts.length === 0) {
                    return Response.json({ updated: 0, missing: missing.length, missingIds: missing }, { headers: corsHeaders });
                }

                try {
                    const result = await env.VECTORIZE.upsert(upserts);
                    return Response.json({
                        updated: upserts.length,
                        missing: missing.length,
                        missingIds: missing,
                        mutationResult: result,
                    }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ error: 'upsert failed: ' + err.message, attempted: upserts.length }, { status: 500, headers: corsHeaders });
                }
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
                    // Translate originals → vbz_ aliases for any oversized IDs.
                    const translated: string[] = [];
                    for (const id of ids) translated.push(await effectiveVectorId(id));
                    const result = await env.VECTORIZE.deleteByIds(translated);
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
                    // Translate originals → aliases.  For each lookup id, remember
                    // which original it came from so we can return the original.
                    const lookupIds: string[] = [];
                    const lookupToOriginal = new Map<string, string>();
                    for (const id of ids) {
                        const lookup = await effectiveVectorId(id);
                        lookupIds.push(lookup);
                        lookupToOriginal.set(lookup, id);
                    }
                    const found = await env.VECTORIZE.getByIds(lookupIds);
                    const foundIds = found.map((f) => lookupToOriginal.get(f.id) || f.id);
                    return Response.json({ count: found.length, foundIds }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // POST /encode-and-upsert     (image embedding + upsert)
            // ──────────────────────────────────────────────
            // Embeds an image via the self-hosted SigLIP endpoint and upserts
            // the resulting vector under either the provided ID (if ≤64 bytes)
            // or a deterministic vbz_ alias (if longer). Always stamps
            // metadata.o = originalId so the response side can swap it back.
            //
            // Body: { records: [{id, imageUrl, metadata: {n,a,m,e,d,c,u}}, ...] }
            //   - id: original artwork ID (any length, can be Korean / long slug)
            //   - imageUrl: R2 (or any) URL the SigLIP encoder can reach
            //   - metadata: same shape as /upsert; `i` and `o` are auto-populated
            // Returns { upserted, failed, results: [{id, lookupId, ok, error?}, ...] }
            if (url.pathname === '/encode-and-upsert' && request.method === 'POST') {
                let body: { records?: Array<{ id: string; imageUrl: string; metadata?: Record<string, string> }> };
                try { body = await request.json() as any; }
                catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders }); }

                const records = Array.isArray(body?.records) ? body.records : [];
                if (records.length === 0) {
                    return Response.json({ error: 'records array required' }, { status: 400, headers: corsHeaders });
                }
                if (records.length > 10) {
                    return Response.json({ error: 'max 10 per call (image encoding is heavy)' }, { status: 400, headers: corsHeaders });
                }
                if (!env.SIGLIP_ENDPOINT_URL && !env.HF_TOKEN) {
                    return Response.json({ error: 'No SIGLIP_ENDPOINT_URL or HF_TOKEN configured for image encoding.' }, { status: 503, headers: corsHeaders });
                }

                const results: Array<any> = [];
                const upserts: VectorRecord[] = [];

                for (const r of records) {
                    if (!r?.id || !r?.imageUrl) {
                        results.push({ id: r?.id || '', ok: false, error: 'id and imageUrl required' });
                        continue;
                    }

                    const lookupId = await effectiveVectorId(r.id);
                    const isAliased = lookupId !== r.id;

                    // Try the self-hosted endpoint with imageUrl. Most SigLIP
                    // FastAPI servers accept either {image_url} or {imageUrl}
                    // or {url}; try them all and fall through on 4xx.
                    const vec = await encodeImageWithSigLIP(r.imageUrl, env);
                    if (!vec) {
                        results.push({ id: r.id, lookupId, ok: false, error: vectorError || 'image encode failed' });
                        continue;
                    }

                    const baseMeta = { ...(r.metadata || {}), i: r.imageUrl };
                    const meta = isAliased ? { ...baseMeta, o: r.id } : baseMeta;
                    upserts.push({ id: lookupId, values: vec, metadata: meta });
                    results.push({ id: r.id, lookupId, ok: true });
                }

                if (upserts.length === 0) {
                    return Response.json({ upserted: 0, failed: results.length, results }, { headers: corsHeaders });
                }

                try {
                    const mut = await env.VECTORIZE.upsert(upserts);
                    const failed = results.filter((r) => !r.ok).length;
                    return Response.json({ upserted: upserts.length, failed, mutationResult: mut, results }, { headers: corsHeaders });
                } catch (err: any) {
                    return Response.json({ error: 'upsert failed: ' + err.message, attempted: upserts.length, results }, { status: 500, headers: corsHeaders });
                }
            }

            // ──────────────────────────────────────────────
            // POST /encode
            // 텍스트 → 768D SigLIP 벡터를 그대로 반환.
            // 외부 Node 스크립트(scripts/weekly/embedding/text-encoder.ts)가
            // HF Space URL(시크릿)을 모른 채 인코더를 사용할 수 있도록 노출.
            // 내부 `/search-by-text` 등이 쓰는 `encodeTextWithSigLIP`을 재사용.
            // ──────────────────────────────────────────────
            if (url.pathname === '/encode' && request.method === 'POST') {
                let body: { text?: string };
                try {
                    body = await request.json() as { text?: string };
                } catch {
                    return Response.json({ error: 'invalid_json' }, { status: 400, headers: corsHeaders });
                }
                const text = (body?.text ?? '').trim();
                if (text.length < 2) {
                    return Response.json(
                        { error: 'text must be at least 2 characters' },
                        { status: 400, headers: corsHeaders }
                    );
                }
                if (!env.HF_TOKEN && !env.SIGLIP_ENDPOINT_URL) {
                    return Response.json({
                        error: 'AI search is temporarily unavailable.',
                        code: 'siglip_unavailable',
                        detail: 'Neither HF_TOKEN nor SIGLIP_ENDPOINT_URL is configured.',
                    }, { status: 503, headers: corsHeaders });
                }

                let vector = await getCachedVector(env, text);
                const cacheHit = !!vector;
                if (!vector) {
                    vector = await encodeTextWithSigLIP(text, env);
                    if (!vector) {
                        return Response.json({
                            error: 'AI search is temporarily unavailable.',
                            code: 'siglip_unavailable',
                            detail: vectorError,
                        }, { status: 503, headers: corsHeaders });
                    }
                    ctx.waitUntil(putCachedVector(env, text, vector));
                }

                return Response.json(
                    { vector, dim: vector.length, cached: cacheHit },
                    { headers: corsHeaders }
                );
            }

            // ──────────────────────────────────────────────
            // GET /status
            // ──────────────────────────────────────────────
            if (url.pathname === '/status') {
                return Response.json({
                    status: 'ok',
                    model: MODEL_ID,
                    dimensions: VECTOR_DIM,
                    encoder: env.SIGLIP_ENDPOINT_URL
                        ? 'self-hosted (SIGLIP_ENDPOINT_URL)'
                        : 'HuggingFace Inference Providers (deprecated for SigLIP)',
                    selfHostConfigured: !!env.SIGLIP_ENDPOINT_URL,
                    queryCache: env.TASTE_KV ? `KV (TTL ${QUERY_CACHE_TTL}s)` : 'disabled',
                    vectorize: 'armin-art-search-768',
                    features: ['search-text', 'search-by-text', 'search-by-vector', 'encode', 'taste-profile', 'recommend'],
                    d1Enabled: !!env.DB,
                }, { headers: corsHeaders });
            }

            return Response.json(
                { error: 'Not found. Endpoints: /search-text, /search-by-text, /search-by-vector, /encode, /upsert, /encode-and-upsert, /refresh-metadata, /recommend-by-id, /taste-profile, /recommend, /check-ids, /delete-ids, /status' },
                { status: 404, headers: corsHeaders }
            );

        } catch (err: any) {
            console.error('Worker error:', err);
            return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
    }
};
