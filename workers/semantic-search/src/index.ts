/**
 * Armin Semantic Search Worker
 * 로컬 CLIP 임베딩 + Cloudflare Vectorize + HuggingFace Inference API (Lazy Indexing)
 */

interface Env {
    VECTORIZE: VectorizeIndex;
    HF_TOKEN: string; // HuggingFace Token for CLIP Inference
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
            if (url.pathname === '/search-by-vector' && request.method === 'POST') {
                const { vector, limit = 20 } = await request.json() as { vector: number[]; limit?: number };

                if (!vector || !Array.isArray(vector) || vector.length !== 512) {
                    return Response.json({ error: 'Invalid vector (must be 512 dimensions)' }, { status: 400, headers: corsHeaders });
                }

                // WARNING: DEBUG MODE - Testing connection
                const results = await env.VECTORIZE.query(vector, {
                    topK: Math.min(limit, 50),
                    returnMetadata: true, // Enable metadata to return name, artist, museum, url
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

                const validVectors = vectors.filter(v =>
                    v.id &&
                    v.values &&
                    Array.isArray(v.values) &&
                    v.values.length === 512
                );

                if (validVectors.length === 0) {
                    return Response.json({ error: 'No valid vectors (each must have 512 dimensions)' }, { status: 400, headers: corsHeaders });
                }

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

            // ID 기반 유사 작품 추천: POST /recommend-by-id
            if (url.pathname === '/recommend-by-id' && request.method === 'POST') {
                const { id, limit = 6, metadata } = await request.json() as { id: string; limit?: number; metadata?: any };

                if (!id) {
                    return Response.json({ error: 'ID is required' }, { status: 400, headers: corsHeaders });
                }

                try {
                    // 1. 해당 ID의 벡터 가져오기
                    let vectors = await env.VECTORIZE.getByIds([id]);

                    // 2. Lazy Indexing: 벡터가 없고 메타데이터와 토큰이 있는 경우 즉시 생성
                    if ((!vectors || vectors.length === 0) && metadata && metadata.image && env.HF_TOKEN) {
                        try {
                            // Fetch image blob
                            const imgRes = await fetch(metadata.image);
                            if (imgRes.ok) {
                                const imgBlob = await imgRes.blob();
                                // Call HuggingFace Inference API for CLIP (openai/clip-vit-base-patch32)
                                const hfRes = await fetch('https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32', {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${env.HF_TOKEN}`
                                        // Content-Type should be automatically handled or raw binary
                                    },
                                    body: imgBlob
                                });

                                if (hfRes.ok) {
                                    const embedding: any = await hfRes.json();
                                    // embedding format might be [0.1, 0.2, ...] or [[0.1, ...]] depending on version
                                    const vector = Array.isArray(embedding) && Array.isArray(embedding[0]) ? embedding[0] : embedding;

                                    if (Array.isArray(vector) && vector.length === 512) {
                                        // Create metadata record
                                        const meta = {
                                            n: metadata.name || '',
                                            a: metadata.artist || '',
                                            m: metadata.museum || '',
                                            i: metadata.image || '',
                                            u: metadata.url || ''
                                        };

                                        // Upsert to Vectorize
                                        await env.VECTORIZE.upsert([{
                                            id: id,
                                            values: vector,
                                            metadata: meta
                                        }]);

                                        // Use this vector for query
                                        vectors = [{ id, values: vector, metadata: meta }];
                                    } else {
                                        console.error('Invalid vector dimension from HF:', vector.length);
                                    }
                                } else {
                                    console.error('HF API Error:', hfRes.status, await hfRes.text());
                                }
                            }
                        } catch (lazyErr) {
                            console.error('Lazy indexing failed:', lazyErr);
                        }
                    }

                    if (!vectors || vectors.length === 0) {
                        return Response.json({ error: 'Artwork not found in vector database' }, { status: 404, headers: corsHeaders });
                    }

                    const vector = vectors[0].values;

                    // 2. 해당 벡터와 유사한 아이템 검색
                    const searchResults = await env.VECTORIZE.query(vector, {
                        topK: Math.min(limit * 2, 20),
                        returnMetadata: true
                    });

                    // 3. Filter out self-matches and limit results
                    const matches = searchResults.matches
                        .filter(m => m.id !== id)
                        .slice(0, limit);

                    return Response.json({
                        results: matches.map(m => ({
                            id: m.id,
                            score: m.score,
                            ...m.metadata
                        }))
                    }, { headers: corsHeaders });

                } catch (e: any) {
                    console.error('Recommend Error:', e);
                    // Return empty results instead of 500 to avoid noisy browser console errors
                    return Response.json({ results: [] }, { headers: corsHeaders });
                }
            }

            // 상태 확인: GET /status
            if (url.pathname === '/status') {
                return Response.json({
                    status: 'ok',
                    vectorize: 'armin-art-search',
                    model: 'openai/clip-vit-base-patch32',
                    provider: 'local + hf-inference-lazy',
                    dimensions: 512,
                }, { headers: corsHeaders });
            }

            return Response.json({ error: 'Not found. Available endpoints: /upsert, /search-by-vector, /status, /recommend-by-id' }, { status: 404, headers: corsHeaders });

        } catch (error: any) {
            console.error('Error:', error);
            return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
        }
    }
};
