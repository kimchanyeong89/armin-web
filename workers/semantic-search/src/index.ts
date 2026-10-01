import { buildFtsQuery, SEARCH_TEXT_SQL, SEARCH_TEXT_MAX_LIMIT } from './searchText';
import {
    exhibitionPercents,
    kMeans,
    museumMatches,
    normalize,
    openExhibitions,
    openMuseums,
    packInt8,
    unpackInt8,
    type ExhibitionBundle,
    type MuseumBundle,
    type OpenExhibitions,
    type OpenMuseums,
    type PackedVectors,
} from './taste';
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
 *  - POST /taste-scores     : 좋아요 목록 → 지금 전시별 취향 일치 %, 취향 작품이 몰린 상설 미술관
 *  - POST /recommend        : 취향 기반 개인화 추천
 *  - POST /check-ids        : ID 존재 여부 확인
 *  - POST /delete-ids       : Vectorize에서 벡터 삭제
 *  - POST /vectors-by-ids   : (관리용) 작품 벡터 조회 — 취향 데이터 빌드용
 *  - PUT  /taste-data       : (관리용) 전시·미술관 취향 데이터 교체
 *  - POST /warm-jina        : 정밀 검색을 켤 때 Jina 인코더 미리 깨우기
 *  - GET  /budget-status    : (관리용) 오늘 요금 상한 카운터
 *  - GET  /status           : 서비스 상태 확인
 *
 * 요금 상한: AI 검색·추천·취향 라우트는 IP별 속도 제한과 하루 총량(DailyBudget)을 먼저 거친다.
 */

interface Env {
    VECTORIZE: VectorizeIndex;
    /** Jina CLIP v2 1024D 인덱스. 마이그레이션 중. */
    VECTORIZE_JINA?: VectorizeIndex;
    /** Cloud Run 의 Jina v2 텍스트 인코더 URL. 없으면 정밀 검색은 SigLIP 으로 넘어간다. */
    JINA_TEXT_ENCODER_URL?: string;
    /** Bearer token the Jina encoder requires (the same value as its JINA_ENCODER_TOKEN env). */
    JINA_ENCODER_TOKEN?: string;
    /** Worldwide daily counter for metered routes (class DailyBudget). */
    DAILY_BUDGET?: DurableObjectNamespace;
    /** Per-IP rate limit for metered routes; the limit itself is set in wrangler.toml. */
    RATE_LIMITER?: RateLimit;
    HF_TOKEN: string;
    TASTE_KV: KVNamespace;
    /** D1 database for keyword text search (FTS5 on artwork name/artist/museum).
     *  Created via:  npx wrangler d1 create armin-text-search
     *  Schema seeded from workers/semantic-search/schema.sql + d1-seed.sql */
    DB?: D1Database;
    /** D1 database for search counts (the trending board), apart from the text index.
     *  Schema: workers/semantic-search/schema-stats.sql */
    STATS?: D1Database;
    /** Optional: full URL to a self-hosted SigLIP encoder (e.g. HF Space FastAPI).
     *  Expected: POST {url}/encode  → { vector: number[768] } or { embeddings: [[768D]] }
     *  When set, this is tried FIRST. Falls back to HF Inference Providers afterwards.
     *  Configure via:  npx wrangler secret put SIGLIP_ENDPOINT_URL
     */
    SIGLIP_ENDPOINT_URL?: string;
    /** Optional: bearer token for the self-hosted encoder (if it requires auth). */
    SIGLIP_ENDPOINT_TOKEN?: string;
    /** Shared secret for maintenance routes (/vectors-by-ids), sent as `x-admin-token`.
     *  Configure via:  npx wrangler secret put ADMIN_TOKEN */
    ADMIN_TOKEN?: string;
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
    get(key: string, options?: { cacheTtl?: number }): Promise<string | null>;
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
    /** Share of the sampled likes behind each centroid (version 2+). */
    weights?: number[];
    k: number;
    updatedAt: number;
    likedCount: number;
    /** Fingerprint of the like list the profile was built from (version 2+), to tell when it is stale. */
    likedHash?: string;
    version?: number;
}

const VECTOR_DIM = 768;
const MODEL_ID   = 'google/siglip-base-patch16-224';
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
        // 접미사 없는 llama-3.1-8b-instruct 는 2026-05-30 에 폐기됐다(AiError 5028). 그 뒤로 번역이
        // 전부 실패해 한국어 검색이 번역 없이 돌았다 — 같은 모델의 fp8 판을 쓴다.
        const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
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
// 취향 군집 (좋아요 → K개 군집 중심). 군집 계산 자체는 taste.ts 의 kMeans.
// Center Space Trap 방지: 단일 평균 대신 K개 군집 중심 유지
// ============================================================

function l2Normalize(v: number[]): number[] {
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return norm > 0 ? v.map(x => x / norm) : v;
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

/** Vectorize getByIds returns at most 20 records per call; a longer id list fails the whole call. */
const VECTORIZE_GET_BATCH = 20;

function fnv1a(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

async function sha1Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The like list's fingerprint: the same likes in any order give the same hash. */
function likedHashOf(likedIds: string[]): Promise<string> {
    return sha1Hex(Array.from(new Set(likedIds.map(String))).sort().join('\n'));
}

/** Vectors for ids already in their Vectorize form, 20 per call and four calls at a time, stopping once `enough` are found. */
async function vectorsForLookupIds(env: Env, lookupIds: string[], enough = Infinity): Promise<{ found: Map<string, number[]>; failedCalls: number }> {
    const batches: string[][] = [];
    for (let i = 0; i < lookupIds.length; i += VECTORIZE_GET_BATCH) batches.push(lookupIds.slice(i, i + VECTORIZE_GET_BATCH));

    const found = new Map<string, number[]>();
    let failedCalls = 0;
    for (let i = 0; i < batches.length && found.size < enough; i += 4) {
        const results = await Promise.all(batches.slice(i, i + 4).map((batch) =>
            env.VECTORIZE.getByIds(batch).catch(() => {
                failedCalls++;
                return [] as VectorRecord[];
            })));
        for (const records of results) {
            for (const r of records) if (r.values?.length === VECTOR_DIM) found.set(r.id, r.values);
        }
    }
    return { found, failedCalls };
}

// ── 좋아요한 작품의 벡터를 사용자별로 보관 ──────────────────────────
// 하트를 하나 더 누를 때마다 지금까지의 좋아요 전부를 Vectorize 에서 다시 받아왔다. 좋아요 40개짜리
// 사용자가 한 번 더 누를 때마다 40개를 받는 셈이라, 번째 띄우기 비용의 가장 큰 조각이었다.
// 받은 벡터를 1바이트로 줄여 KV 에 두면(192점에 147KB) 새로 누른 하나만 받으면 된다.
const likedVectorKey = (userId: string) => `taste-vec:${userId}`;

async function loadKeptVectors(env: Env, userId: string): Promise<Map<string, Float32Array>> {
    const out = new Map<string, Float32Array>();
    try {
        const raw = await env.TASTE_KV.get(likedVectorKey(userId));
        if (!raw) return out;
        const kept = JSON.parse(raw) as { ids: string[]; vectors: PackedVectors };
        const flat = unpackInt8(kept.vectors);
        kept.ids.forEach((id, i) => out.set(id, flat.subarray(i * VECTOR_DIM, (i + 1) * VECTOR_DIM)));
    } catch {
        // 깨진 기록은 없는 것과 같이 다룬다 — 다시 받아오면 된다.
    }
    return out;
}

async function saveKeptVectors(env: Env, userId: string, vectors: Map<string, Float32Array>): Promise<void> {
    const ids = Array.from(vectors.keys()).slice(0, TASTE_ID_SCAN_CAP);
    if (!ids.length) return;
    try {
        await env.TASTE_KV.put(likedVectorKey(userId), JSON.stringify({
            ids,
            vectors: packInt8(ids.map((id) => vectors.get(id)!)),
        }));
    } catch (err) {
        console.warn('liked-vector cache put failed:', err);
    }
}

/**
 * SigLIP vectors for a like list, 20 ids per Vectorize call. Asking for 30 at a time
 * used to fail every call silently, so anyone with more than 20 likes had no profile.
 *
 * The ids are taken in a fixed pseudo-random order: a long history is sampled from end
 * to end rather than from its first page, and the same likes always give the same sample.
 *
 * Only the ids this user has no kept vector for are fetched; with a userId the merged set
 * is kept again, so the next heart costs one lookup instead of the whole list.
 */
async function likedVectors(env: Env, userId: string | null, likedIds: string[]): Promise<{ vectors: Float32Array[]; failedCalls: number }> {
    const ids = Array.from(new Set(likedIds.map(String).filter(Boolean)))
        .sort((a, b) => fnv1a(a) - fnv1a(b) || (a < b ? -1 : 1))
        .slice(0, TASTE_ID_SCAN_CAP);
    const lookups = await Promise.all(ids.map((id) => effectiveVectorId(id)));

    const kept = userId ? await loadKeptVectors(env, userId) : new Map<string, Float32Array>();
    const missing = lookups.filter((id) => !kept.has(id));
    const wanted = TASTE_SAMPLE_CAP - lookups.filter((id) => kept.has(id)).length;
    let failedCalls = 0;
    let fetched = 0;
    if (missing.length && wanted > 0) {
        const got = await vectorsForLookupIds(env, missing, wanted);
        failedCalls = got.failedCalls;
        fetched = got.found.size;
        for (const [id, values] of got.found) kept.set(id, normalize(Float32Array.from(values)));
    }

    const vectors: Float32Array[] = [];
    for (const id of lookups) {
        const v = kept.get(id);
        if (v && vectors.length < TASTE_SAMPLE_CAP) vectors.push(v);
    }
    if (userId && fetched) {
        // 지금 좋아요한 것을 앞에 둔다 — 상한을 넘으면 오래된 기록부터 밀려난다.
        const merged = new Map<string, Float32Array>();
        for (const id of lookups) { const v = kept.get(id); if (v) merged.set(id, v); }
        for (const [id, v] of kept) if (!merged.has(id)) merged.set(id, v);
        await saveKeptVectors(env, userId, merged);
    }
    return { vectors, failedCalls };
}

/** Taste clusters for a like list, or no profile when none of the likes has a vector. */
async function computeTasteProfile(env: Env, userId: string | null, likedIds: string[]): Promise<{ profile: TasteProfile | null; failedCalls: number }> {
    const { vectors, failedCalls } = await likedVectors(env, userId, likedIds);
    if (!vectors.length) return { profile: null, failedCalls };
    const { centroids, weights } = kMeans(vectors, chooseK(vectors.length));
    return {
        failedCalls,
        profile: {
            centroids: centroids.map((c) => Array.from(c, (x) => Math.round(x * 1e6) / 1e6)),
            weights: weights.map((w) => Math.round(w * 1e4) / 1e4),
            k: centroids.length,
            updatedAt: Date.now(),
            likedCount: vectors.length,
            likedHash: await likedHashOf(likedIds),
            version: 2,
        },
    };
}

/**
 * Kept without an expiry. The likes in Firestore are the source and this is their
 * summary; /taste-scores rebuilds it whenever the like list changes, so it never goes stale.
 */
async function saveTasteProfile(env: Env, userId: string, profile: TasteProfile): Promise<void> {
    await env.TASTE_KV.put(`taste:${userId}`, JSON.stringify(profile));
}

async function loadTasteProfile(env: Env, userId: string): Promise<TasteProfile | null> {
    const raw = await env.TASTE_KV.get(`taste:${userId}`);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as TasteProfile;
    } catch {
        return null;
    }
}

// ── 전시·상설 미술관 취향 데이터 ─────────────────────────────────────────
// scripts/taste/build-taste-data.mjs 가 PUT /taste-data 로 올린다. 올릴 때마다 새 키에 쓰고
// 매니페스트가 가리키는 키만 바꾼다. 매니페스트는 요청에서 몇 분 캐시되므로 직전 버전 하나를
// 남겨 두어, 옛 매니페스트를 읽은 요청도 데이터를 찾게 한다.
const TASTE_DATA_MANIFEST = 'taste-data:manifest';
type TasteDataKind = 'exhibitions' | 'museums';

interface TasteDataManifest {
    current: Partial<Record<TasteDataKind, string>>;
    previous: Partial<Record<TasteDataKind, string>>;
}

async function readTasteDataManifest(env: Env, cacheTtl?: number): Promise<TasteDataManifest> {
    const raw = await env.TASTE_KV.get(TASTE_DATA_MANIFEST, cacheTtl ? { cacheTtl } : undefined);
    const parsed = (raw ? JSON.parse(raw) : {}) as Partial<TasteDataManifest>;
    return { current: parsed.current ?? {}, previous: parsed.previous ?? {} };
}

/** Unpacks an uploaded bundle; throws when it does not hold together, so a broken upload is refused. */
function openTasteBundle(kind: TasteDataKind, bundle: unknown): OpenExhibitions | OpenMuseums {
    return kind === 'exhibitions' ? openExhibitions(bundle as ExhibitionBundle) : openMuseums(bundle as MuseumBundle);
}

/** Bundles already unpacked in this isolate, one per kind, reused until the manifest names another key. */
const openedTasteData = new Map<TasteDataKind, { key: string; data: OpenExhibitions | OpenMuseums }>();

function loadTasteData(env: Env, kind: 'exhibitions', key: string | undefined): Promise<OpenExhibitions | null>;
function loadTasteData(env: Env, kind: 'museums', key: string | undefined): Promise<OpenMuseums | null>;
async function loadTasteData(env: Env, kind: TasteDataKind, key: string | undefined): Promise<OpenExhibitions | OpenMuseums | null> {
    if (!key) return null;
    const opened = openedTasteData.get(kind);
    if (opened?.key === key) return opened.data;
    // A versioned key never changes, so the edge may keep it for long.
    const raw = await env.TASTE_KV.get(key, { cacheTtl: 3600 });
    if (!raw) return null;
    const data = openTasteBundle(kind, JSON.parse(raw));
    openedTasteData.set(kind, { key, data });
    return data;
}

/** Maintenance routes need the ADMIN_TOKEN secret in `x-admin-token`; without the secret they stay closed. */
/** A search as one line on the trending board: lower-case, letters and digits of any script, single spaces. */
function searchKey(term: string): string {
    return term.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isAdminRequest(request: Request, env: Env): boolean {
    const given = new TextEncoder().encode(request.headers.get('x-admin-token') ?? '');
    const expected = new TextEncoder().encode(env.ADMIN_TOKEN ?? '');
    return expected.byteLength > 0 && given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected);
}

// ── 요금 상한: IP별 속도 제한 + 전 세계 하루 총량 ─────────────────────────
// Cloudflare 예산 알림도 구글 예산도 청구를 멈추지 않는다(알림 메일뿐). 그래서 돈이 드는 공개 라우트는
// 워커가 직접 막는다. IP별 제한은 한 곳에서 몰아 쓰는 것을, 하루 총량은 여러 IP 로 나눠 두드려도
// 한 달 청구가 정해진 선을 넘지 않게 하는 것을 맡는다. 관리 토큰이 있는 요청(빌드 스크립트)은 세지 않는다.
const METERED_ROUTES = new Set([
    '/search-by-text', '/search-by-text-jina', '/search-by-vector', '/encode',
    '/recommend', '/recommend-by-id', '/taste-profile', '/taste-scores', '/warm-jina',
]);
/**
 * Metered requests allowed per day (Korea time) across the whole world, and a second, much
 * tighter allowance for the routes that wake the Jina encoder. One precise search runs a
 * 4 vCPU instance for seconds, so it costs about forty times a cached lookup; counting
 * requests alone would let a few hundred of them outspend a whole day of ordinary use.
 *
 * Sized for the first target of ~1,000 people a day (about 30 requests each) inside
 * roughly $30 a month, of which about $20 is fixed (Workers base + the vector index).
 */
const DAILY_REQUEST_BUDGET = 30000;
const DAILY_JINA_BUDGET = 300;
const JINA_ROUTES = new Set(['/search-by-text-jina', '/warm-jina']);

/** A 429 response when this address is asking too often, otherwise null. */
async function ipLimited(request: Request, env: Env): Promise<Response | null> {
    if (!env.RATE_LIMITER) return null;
    let limited = false;
    try {
        limited = !(await env.RATE_LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' })).success;
    } catch (err: any) {
        // 속도 제한 기능이 잠깐 안 되면 막지 않는다 (하루 총량 카운터와 같은 선택).
        console.warn(`[rate-limit] unavailable: ${err?.message}`);
    }
    if (!limited) return null;
    return Response.json(
        { error: 'rate_limited', message: '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } },
    );
}

/** A 429 response when this request is over a limit, otherwise null. */
async function meterRequest(request: Request, env: Env): Promise<Response | null> {
    if (isAdminRequest(request, env)) return null;
    const perIp = await ipLimited(request, env);
    if (perIp) return perIp;
    if (env.DAILY_BUDGET) {
        try {
            const counter = env.DAILY_BUDGET.get(env.DAILY_BUDGET.idFromName('global'));
            const buckets = [`all:${DAILY_REQUEST_BUDGET}`];
            if (JINA_ROUTES.has(new URL(request.url).pathname)) buckets.push(`jina:${DAILY_JINA_BUDGET}`);
            const res = await counter.fetch(`https://daily-budget/consume?${buckets.map((b) => `b=${b}`).join('&')}`);
            const { allowed, full, retryAfter } = await res.json() as { allowed: boolean; full?: string; retryAfter: number };
            if (!allowed) {
                return Response.json(
                    {
                        error: 'daily_limit',
                        message: full === 'jina'
                            ? '오늘 처리할 수 있는 정밀 검색이 모두 찼어요. 빠른 검색은 그대로 쓸 수 있어요.'
                            : '오늘 처리할 수 있는 AI 요청이 모두 찼어요. 한국 시간 자정 뒤에 다시 시도해 주세요.',
                    },
                    { status: 429, headers: { ...corsHeaders, 'Retry-After': String(retryAfter) } },
                );
            }
        } catch (err: any) {
            // 카운터가 잠깐 응답하지 않으면 막지 않고 통과시킨다. 상한보다 서비스가 멈추지 않는 쪽을 택한다.
            console.warn(`[daily-budget] counter unavailable: ${err?.message}`);
        }
    }
    return null;
}

/**
 * One counter for the whole world, reset at midnight Korea time. It keeps the classic
 * fetch interface rather than RPC, so the worker's 2024-01-01 compatibility date still works.
 */
export class DailyBudget {
    constructor(private readonly state: DurableObjectState) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        // Each `b` is "bucket:limit". A request counts against every bucket it names and is
        // refused when any one of them is full, so one counter can hold both the whole-day
        // allowance and the tighter one for the expensive routes.
        const asked = url.searchParams.getAll('b')
            .map((b) => b.split(':'))
            .map(([name, limit]) => ({ name, limit: Number(limit) }))
            .filter((b) => b.name && Number.isFinite(b.limit));
        const koreaNow = Date.now() + 9 * 3600_000;
        const day = new Date(koreaNow).toISOString().slice(0, 10);
        const retryAfter = Math.ceil((86_400_000 - (koreaNow % 86_400_000)) / 1000);
        const saved = await this.state.storage.get<{ day: string; used: Record<string, number> }>('budget');
        const used: Record<string, number> = saved?.day === day ? { ...saved.used } : {};
        if (url.pathname === '/status') {
            return Response.json({ day, used, limits: { all: DAILY_REQUEST_BUDGET, jina: DAILY_JINA_BUDGET }, retryAfter });
        }
        const full = asked.find((b) => (used[b.name] ?? 0) >= b.limit);
        if (full) return Response.json({ allowed: false, full: full.name, used, retryAfter });
        for (const b of asked) used[b.name] = (used[b.name] ?? 0) + 1;
        await this.state.storage.put('budget', { day, used });
        return Response.json({ allowed: true, used, retryAfter });
    }
}

/** Headers for the Jina text encoder on Cloud Run, which takes a bearer token like the SigLIP one. */
function jinaEncoderHeaders(env: Env): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (env.JINA_ENCODER_TOKEN) headers['Authorization'] = `Bearer ${env.JINA_ENCODER_TOKEN}`;
    return headers;
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
     * 매 4분마다 SigLIP 인코더를 warm 유지 → 기본 "빠름" 검색의 cold start 회피.
     * SigLIP(self-host, SIGLIP_ENDPOINT_URL)은 실제 /encode 한 번으로 모델까지 데운다.
     *
     * 예전엔 Jina만 warm 시켰다. 그래서 SigLIP(기본 "빠름" 엔진)은 idle 시
     * 컨테이너가 잠들고, 첫 검색이 30~60초 cold start → 클라이언트 12초 타임아웃을
     * 넘겨 "결과 없음"으로 보였다. 그 뒤로 두 인코더를 함께 데웠다.
     * 2026-09-15부터 Jina(정밀)는 데우지 않는다. 한 주 요청 약 2,500건이 거의 전부 워밍이었을 만큼
     * 드물게 쓰여서, 앱이 정밀 검색을 켜는 순간 /warm-jina 로 깨운다.
     */
    async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
        // A real /encode keeps the model hot (a bare health check may not touch
        // the model), which is what the search path actually needs warm.
        const base = env.SIGLIP_ENDPOINT_URL;
        if (!base) return;
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (env.SIGLIP_ENDPOINT_TOKEN) headers['Authorization'] = `Bearer ${env.SIGLIP_ENDPOINT_TOKEN}`;
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 25000);
            const r = await fetch(`${base.replace(/\/+$/, '')}/encode`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ text: 'warm' }),
                signal: ctl.signal,
            });
            clearTimeout(timer);
            console.log(`[warmup:siglip] HTTP ${r.status}`);
        } catch (err: any) {
            console.warn(`[warmup:siglip] failed: ${err.message}`);
        }
    },

    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {
            // 돈이 드는 공개 라우트는 속도 제한과 하루 총량을 먼저 통과해야 한다 (meterRequest).
            if (request.method === 'POST' && METERED_ROUTES.has(url.pathname)) {
                const refusal = await meterRequest(request, env);
                if (refusal) return refusal;
            }

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
                // 인코더는 Cloud Run(토큰 필요, 평소 꺼져 있음). 30초 안에 답이 없으면 SigLIP 로 fallback.
                if (engine !== 'siglip' && env.VECTORIZE_JINA && env.JINA_TEXT_ENCODER_URL) {
                    const encoderUrl = env.JINA_TEXT_ENCODER_URL;

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
                            const encoding = fetch(encoderUrl, {
                                method: 'POST',
                                headers: jinaEncoderHeaders(env),
                                body: JSON.stringify({ text: trimmed }),
                                signal: ctl.signal,
                            })
                                .then(async (enc) => (enc.ok ? ((await enc.json()) as { vectors?: number[][] }).vectors?.[0] ?? null : null))
                                .catch(() => null)
                                .finally(() => clearTimeout(timer));
                            // 인코더는 평소 꺼져 있어(비용) 깨는 데 20초쯤 걸린다. 8초 안에 답이 없으면 사용자를 세워 두지 않고
                            // 아래 SigLIP 결과를 먼저 준다. 인코딩은 뒤에서 끝까지 이어져 벡터가 캐시에 남고, 인코더도 깨어 있게 된다.
                            vec = await Promise.race([encoding, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
                            ctx.waitUntil(encoding.then((v) => (v ? putCachedVector(env, cacheKey, v) : undefined)));
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
                const encoderUrl = env.JINA_TEXT_ENCODER_URL;
                if (!encoderUrl) {
                    return Response.json({ error: 'JINA_TEXT_ENCODER_URL not configured' }, { status: 503, headers: corsHeaders });
                }

                // 1) Jina 텍스트 인코더(Cloud Run, 토큰) 호출 → 1024D vector
                let vector: number[];
                try {
                    const enc = await fetch(encoderUrl, {
                        method: 'POST',
                        headers: jinaEncoderHeaders(env),
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

                // 같은 작품의 닮은 작품은 누가 물어도 답이 같다. 작품 상세를 열 때마다 불리는 라우트라,
                // 캐시가 없으면 인기 작품 하나가 볼 때마다 벡터 검색을 다시 돌린다.
                const recCacheKey = `rec-by-id:${id}:${limit}`;
                const cachedRec = await getCachedSearchResults(env, recCacheKey);
                if (cachedRec) return Response.json({ results: cachedRec, cached: true }, { headers: corsHeaders });

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
                    const results = matches.map((m) => {
                        const md = m.metadata || {};
                        const original = typeof md.o === 'string' ? md.o : '';
                        const { o, ...rest } = md as any;
                        return { id: original || m.id, score: m.score, ...rest };
                    });
                    // 빈 답은 넣지 않는다 — 임베딩이 나중에 들어오면 바로 반영되어야 한다.
                    if (results.length) ctx.waitUntil(putCachedSearchResults(env, recCacheKey, results));
                    return Response.json({ results }, { headers: corsHeaders });
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

                // 좋아요를 누르면 검색바(/taste-profile)와 취향 점수(/taste-scores)가 함께 부른다.
                // 좋아요 목록이 그대로면 저장된 프로필을 다시 만들지 않는다.
                const stored = await loadTasteProfile(env, userId);
                if (stored?.weights && stored.likedHash === await likedHashOf(likedIds)) {
                    return Response.json({ success: true, k: stored.k, likedCount: stored.likedCount, failedCalls: 0, unchanged: true }, { headers: corsHeaders });
                }

                const { profile, failedCalls } = await computeTasteProfile(env, userId, likedIds);
                if (!profile) {
                    return Response.json({ error: 'No vectors found for likedIds', failedCalls }, { status: 404, headers: corsHeaders });
                }
                // 조회가 일부 실패해 만든 프로필은 저장하지 않는다 (/taste-scores 와 같은 규칙).
                if (failedCalls === 0) await saveTasteProfile(env, userId, profile);

                return Response.json({ success: true, k: profile.k, likedCount: profile.likedCount, failedCalls }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // POST /taste-scores
            // 좋아요 목록 → 지금 전시마다 취향 일치(1~99)와, 취향 작품이 몰린 상설 미술관(배수).
            // Body: { userId: string, likedIds: string[] }
            // 저장된 프로필이 이 좋아요 목록으로 만든 것이 아니면(likedHash) 다시 만들어 저장한다.
            // ──────────────────────────────────────────────
            if (url.pathname === '/taste-scores' && request.method === 'POST') {
                const { userId, likedIds } = await request.json() as { userId?: string; likedIds?: string[] };
                if (!userId || typeof userId !== 'string' || !Array.isArray(likedIds)) {
                    return Response.json({ error: 'userId and likedIds array required' }, { status: 400, headers: corsHeaders });
                }
                const noScores = { exhibitions: {}, museums: [], likedCount: 0 };
                if (likedIds.length === 0) return Response.json(noScores, { headers: corsHeaders });

                const likedHash = await likedHashOf(likedIds);
                let profile = await loadTasteProfile(env, userId);
                if (!profile?.weights || profile.likedHash !== likedHash) {
                    const built = await computeTasteProfile(env, userId, likedIds);
                    profile = built.profile;
                    // 조회가 일부 실패해 만든 프로필은 저장하지 않는다. 같은 해시로 굳으면 다시 만들 기회가 없다.
                    if (profile && built.failedCalls === 0) ctx.waitUntil(saveTasteProfile(env, userId, profile));
                }
                if (!profile?.centroids.length || !profile.weights) {
                    return Response.json({ ...noScores, reason: 'no_vectors' }, { headers: corsHeaders });
                }

                const manifest = await readTasteDataManifest(env, 300);
                const [exhibitionData, museumData] = await Promise.all([
                    loadTasteData(env, 'exhibitions', manifest.current.exhibitions),
                    loadTasteData(env, 'museums', manifest.current.museums),
                ]);
                const taste = { centroids: profile.centroids.map((c) => Float32Array.from(c)), weights: profile.weights };
                const exhibitions: Record<string, number> = {};
                if (exhibitionData) {
                    const percents = exhibitionPercents(taste, profile.likedCount, exhibitionData);
                    exhibitionData.items.forEach((item, i) => { exhibitions[item.id] = percents[i]; });
                }
                return Response.json({
                    exhibitions,
                    museums: museumData ? museumMatches(taste, profile.likedCount, museumData) : [],
                    likedCount: profile.likedCount,
                    dataVersions: { exhibitions: exhibitionData?.version ?? null, museums: museumData?.version ?? null },
                }, { headers: corsHeaders });
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

                let profile = await loadTasteProfile(env, userId);

                // 저장된 프로파일이 없으면 즉석으로만 계산한다. 이 호출은 좋아요의 일부(시드)만
                // 보내므로, 저장하면 사용자의 전체 취향을 일부로 덮어쓰게 된다.
                if (!profile && likedIds?.length >= 1) {
                    profile = (await computeTasteProfile(env, userId, likedIds)).profile;
                }

                if (!profile || !profile.centroids?.length) {
                    return Response.json({ results: [], reason: 'no_profile' }, { headers: corsHeaders });
                }

                // 각 centroid(취향 군집)에서 Vectorize 검색.
                // ⚠️ 결과를 한 풀에 합쳐 점수순 정렬하면 안 된다 — cosine 점수는
                // centroid마다 스케일이 다르다(밀집 군집=고점수, 느슨한 군집=저점수).
                // 그대로 정렬하면 가장 밀집된 한 군집이 상위를 독식한다.
                // → 군집별 리스트를 따로 보관해 라운드로빈으로 인터리브한다.
                // 비중이 큰 군집 8개만 검색한다. 군집마다 벡터 검색이 한 번씩이라, 좋아요가 많아
                // 군집이 24개까지 늘어난 사용자는 추천 한 번에 벡터 검색을 24번 하고 있었다.
                const maxClusters = 8;
                const weights = profile.weights ?? [];
                const clusters = profile.centroids
                    .map((_, ci) => ci)
                    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0))
                    .slice(0, maxClusters);
                const likedSet = new Set(likedIds ?? []);
                const perK     = Math.ceil((limit * 3) / clusters.length);
                const perCentroid: VectorMatch[][] = [];

                for (const ci of clusters) {
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
                            // 메타데이터를 함께 받으면 Vectorize 는 topK 50까지만 허용한다(넘으면 예외 → 이 군집이 빈 결과).
                            topK: Math.min(perK + Math.min(likedIds?.length ?? 0, 200), 50),
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
            // ──────────────────────────────────────────────
            // POST /search-hit   { term }
            // GET  /trending
            // ──────────────────────────────────────────────
            // The "trending now" board. A search counts once it has shown
            // results (the app decides that), and the board is the eight
            // most-searched terms of the past week, each with where it stood
            // the week before. Days are Korea time, as the daily budget's are.
            if (url.pathname === '/search-hit' && request.method === 'POST') {
                if (!env.STATS) return Response.json({ ok: false }, { status: 503, headers: corsHeaders });
                const perIp = await ipLimited(request, env);
                if (perIp) return perIp;
                let body: { term?: string };
                try { body = await request.json() as any; }
                catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders }); }
                const term = String(body?.term || '').replace(/\s+/g, ' ').trim().slice(0, 60);
                const key = searchKey(term);
                if (key.length < 2) return Response.json({ ok: false }, { headers: corsHeaders });
                const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
                ctx.waitUntil(
                    env.STATS.prepare(
                        'INSERT INTO search_hits (key, day, term, count) VALUES (?1, ?2, ?3, 1) ' +
                        'ON CONFLICT(key, day) DO UPDATE SET count = count + 1, term = ?3',
                    ).bind(key, day, term).run().catch((err: any) => console.warn(`[search-hit] ${err?.message}`)),
                );
                return Response.json({ ok: true }, { headers: corsHeaders });
            }

            if (url.pathname === '/trending' && request.method === 'GET') {
                if (!env.STATS) return Response.json({ terms: [] }, { headers: corsHeaders });
                const dayOf = (daysAgo: number) => new Date(Date.now() + 9 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
                const top = (from: string, to: string, limit: number) => env.STATS!.prepare(
                    'SELECT key, MAX(term) AS term, SUM(count) AS hits FROM search_hits ' +
                    'WHERE day BETWEEN ?1 AND ?2 GROUP BY key ORDER BY hits DESC, key LIMIT ?3',
                ).bind(from, to, limit).all() as Promise<{ results?: Array<{ key: string; term: string; hits: number }> }>;
                try {
                    const [week, before] = await Promise.all([top(dayOf(6), dayOf(0), 8), top(dayOf(13), dayOf(7), 30)]);
                    const previousRank = new Map((before.results || []).map((row, i) => [row.key, i + 1]));
                    const terms = (week.results || []).map((row, i) => ({
                        term: row.term,
                        hits: Number(row.hits) || 0,
                        rank: i + 1,
                        previousRank: previousRank.get(row.key) ?? null,
                    }));
                    return Response.json({ terms }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=60' } });
                } catch (err: any) {
                    return Response.json({ terms: [], error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
                }
            }

            /* An artwork's own museum page, for works saved before likes kept it.
               GET /source-url?id=…[&ex=exhibitionId]. A second museum's work with the
               same id is keyed "id␟exhibitionId" in D1, so those match too, the one
               from the given exhibition first. */
            if (url.pathname === '/source-url' && request.method === 'GET') {
                const id = String(url.searchParams.get('id') || '').trim();
                const ex = String(url.searchParams.get('ex') || '').trim();
                if (!env.DB || !id) return Response.json({ url: '' }, { headers: corsHeaders });
                try {
                    const row = await env.DB.prepare(
                        "SELECT source_url FROM artworks WHERE (id = ?1 OR substr(id, 1, length(?1) + 1) = ?1 || '\u241f') " +
                        "AND source_url != '' ORDER BY (exhibition_id = ?2) DESC LIMIT 1",
                    ).bind(id, ex).first() as { source_url?: string } | null;
                    return Response.json({ url: row?.source_url || '' }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=86400' } });
                } catch (err: any) {
                    return Response.json({ url: '', error: err?.message || String(err) }, { status: 500, headers: corsHeaders });
                }
            }

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
                const limit = Math.max(1, Math.min(SEARCH_TEXT_MAX_LIMIT, Number(body?.limit) || 50));

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
                const ftsQuery = buildFtsQuery(rawQuery, translatedQuery);
                if (!ftsQuery) {
                    return Response.json({ results: [], query: rawQuery }, { headers: corsHeaders });
                }

                try {
                    const stmt = env.DB.prepare(SEARCH_TEXT_SQL).bind(ftsQuery, limit);
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
            // POST /vectors-by-ids   (관리용: x-admin-token)
            // 취향 데이터 빌드 스크립트가 로컬에 없는 작품의 SigLIP 벡터를 받아 간다.
            // Body: { ids: string[] } (1~200개) → { vectors: { [id]: number[] }, failedCalls }
            // ──────────────────────────────────────────────
            if (url.pathname === '/vectors-by-ids' && request.method === 'POST') {
                if (!isAdminRequest(request, env)) {
                    return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });
                }
                const { ids } = await request.json() as { ids?: string[] };
                if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
                    return Response.json({ error: 'ids array of 1-200 required' }, { status: 400, headers: corsHeaders });
                }
                const originals = ids.map(String);
                const lookups = await Promise.all(originals.map((id) => effectiveVectorId(id)));
                const { found, failedCalls } = await vectorsForLookupIds(env, lookups);
                const vectors: Record<string, number[]> = {};
                lookups.forEach((lookup, i) => {
                    const values = found.get(lookup);
                    if (values) vectors[originals[i]] = values.map((x) => Math.round(x * 1e6) / 1e6);
                });
                return Response.json({ vectors, failedCalls }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // PUT /taste-data?kind=exhibitions|museums   (관리용: x-admin-token)
            // 빌드 스크립트가 만든 묶음을 버전 키에 쓰고 매니페스트를 바꾼다. 열어 보아 깨진 묶음은 거절한다.
            // ──────────────────────────────────────────────
            if (url.pathname === '/taste-data' && request.method === 'PUT') {
                if (!isAdminRequest(request, env)) {
                    return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });
                }
                const kind = url.searchParams.get('kind');
                if (kind !== 'exhibitions' && kind !== 'museums') {
                    return Response.json({ error: 'kind must be exhibitions or museums' }, { status: 400, headers: corsHeaders });
                }
                const raw = await request.text();
                let version: string;
                try {
                    const bundle = JSON.parse(raw) as { version?: unknown };
                    if (typeof bundle.version !== 'string' || !/^[\w.-]{1,64}$/.test(bundle.version)) throw new Error('version missing or malformed');
                    openTasteBundle(kind, bundle);
                    version = bundle.version;
                } catch (err: any) {
                    return Response.json({ error: `invalid bundle: ${err.message}` }, { status: 400, headers: corsHeaders });
                }

                const key = `taste-data:${kind}:${version}`;
                await env.TASTE_KV.put(key, raw);
                const manifest = await readTasteDataManifest(env);
                const retired = manifest.previous[kind];
                if (manifest.current[kind] !== key) {
                    manifest.previous[kind] = manifest.current[kind];
                    manifest.current[kind] = key;
                    await env.TASTE_KV.put(TASTE_DATA_MANIFEST, JSON.stringify(manifest));
                    if (retired && retired !== key && retired !== manifest.previous[kind]) ctx.waitUntil(env.TASTE_KV.delete(retired));
                }
                return Response.json({ success: true, key, bytes: raw.length }, { headers: corsHeaders });
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
            // POST /warm-jina
            // 앱이 정밀 검색을 켜는 순간 부른다. 평소 꺼져 있는 Jina 인코더를 미리 깨워 첫 검색의 대기를 줄인다.
            // 요금 상한(속도 제한·하루 총량)을 거친다.
            // ──────────────────────────────────────────────
            if (url.pathname === '/warm-jina' && request.method === 'POST') {
                const encoderUrl = env.JINA_TEXT_ENCODER_URL;
                if (encoderUrl) {
                    ctx.waitUntil(
                        fetch(`${encoderUrl.replace(/\/+$/, '')}/warmup`, { headers: jinaEncoderHeaders(env) })
                            .then((r) => console.log(`[warm-jina] HTTP ${r.status}`))
                            .catch((err) => console.warn(`[warm-jina] failed: ${err?.message}`)),
                    );
                }
                return Response.json({ warming: !!encoderUrl }, { headers: corsHeaders });
            }

            // ──────────────────────────────────────────────
            // GET /budget-status   (관리용: x-admin-token)
            // 오늘(한국 시간) 요금 상한 카운터가 얼마나 찼는지.
            // ──────────────────────────────────────────────
            if (url.pathname === '/budget-status' && request.method === 'GET') {
                if (!isAdminRequest(request, env)) {
                    return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders });
                }
                if (!env.DAILY_BUDGET) {
                    return Response.json({ error: 'DAILY_BUDGET not configured' }, { status: 503, headers: corsHeaders });
                }
                const counter = env.DAILY_BUDGET.get(env.DAILY_BUDGET.idFromName('global'));
                const res = await counter.fetch('https://daily-budget/status');
                return Response.json({ ...(await res.json() as object), rateLimiter: Boolean(env.RATE_LIMITER) }, { headers: corsHeaders });
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
                    features: ['search-text', 'search-by-text', 'search-by-vector', 'encode', 'taste-profile', 'taste-scores', 'recommend'],
                    d1Enabled: !!env.DB,
                }, { headers: corsHeaders });
            }

            return Response.json(
                { error: 'Not found. Endpoints: /search-text, /search-by-text, /search-by-vector, /encode, /upsert, /encode-and-upsert, /refresh-metadata, /recommend-by-id, /taste-profile, /taste-scores, /recommend, /check-ids, /delete-ids, /status' },
                { status: 404, headers: corsHeaders }
            );

        } catch (err: any) {
            console.error('Worker error:', err);
            return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
    }
};
