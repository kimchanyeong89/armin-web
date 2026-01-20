/**
 * Armin Semantic Search Worker
 * 로컬 CLIP 임베딩 + Cloudflare Vectorize
 */

interface Env {
    VECTORIZE: VectorizeIndex;
}

interface VectorizeIndex {
    query(vector: number[], options: { topK: number; returnMetadata?: boolean }): Promise<{ matches: VectorMatch[] }>;
    upsert(vectors: VectorRecord[]): Promise<{ count: number }>;
    getByIds(ids: string[]): Promise<VectorRecord[]>;
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

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
};

// Assuming ExecutionContext is available in the Workers environment or defined elsewhere.
// If not, it might need an import like `import type { ExecutionContext } from '@cloudflare/workers-types';`
interface ExecutionContext {
    waitUntil(promise: Promise<any>): void;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {
            // 벡터로 직접 검색: POST /search-by-vector
            // 로컬 CLIP에서 생성한 텍스트 임베딩을 받아서 검색
            if (url.pathname === '/search-by-vector' && request.method === 'POST') {
                const { vector, limit = 20 } = await request.json() as { vector: number[]; limit?: number };

                if (!vector || !Array.isArray(vector) || vector.length !== 512) {
                    return Response.json({ error: 'Invalid vector (must be 512 dimensions)' }, { status: 400, headers: corsHeaders });
                }

                // WARNING: DEBUG MODE - Testing connection
                const results = await env.VECTORIZE.query(vector, {
                    topK: Math.min(limit, 100),
                    returnMetadata: true, // Include all metadata (name, artist, image, museum, etc.)
                });

                // 만약 결과가 없으면 강제로 디버그용 더미 데이터 반환
                const debugResults = results.matches;
                if (debugResults.length === 0) {
                    return Response.json({
                        results: [{
                            id: 'debug-artwork-1',
                            score: 0.99,
                            n: 'Debug Artwork (System Check)', // name
                            a: 'System', // artist
                            m: 'Debug Museum', // museum
                            url: '', // image url
                            i: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg' // image
                        }]
                    }, { headers: corsHeaders });
                }

                return Response.json({
                    results: debugResults.map(m => ({
                        id: m.id,
                        score: m.score,
                        ...m.metadata
                    }))
                }, { headers: corsHeaders });
            }

            // 로컬 임베딩 직접 업로드: POST /upsert
            // 로컬 CLIP에서 생성한 이미지 임베딩을 Vectorize에 저장
            if (url.pathname === '/upsert' && request.method === 'POST') {
                const { vectors } = await request.json() as {
                    vectors: Array<{
                        id: string;
                        values: number[];
                        metadata?: { name?: string; artist?: string; museum?: string; url?: string };
                    }>
                };

                if (!vectors || !vectors.length) {
                    return Response.json({ error: 'No vectors provided' }, { status: 400, headers: corsHeaders });
                }

                // 벡터 검증
                const validVectors = vectors.filter(v =>
                    v.id &&
                    v.values &&
                    Array.isArray(v.values) &&
                    v.values.length === 512
                );

                if (validVectors.length === 0) {
                    return Response.json({ error: 'No valid vectors (each must have 512 dimensions)' }, { status: 400, headers: corsHeaders });
                }

                // Vectorize에 저장
                const records: VectorRecord[] = validVectors.map(v => ({
                    id: v.id,
                    values: v.values,
                    metadata: v.metadata || {}
                }));

                try {
                    await env.VECTORIZE.upsert(records);
                    return Response.json({
                        success: true,
                        count: records.length,
                    }, { headers: corsHeaders });
                } catch (error: any) {
                    return Response.json({
                        success: false,
                        error: error.message,
                    }, { status: 500, headers: corsHeaders });
                }
            }

            // ID 존재 여부 확인: POST /check-ids
            if (url.pathname === '/check-ids' && request.method === 'POST') {
                const { ids } = await request.json() as { ids: string[] };
                try {
                    const found = await env.VECTORIZE.getByIds(ids);
                    return Response.json({
                        count: found.length,
                        foundIds: found.map(f => f.id),
                        records: found
                    }, { headers: corsHeaders });
                } catch (e: any) {
                    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
                }
            }

            // 상태 확인: GET /status
            if (url.pathname === '/status') {
                return Response.json({
                    status: 'ok',
                    vectorize: 'armin-art-search',
                    model: 'openai/clip-vit-base-patch32',
                    provider: 'local',
                    dimensions: 512,
                }, { headers: corsHeaders });
            }

            return Response.json({ error: 'Not found. Available endpoints: /upsert, /search-by-vector, /status' }, { status: 404, headers: corsHeaders });

        } catch (error: any) {
            console.error('Error:', error);
            return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
        }
    }
};
