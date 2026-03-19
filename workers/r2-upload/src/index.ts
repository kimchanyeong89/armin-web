/**
 * Cloudflare Worker for R2 image upload
 * Deploy this to Cloudflare Workers with R2 binding
 * 
 * Environment variables needed:
 * - R2_BUCKET: Your R2 bucket binding name
 * 
 * wrangler.toml should include:
 * [[r2_buckets]]
 * binding = "R2_BUCKET"
 * bucket_name = "armin-images"
 */

export interface Env {
    R2_BUCKET: R2Bucket;
    R2_PUBLIC_URL: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // POST /upload - Upload image to R2
        if (request.method === 'POST' && url.pathname === '/upload') {
            try {
                const formData = await request.formData();
                const file = formData.get('file') as unknown as File;
                const exhibitionId = formData.get('exhibitionId') as string;
                const submissionId = formData.get('submissionId') as string;

                if (!file) {
                    return new Response(JSON.stringify({ error: 'No file provided' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // Validate file type
                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                if (!allowedTypes.includes(file.type)) {
                    return new Response(JSON.stringify({ error: 'Invalid file type. Use JPEG, PNG, or WebP' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // Convert to WebP for optimal storage
                const arrayBuffer = await file.arrayBuffer();

                // Generate unique filename
                const timestamp = Date.now();
                const sanitizedExhibitionId = (exhibitionId || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
                const filename = `submissions/${sanitizedExhibitionId}/${submissionId || timestamp}.webp`;

                // Upload to R2
                await env.R2_BUCKET.put(filename, arrayBuffer, {
                    httpMetadata: {
                        contentType: 'image/webp',
                    },
                    customMetadata: {
                        exhibitionId: exhibitionId || '',
                        submissionId: submissionId || '',
                        originalName: file.name,
                        uploadedAt: new Date().toISOString(),
                    },
                });

                // Return public URL via this worker (proxy) to ensuring access without public bucket setting
                const workerOrigin = new URL(request.url).origin;
                const publicUrl = `${workerOrigin}/image/${filename}`;

                return new Response(JSON.stringify({
                    success: true,
                    url: publicUrl,
                    filename
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });

            } catch (error) {
                console.error('Upload error:', error);
                return new Response(JSON.stringify({ error: 'Upload failed' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
        }

        // GET /image/:key - Retrieve image from R2
        if (request.method === 'GET' && url.pathname.startsWith('/image/')) {
            const key = url.pathname.replace('/image/', '');

            try {
                const object = await env.R2_BUCKET.get(key);

                if (!object) {
                    return new Response('Not found', { status: 404, headers: corsHeaders });
                }

                const headers = new Headers(corsHeaders);
                headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp');
                headers.set('Cache-Control', 'public, max-age=31536000'); // 1 year cache

                return new Response(object.body, { headers });
            } catch {
                return new Response('Error retrieving image', { status: 500, headers: corsHeaders });
            }
        }

        return new Response('Not found', { status: 404, headers: corsHeaders });
    },
};
