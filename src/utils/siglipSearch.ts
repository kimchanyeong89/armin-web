/**
 * Armin Gallery — SigLIP 시맨틱 검색 유틸
 *
 * 아키텍처 (완전 서버리스, 상시 무료):
 *  [Tier 1] 브라우저 WASM (Transformers.js)
 *           → siglip-encoder.worker.ts가 Xenova/siglip-base-patch16-224 텍스트 인코더를
 *             브라우저 내 WASM으로 실행. 첫 로드 ~70MB (이후 캐시). 비용 0원.
 *
 *  [Tier 2] Cloudflare Worker → HuggingFace Inference API (HF_TOKEN 필요)
 *           → Tier 1 실패 시 서버사이드 인코딩 폴백. 무료 tier 기준 하루 ~1,000건.
 */

const WORKER_URL = 'https://armin-semantic-search.armin-art.workers.dev';

// Mobile devices (touch-primary) skip the 70MB WASM model to prevent crashes
const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' && (
    navigator.maxTouchPoints > 1 ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
);

/** fetch with manual AbortController timeout (works on iOS 14+) */
function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(new DOMException('Timeout', 'AbortError')), ms);
    return fetch(url, { ...options, signal: ac.signal }).finally(() => clearTimeout(tid));
}

export interface SigLIPSearchResult {
    id: string;
    score: number;
    n?: string;   // name
    a?: string;   // artist
    m?: string;   // museum
    i?: string;   // image url
    u?: string;   // source url
    e?: string;   // exhibition
}

// ─────────────────────────────────────────────────────────────
// Web Worker 싱글톤 + Promise-based 요청/응답
// ─────────────────────────────────────────────────────────────

type EncoderStatus = 'idle' | 'loading' | 'ready' | 'error';

let encoderWorker: Worker | null = null;
let encoderStatus: EncoderStatus = 'idle';
let requestId = 0;
const pending = new Map<string, {
    resolve: (v: number[]) => void;
    reject: (e: Error) => void;
}>();

// 상태 변경 콜백 (UI에서 subscribe 가능)
const statusListeners = new Set<(s: EncoderStatus) => void>();
export function onEncoderStatusChange(cb: (s: EncoderStatus) => void) {
    statusListeners.add(cb);
    return () => statusListeners.delete(cb);
}
export function getEncoderStatus(): EncoderStatus { return encoderStatus; }

function setStatus(s: EncoderStatus) {
    encoderStatus = s;
    statusListeners.forEach(cb => cb(s));
}

function getWorker(): Worker {
    if (encoderWorker) return encoderWorker;

    encoderWorker = new Worker(
        new URL('../workers/siglip-encoder.worker.ts', import.meta.url),
        { type: 'module' }
    );

    encoderWorker.addEventListener('message', (e: MessageEvent) => {
        const { id, vector, error, type, status } = e.data;

        // 상태 메시지 처리
        if (type === 'status') {
            setStatus(status as EncoderStatus);
            return;
        }

        // 인코딩 응답 처리
        const req = pending.get(id);
        if (!req) return;
        pending.delete(id);

        if (error) req.reject(new Error(error));
        else req.resolve(vector);
    });

    encoderWorker.addEventListener('error', (e) => {
        console.warn('[SigLIP Worker] Error:', e.message);
        setStatus('error');
    });

    setStatus('loading');
    return encoderWorker;
}

/**
 * 브라우저 WASM으로 텍스트 → 768D 벡터 변환
 * 첫 호출 시 ~70MB 모델 다운로드 (이후 캐시)
 * 모바일에서는 메모리 크래시 방지를 위해 스킵
 *
 * Timeout was 45s (covering cold model download). Now 7s — if WASM hasn't
 * encoded by then, the parallel server race below has long since won and
 * the browser result is moot.
 */
const BROWSER_ENCODE_TIMEOUT_MS = 7_000;

async function encodeWithBrowser(text: string): Promise<number[] | null> {
    if (IS_MOBILE_DEVICE) return null; // Skip 70MB WASM on mobile
    return new Promise((resolve) => {
        try {
            const worker = getWorker();
            const id = String(++requestId);

            const timer = setTimeout(() => {
                pending.delete(id);
                resolve(null);
            }, BROWSER_ENCODE_TIMEOUT_MS);

            pending.set(id, {
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (err) => { clearTimeout(timer); console.warn('[SigLIP] Encode error:', err); resolve(null); },
            });

            worker.postMessage({ id, text });
        } catch (err) {
            console.warn('[SigLIP] Worker init failed:', err);
            resolve(null);
        }
    });
}

// ─────────────────────────────────────────────────────────────
// 메인 검색 함수
// ─────────────────────────────────────────────────────────────

/**
 * 텍스트로 시맨틱 검색 — Tier 1과 Tier 2를 병렬로 실행해서 먼저 끝나는 쪽 채택.
 * 이전 구현은 Tier 1 → Tier 2 순차였는데, WASM 인코더가 콜드 로드 중이면
 * 브라우저 경로가 7초 가까이 막히고 그 동안 사용자는 빈 화면을 본다.
 * 이제는 두 경로를 동시에 띄워서:
 *   - WASM이 이미 ready 상태면 ~50-200ms로 브라우저 쪽이 이긴다
 *   - WASM이 cold/loading이면 서버가 ~500ms로 먼저 결과를 돌려준다
 * 어느 쪽이든 1초 안에 결과를 받는다.
 *
 *  Tier 1: 브라우저 WASM (Transformers.js) → 무료, 서버 round-trip 절약
 *  Tier 2: Cloudflare Worker /search-by-text → 항상 일관된 baseline
 */
export async function searchByText(
    text: string,
    limit: number = 50
): Promise<SigLIPSearchResult[]> {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];

    // Tier 2 — server. Always fire (it's our reliable baseline).
    const serverPromise: Promise<SigLIPSearchResult[] | null> = (async () => {
        try {
            const res = await fetchWithTimeout(`${WORKER_URL}/search-by-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                mode: 'cors',
                body: JSON.stringify({ text: trimmed, limit }),
            }, 12_000);
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                console.warn(`[SigLIP] /search-by-text failed (${res.status}): ${errText.slice(0, 200)}`);
                return null;
            }
            const data = await res.json() as { results?: SigLIPSearchResult[] };
            return data?.results ?? [];
        } catch (err) {
            console.warn('[SigLIP] /search-by-text request failed:', err);
            return null;
        }
    })();

    // Tier 1 — browser WASM. Skipped on mobile entirely.  On desktop we
    // still try it because once the model is loaded a single round-trip
    // (no HF call on the worker) is faster than tier 2.
    const browserPromise: Promise<SigLIPSearchResult[] | null> = (async () => {
        if (IS_MOBILE_DEVICE) return null;
        const vector = await encodeWithBrowser(trimmed);
        if (!vector || vector.length !== 768) return null;
        try {
            const res = await fetchWithTimeout(`${WORKER_URL}/search-by-vector`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                mode: 'cors',
                body: JSON.stringify({ vector, limit }),
            }, 12_000);
            if (!res.ok) return null;
            const data = await res.json() as { results?: SigLIPSearchResult[] };
            return data?.results ?? [];
        } catch (err) {
            console.warn('[SigLIP] /search-by-vector failed:', err);
            return null;
        }
    })();

    // Race: take whichever returns first with a non-empty result.
    // Promise.race resolves on the first SETTLED promise, so we can't naively
    // race them — a path that fails fast (returns null) would 'win' over a
    // slower path that returns real data. We resolve race only on non-empty
    // success; null/empty is treated as 'still racing'.
    const racingWinner = await new Promise<SigLIPSearchResult[] | null>((resolve) => {
        let settled = 0;
        const onResult = (r: SigLIPSearchResult[] | null) => {
            settled += 1;
            if (r && r.length > 0) resolve(r);
            else if (settled === 2) resolve(null);
        };
        browserPromise.then(onResult, () => onResult(null));
        serverPromise.then(onResult, () => onResult(null));
    });

    if (racingWinner) return racingWinner;

    // Both paths returned empty / failed. Award server its retry-cycle so the
    // caller can see the actual server response (might be a transient empty).
    return (await serverPromise) ?? [];
}

/**
 * 텍스트 → 768D 벡터 변환 (브라우저 WASM)
 * searchByText의 인코딩 단계만 분리 — 여러 텍스트를 개별 인코딩 후 평균 낼 때 사용
 */
export async function encodeText(text: string): Promise<number[] | null> {
    return encodeWithBrowser(text);
}

/**
 * 사전 계산된 벡터로 직접 Vectorize 검색
 * 취향 centroid 계산 후 직접 검색 시 사용
 */
export async function searchByVector(vector: number[], limit: number = 50): Promise<SigLIPSearchResult[]> {
    if (!vector || vector.length !== 768) return [];
    try {
        const res = await fetchWithTimeout(`${WORKER_URL}/search-by-vector`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            mode: 'cors',
            body: JSON.stringify({ vector, limit }),
        }, 12_000);
        if (res.ok) {
            const data = await res.json() as { results?: SigLIPSearchResult[] };
            return data.results ?? [];
        }
        console.warn('[SigLIP] /search-by-vector failed:', res.status, await res.text().catch(() => ''));
    } catch (err) {
        console.warn('[SigLIP] /search-by-vector error:', err);
    }
    return [];
}

/**
 * 특정 작품 ID와 유사한 작품 검색 (이미지 벡터 직접 비교)
 * 텍스트 인코딩 없이 Vectorize에서 직접 검색 → 같은 작가 작품이 상위에 오는 경향
 */
export async function searchSimilarTo(id: string, limit: number = 10): Promise<SigLIPSearchResult[]> {
    if (!id) return [];
    try {
        // Worker에는 /similar-to GET이 없음 → /recommend-by-id POST 사용
        const res = await fetchWithTimeout(`${WORKER_URL}/recommend-by-id`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            mode: 'cors',
            body: JSON.stringify({ id, limit }),
        }, 12_000);
        if (res.ok) {
            const data = await res.json() as { results?: SigLIPSearchResult[] };
            return data.results ?? [];
        }
        console.warn('[SigLIP] /recommend-by-id failed:', res.status);
    } catch (err) {
        console.warn('[SigLIP] /recommend-by-id error:', err);
    }
    return [];
}

/**
 * 인코더 모델 백그라운드 프리로드 (AI 버튼 hover 시 호출 권장)
 */
export function preloadEncoder(): void {
    if (IS_MOBILE_DEVICE) return; // Don't load 70MB WASM on mobile
    if (encoderStatus === 'idle') {
        try { getWorker(); } catch { /* noop */ }
    }
}

/**
 * Worker 상태 확인
 */
export async function checkWorkerStatus(): Promise<{ ok: boolean; info?: unknown }> {
    try {
        const res = await fetch(`${WORKER_URL}/status`);
        if (res.ok) return { ok: true, info: await res.json() };
        return { ok: false };
    } catch {
        return { ok: false };
    }
}
