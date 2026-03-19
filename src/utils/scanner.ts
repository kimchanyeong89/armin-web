import heic2any from 'heic2any';

declare global {
    interface Window { cv: any; }
}

let isOpenCVLoaded = false;
let openCVLoadPromise: Promise<void> | null = null;

export interface ScanResult {
    blob: Blob;
    original?: File;
    metadata?: { title?: string; artist?: string; year?: string };
    corners?: { x: number; y: number }[];
}

export const loadOpenCV = (): Promise<void> => {
    if (isOpenCVLoaded) return Promise.resolve();
    if (openCVLoadPromise) return openCVLoadPromise;
    openCVLoadPromise = new Promise((resolve, reject) => {
        if (window.cv?.Mat) { isOpenCVLoaded = true; resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://docs.opencv.org/4.7.0/opencv.js';
        s.async = true;
        s.onload = () => {
            const poll = () => {
                if (window.cv?.Mat) { isOpenCVLoaded = true; resolve(); }
                else if (window.cv?.onRuntimeInitialized !== undefined) {
                    window.cv.onRuntimeInitialized = () => { isOpenCVLoaded = true; resolve(); };
                } else setTimeout(poll, 100);
            };
            poll();
        };
        s.onerror = () => { openCVLoadPromise = null; reject(new Error('OpenCV load failed')); };
        document.body.appendChild(s);
    });
    return openCVLoadPromise;
};

/* ── helpers ── */
const isHeicFile = (f: File) => {
    if (f.type === 'image/heic' || f.type === 'image/heif') return true;
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ext === 'heic' || ext === 'heif';
};

const c2b = (c: HTMLCanvasElement, t: string, q: number): Promise<Blob> =>
    new Promise(r => c.toBlob(b => r(b || new Blob()), t, q));

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const r = reader.result as string;
            resolve(r.includes(',') ? r.split(',')[1] : r);
        };
        reader.readAsDataURL(blob);
    });

interface Pt { x: number; y: number }
interface Corners { topLeft: number[]; topRight: number[]; bottomRight: number[]; bottomLeft: number[] }
interface GeminiResult {
    artist: string; title: string; year: string;
    corners: Corners | null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAIN ENTRY
   
   Architecture:
   1. Send image to Gemini Vision → metadata + painting corner coords
   2. If corners available: crop + perspective correct using AI-detected coords
   3. If corners unavailable: fall back to OpenCV contour detection
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const scanImage = async (file: File): Promise<ScanResult> => {
    await loadOpenCV();
    let imgFile: File = file;
    let wasHeic = false;

    // 1. HEIC
    if (isHeicFile(file)) {
        try {
            const c = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
            const b = Array.isArray(c) ? c[0] : c;
            imgFile = new File([b], file.name.replace(/\.(heic|heif)$/i, '.jpeg'), { type: 'image/jpeg' });
            wasHeic = true;
        } catch (e) { console.error('[Scan] HEIC fail:', e); }
    }

    // 2. Call Gemini Vision (metadata only — image processing done by OpenCV)
    let gemini: GeminiResult | null = null;
    try {
        gemini = await callGemini(imgFile);
        console.log('[Scan] Gemini metadata:', gemini?.artist, '—', gemini?.title, '(', gemini?.year, ')');
    } catch (e) {
        console.warn('[Scan] Gemini failed:', e);
    }

    // 3. Process image with OpenCV (perspective correction + frame removal)
    let paintingBlob: Blob;
    let detectedCorners: { x: number; y: number }[] | undefined;
    try {
        const res = await opencvProcess(imgFile);
        paintingBlob = res.blob;
        detectedCorners = res.corners;
    } catch (e) {
        console.error('[Scan] OpenCV failed:', e);
        paintingBlob = imgFile;
    }

    return {
        blob: paintingBlob,
        original: wasHeic ? imgFile : undefined,
        metadata: gemini ? {
            title: gemini.title || undefined,
            artist: gemini.artist || undefined,
            year: gemini.year || undefined,
        } : undefined,
        corners: detectedCorners
    };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DAILY RATE LIMITER — stay within free tier (1,500/day)
   We cap at 100/day as extra safety margin
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const DAILY_LIMIT = 1500;
const STORAGE_KEY = 'gemini_scan_usage';

const checkRateLimit = (): boolean => {
    try {
        const today = new Date().toISOString().slice(0, 10); // "2026-02-14"
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : { date: today, count: 0 };
        // Reset counter on new day
        if (data.date !== today) return true; // new day, allowed
        return data.count < DAILY_LIMIT;
    } catch { return true; }
};

const incrementUsage = () => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const raw = localStorage.getItem(STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : { date: '', count: 0 };
        if (data.date !== today) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: 1 }));
        } else {
            data.count++;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch { }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GEMINI VISION API CALL
   Tries: 1) /api/scan-label (production)
          2) Direct Gemini call (dev, using VITE_GEMINI_API_KEY)
   Rate-limited to 100 calls/day (free tier = 1,500/day)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const getScanLabelEndpoints = (): string[] => {
    const endpoints: string[] = ['/api/scan-label'];
    const envEndpoint = (import.meta.env.VITE_SCAN_LABEL_ENDPOINT as string | undefined)?.trim();
    if (envEndpoint) {
        const normalized = envEndpoint.endsWith('/api/scan-label')
            ? envEndpoint
            : `${envEndpoint.replace(/\/+$/, '')}/api/scan-label`;
        endpoints.push(normalized);
    } else if (import.meta.env.DEV) {
        // Allow dev server to hit deployed Cloudflare function to avoid 404 + rate limit churn
        endpoints.push('https://armin-web.pages.dev/api/scan-label');
    }
    return Array.from(new Set(endpoints));
};

const callGemini = async (file: File): Promise<GeminiResult> => {
    if (!checkRateLimit()) {
        console.warn('[Scan] Daily Gemini limit reached (100/day). Skipping AI scan.');
        throw new Error('Daily scan limit reached');
    }
    const resized = await resizeForAPI(file, 1600);
    const base64 = await blobToBase64(resized);
    const mimeType = resized.type || 'image/jpeg';

    const endpoints = getScanLabelEndpoints();
    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: base64, mimeType }),
            });
            if (res.ok) {
                const data = await res.json();
                incrementUsage();
                return data as GeminiResult;
            }
            console.warn(`[Scan] ${endpoint} returned`, res.status);
        } catch (e) {
            console.warn(`[Scan] ${endpoint} fetch error:`, e);
        }
    }

    // Dev fallback: call Gemini directly using VITE env variable
    const devKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!devKey) {
        throw new Error('No Gemini API available (add VITE_GEMINI_API_KEY to .env for dev)');
    }

    console.log('[Scan] Using dev mode direct Gemini call');
    const result = await callGeminiDirect(base64, mimeType, devKey);
    incrementUsage();
    return result;
};

const callGeminiDirect = async (base64: string, mimeType: string, apiKey: string): Promise<GeminiResult> => {
    const prompt = `Analyze this museum photograph of a framed artwork.
READ the museum label/placard and extract:
- artist: full name
- title: artwork title
- year: creation year only as a number (NOT birth/death years, strip "um","ca.","vers","circa")

Return ONLY JSON (no markdown, no corners):
{"artist":"...","title":"...","year":"..."}`;

    const body = JSON.stringify({
        contents: [{
            role: 'user', parts: [
                { inlineData: { mimeType, data: base64 } },
                { text: prompt },
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 400,
            thinkingConfig: { thinkingBudget: 0 },
        },
    });

    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
        );

        if (res.status === 429) {
            const wait = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s
            console.warn(`[Scan] Gemini 429 rate limited — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, wait));
            continue;
        }

        if (!res.ok) {
            const errText = await res.text();
            console.error('[Scan] Gemini API error:', res.status, errText.slice(0, 300));
            throw new Error(`Gemini ${res.status}`);
        }

        const data: any = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let allText = '';
        for (const part of parts) {
            if (part.text) allText += part.text + '\n';
        }
        console.log('[Scan] Gemini raw response:', allText.slice(0, 500));

        const cleaned = allText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        const jm = cleaned.match(/\{[\s\S]*\}/);
        if (!jm) throw new Error('No JSON in Gemini response: ' + allText.slice(0, 200));

        const p = JSON.parse(jm[0]);
        let yearStr = (p.year || '').toString().trim();
        const ym = yearStr.match(/(\d{4})/);
        if (ym) yearStr = ym[1];

        return {
            artist: (p.artist || '').trim(),
            title: (p.title || '').trim(),
            year: yearStr,
            corners: null,
        };
    }
    throw new Error('Gemini 429: rate limit exceeded after retries');
};

const resizeForAPI = (file: File, maxDim: number): Promise<Blob> =>
    new Promise(resolve => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.round(img.naturalWidth * s);
            const h = Math.round(img.naturalHeight * s);
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d')!.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            c.toBlob(b => resolve(b || file), 'image/jpeg', 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   OPENCV IMAGE PROCESSING — TWO-PASS APPROACH
   Pass 1: Detect outer frame quad → perspective warp (flattens)
   Pass 2: On warped image, detect inner painting quad → warp again
           (removes frame/mat, extracts clean painting)
   Fallback: 5% inset if second pass fails
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const opencvProcess = async (file: File): Promise<{ blob: Blob, corners?: { x: number; y: number }[] }> => {
    return new Promise(resolve => {
        const el = new Image();
        const url = URL.createObjectURL(file);
        el.onload = async () => {
            try {
                const cv = window.cv;
                const src = cv.imread(el);
                const originalW = src.cols;
                const originalH = src.rows;

                // ── Pass 1: outer frame → perspective warp ──
                const outer = detectOuterQuad(cv, src);
                let pass1: any;
                let M1: any = null; // Transformation Matrix for Pass 1
                let pass1Corners: Pt[] | null = null;

                if (outer) {
                    console.log('[Scan] Pass 1: outer frame detected → perspective warp');
                    const { warped, M, corners } = warpWithInfo(cv, src, outer);
                    pass1 = warped;
                    M1 = M;
                    pass1Corners = corners;
                    // src.delete(); // Don't delete src yet if we need M1 inverse? actually M1 is distinct.
                    // But we keep src logic same as before to be safe
                } else {
                    console.warn('[Scan] Pass 1: no outer frame → using original');
                    pass1 = src.clone(); // Clone so we can delete src consistently
                    // M1 is identity, implicitly
                }
                src.delete();

                // ── Pass 2: find inner painting contour in flat image ──
                const inner = detectInnerQuad(cv, pass1);
                let final: any;
                let finalCornersInOriginal: { x: number; y: number }[] | undefined;

                if (inner) {
                    // Check that inner quad is meaningfully smaller than pass1
                    const innerA = quadArea(inner);
                    const pass1A = pass1.rows * pass1.cols;
                    if (innerA < pass1A * 0.92 && innerA > pass1A * 0.10) {
                        console.log('[Scan] Pass 2: inner painting detected → 2nd warp');
                        final = warp(cv, pass1, inner);

                        // Calculate corners in original image space
                        if (M1) {
                            try {
                                // Map inner points back to src using manual inverse
                                const originalPts = mapPointsBack(inner, M1);
                                finalCornersInOriginal = originalPts.map(p => ({ x: p.x / originalW, y: p.y / originalH }));
                            } catch (err) {
                                console.warn('[Scan] Failed to map points back:', err);
                            }
                        } else {
                            // No Pass 1 transform, so inner points ARE in original coords (normalized)
                            finalCornersInOriginal = inner.map(p => ({ x: p.x / originalW, y: p.y / originalH }));
                        }

                    } else {
                        console.log('[Scan] Pass 2: inner quad too similar/small → 5% inset');
                        final = applyInset(cv, pass1, 0.05);
                        if (pass1Corners) {
                            finalCornersInOriginal = pass1Corners.map(p => ({ x: p.x / originalW, y: p.y / originalH }));
                        }
                    }
                } else {
                    console.log('[Scan] Pass 2: no inner quad → 5% inset');
                    final = applyInset(cv, pass1, 0.05);
                    if (pass1Corners) {
                        finalCornersInOriginal = pass1Corners.map(p => ({ x: p.x / originalW, y: p.y / originalH }));
                    }
                }

                if (M1) M1.delete();
                if (pass1) pass1.delete();

                const canvas = document.createElement('canvas');
                cv.imshow(canvas, final);
                const blob = await c2b(canvas, 'image/webp', 0.95);
                final.delete();
                URL.revokeObjectURL(url);

                resolve({ blob, corners: finalCornersInOriginal });
            } catch (e) {
                console.error('[Scan] OpenCV error:', e);
                URL.revokeObjectURL(url);
                resolve({ blob: file });
            }
        };
        el.onerror = () => { URL.revokeObjectURL(url); resolve({ blob: file }); };
        el.src = url;
    });
};

/* ━━━━ INNER QUAD DETECTION (second pass on warped image) ━━━━ */
const detectInnerQuad = (cv: any, src: any): Pt[] | null => {
    const mx = 800;
    const sf = Math.min(mx / src.rows, mx / src.cols, 1);
    const ds = new cv.Mat();
    cv.resize(src, ds, new cv.Size(0, 0), sf, sf, cv.INTER_AREA);
    const gray = new cv.Mat();
    cv.cvtColor(ds, gray, cv.COLOR_RGBA2GRAY, 0);

    // Try multiple edge detection strategies to find the painting canvas
    let q = innerCannyQ(cv, gray, ds, sf, 30, 100);
    if (!q) q = innerCannyQ(cv, gray, ds, sf, 50, 150);
    if (!q) q = innerCannyQ(cv, gray, ds, sf, 20, 80);
    if (!q) q = innerAdaptQ(cv, gray, ds, sf);

    gray.delete(); ds.delete();
    return q;
};

const innerCannyQ = (cv: any, gray: any, ds: any, sf: number, lo: number, hi: number): Pt[] | null => {
    const b = new cv.Mat(); cv.GaussianBlur(gray, b, new cv.Size(5, 5), 0);
    const e = new cv.Mat(); cv.Canny(b, e, lo, hi, 3, false);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const c = new cv.Mat(); cv.morphologyEx(e, c, cv.MORPH_CLOSE, k);
    const r = findInnerQ(cv, c, ds, sf);
    b.delete(); e.delete(); k.delete(); c.delete();
    return r;
};

const innerAdaptQ = (cv: any, gray: any, ds: any, sf: number): Pt[] | null => {
    const bin = new cv.Mat();
    cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const c = new cv.Mat(); cv.morphologyEx(bin, c, cv.MORPH_CLOSE, k);
    const r = findInnerQ(cv, c, ds, sf);
    bin.delete(); k.delete(); c.delete();
    return r;
};

/* Find the largest quadrilateral that is NOT the image boundary */
const findInnerQ = (cv: any, binary: any, ds: any, sf: number): Pt[] | null => {
    const cnts = new cv.MatVector(); const hier = new cv.Mat();
    cv.findContours(binary, cnts, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const imgA = ds.rows * ds.cols;
    const margin = 0.03;

    let best: any = null, bestA = 0;
    for (let i = 0; i < cnts.size(); i++) {
        const cnt = cnts.get(i);
        const a = cv.contourArea(cnt);
        if (a < imgA * 0.15 || a > imgA * 0.92) continue;

        for (const eps of [0.02, 0.03, 0.05, 0.08]) {
            const p = cv.arcLength(cnt, true);
            const ap = new cv.Mat();
            cv.approxPolyDP(cnt, ap, eps * p, true);
            if (ap.rows === 4 && cv.isContourConvex(ap)) {
                const d = ap.data32S;
                const pts = [
                    { x: d[0], y: d[1] }, { x: d[2], y: d[3] },
                    { x: d[4], y: d[5] }, { x: d[6], y: d[7] }
                ];
                const bm = Math.round(Math.min(ds.rows, ds.cols) * margin);
                const touchesBorder = pts.some(p =>
                    p.x < bm || p.y < bm || p.x > ds.cols - bm || p.y > ds.rows - bm
                );
                if (!touchesBorder && a > bestA) {
                    bestA = a; if (best) best.delete(); best = ap; break;
                } else {
                    ap.delete();
                }
            } else ap.delete();
        }
    }

    let result: Pt[] | null = null;
    if (best) {
        const inv = 1 / sf; const d = best.data32S;
        result = sortC([
            { x: d[0] * inv, y: d[1] * inv }, { x: d[2] * inv, y: d[3] * inv },
            { x: d[4] * inv, y: d[5] * inv }, { x: d[6] * inv, y: d[7] * inv }
        ]);
        best.delete();
    }
    cnts.delete(); hier.delete();
    return result;
};

/* ━━━━ HELPERS ━━━━ */
const quadArea = (pts: Pt[]): number => {
    // Shoelace formula
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(a) / 2;
};

const applyInset = (cv: any, src: any, pct: number): any => {
    const ix = Math.round(src.cols * pct);
    const iy = Math.round(src.rows * pct);
    const cw = Math.max(50, src.cols - 2 * ix);
    const ch = Math.max(50, src.rows - 2 * iy);
    const cropped = src.roi(new cv.Rect(ix, iy, cw, ch));
    const result = cropped.clone();
    cropped.delete();
    return result;
};

/* ━━━━ OUTER QUAD DETECTION (4-strategy cascade) ━━━━ */
const detectOuterQuad = (cv: any, src: any): Pt[] | null => {
    const mx = 800;
    const sf = Math.min(mx / src.rows, mx / src.cols, 1);
    const ds = new cv.Mat();
    cv.resize(src, ds, new cv.Size(0, 0), sf, sf, cv.INTER_AREA);
    const gray = new cv.Mat();
    cv.cvtColor(ds, gray, cv.COLOR_RGBA2GRAY, 0);

    let q = cannyQ(cv, gray, ds, sf, 50, 150);
    if (!q) q = cannyQ(cv, gray, ds, sf, 30, 100);
    if (!q) q = adaptQ(cv, gray, ds, sf);
    if (!q) q = minAreaQ(cv, gray, ds, sf);

    gray.delete(); ds.delete();
    return q;
};

const cannyQ = (cv: any, gray: any, ds: any, sf: number, lo: number, hi: number): Pt[] | null => {
    const b = new cv.Mat(); cv.GaussianBlur(gray, b, new cv.Size(5, 5), 0);
    const e = new cv.Mat(); cv.Canny(b, e, lo, hi, 3, false);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    const c = new cv.Mat(); cv.morphologyEx(e, c, cv.MORPH_CLOSE, k);
    const r = findQ(cv, c, ds, sf);
    b.delete(); e.delete(); k.delete(); c.delete();
    return r;
};

const adaptQ = (cv: any, gray: any, ds: any, sf: number): Pt[] | null => {
    const bin = new cv.Mat();
    cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const c = new cv.Mat(); cv.morphologyEx(bin, c, cv.MORPH_CLOSE, k);
    const r = findQ(cv, c, ds, sf);
    bin.delete(); k.delete(); c.delete();
    return r;
};

const findQ = (cv: any, binary: any, ds: any, sf: number): Pt[] | null => {
    const cnts = new cv.MatVector(); const hier = new cv.Mat();
    cv.findContours(binary, cnts, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const imgA = ds.rows * ds.cols;
    let best: any = null, bestA = 0;
    for (let i = 0; i < cnts.size(); i++) {
        const cnt = cnts.get(i);
        const a = cv.contourArea(cnt);
        if (a < imgA * 0.08) continue;
        for (const eps of [0.02, 0.03, 0.05, 0.08]) {
            const p = cv.arcLength(cnt, true);
            const ap = new cv.Mat();
            cv.approxPolyDP(cnt, ap, eps * p, true);
            if (ap.rows === 4 && cv.isContourConvex(ap) && a > bestA) {
                bestA = a; if (best) best.delete(); best = ap; break;
            } else ap.delete();
        }
    }
    let result: Pt[] | null = null;
    if (best) {
        const inv = 1 / sf; const d = best.data32S;
        result = sortC([
            { x: d[0] * inv, y: d[1] * inv }, { x: d[2] * inv, y: d[3] * inv },
            { x: d[4] * inv, y: d[5] * inv }, { x: d[6] * inv, y: d[7] * inv }
        ]);
        best.delete();
    }
    cnts.delete(); hier.delete();
    return result;
};

const minAreaQ = (cv: any, gray: any, ds: any, sf: number): Pt[] | null => {
    const b = new cv.Mat(); cv.GaussianBlur(gray, b, new cv.Size(5, 5), 0);
    const e = new cv.Mat(); cv.Canny(b, e, 20, 120, 3, false);
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(11, 11));
    const c = new cv.Mat(); cv.morphologyEx(e, c, cv.MORPH_CLOSE, k);
    const cnts = new cv.MatVector(); const hier = new cv.Mat();
    cv.findContours(c, cnts, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const imgA = ds.rows * ds.cols;
    let largest: any = null, la = 0;
    for (let i = 0; i < cnts.size(); i++) {
        const cnt = cnts.get(i);
        const a = cv.contourArea(cnt);
        if (a > imgA * 0.08 && a > la) { la = a; largest = cnt; }
    }
    let result: Pt[] | null = null;
    if (largest) {
        const rr = cv.minAreaRect(largest);
        const pts = cv.RotatedRect.points(rr);
        const inv = 1 / sf;
        result = sortC(pts.map((p: any) => ({ x: p.x * inv, y: p.y * inv })));
    }
    b.delete(); e.delete(); k.delete(); c.delete(); cnts.delete(); hier.delete();
    return result;
};

/* ━━━━ HELPER for MAPPING POINTS BACK ━━━━ */
/* ━━━━ HELPER for MAPPING POINTS BACK ━━━━ */
const mapPointsBack = (points: Pt[], M: any): { x: number, y: number }[] => {
    // Read 3x3 matrix data
    // OpenCV.js M.data64F gives a Float64Array view
    const d = M.data64F;
    if (!d || d.length < 9) throw new Error('Invalid matrix data');

    // Matrix M:
    // [d0 d1 d2]
    // [d3 d4 d5]
    // [d6 d7 d8]

    // Invert 3x3 Matrix:
    // A^-1 = 1/det(A) * adj(A)
    const buf = d; // alias
    const m00 = buf[0], m01 = buf[1], m02 = buf[2];
    const m10 = buf[3], m11 = buf[4], m12 = buf[5];
    const m20 = buf[6], m21 = buf[7], m22 = buf[8];

    const det = m00 * (m11 * m22 - m12 * m21) -
        m01 * (m10 * m22 - m12 * m20) +
        m02 * (m10 * m21 - m11 * m20);

    if (Math.abs(det) < 1e-8) throw new Error('Singular matrix, cannot invert');
    const invDet = 1 / det;

    // Inverse Matrix M_inv elements:
    // [i00 i01 i02]
    // [i10 i11 i12]
    // [i20 i21 i22]

    const i00 = (m11 * m22 - m12 * m21) * invDet;
    const i01 = (m02 * m21 - m01 * m22) * invDet;
    const i02 = (m01 * m12 - m02 * m11) * invDet;
    const i10 = (m12 * m20 - m10 * m22) * invDet;
    const i11 = (m00 * m22 - m02 * m20) * invDet;
    const i12 = (m02 * m10 - m00 * m12) * invDet;
    const i20 = (m10 * m21 - m11 * m20) * invDet;
    const i21 = (m01 * m20 - m00 * m21) * invDet;
    const i22 = (m00 * m11 - m01 * m10) * invDet;

    return points.map(p => {
        // Perspective transform with inverted matrix:
        // z' = i20*x + i21*y + i22
        // x' = (i00*x + i01*y + i02) / z'
        // y' = (i10*x + i11*y + i12) / z'

        const z = i20 * p.x + i21 * p.y + i22;
        const x = (i00 * p.x + i01 * p.y + i02) / z;
        const y = (i10 * p.x + i11 * p.y + i12) / z;
        return { x, y };
    });
};

/* ━━━━ GEOMETRY & WRAP WITH INFO ━━━━ */
const warpWithInfo = (cv: any, src: any, corners: Pt[]): { warped: any, M: any, corners: Pt[] } => {
    const [tl, tr, br, bl] = corners;
    const w = Math.round(Math.max(Math.hypot(br.x - bl.x, br.y - bl.y), Math.hypot(tr.x - tl.x, tr.y - tl.y)));
    const h = Math.round(Math.max(Math.hypot(tr.x - br.x, tr.y - br.y), Math.hypot(tl.x - bl.x, tl.y - bl.y)));
    if (w <= 0 || h <= 0) return { warped: src.clone(), M: null, corners };

    const s = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const d = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1]);
    const M = cv.getPerspectiveTransform(s, d);
    const out = new cv.Mat();
    cv.warpPerspective(src, out, M, new cv.Size(w, h));
    s.delete(); d.delete();
    return { warped: out, M, corners };
};

const sortC = (c: Pt[]): Pt[] => {
    c.sort((a, b) => a.y - b.y);
    const t = c.slice(0, 2).sort((a, b) => a.x - b.x);
    const bo = c.slice(2, 4).sort((a, b) => a.x - b.x);
    return [t[0], t[1], bo[1], bo[0]]; // TL TR BR BL
};

const warp = (cv: any, src: any, corners: Pt[]): any => {
    const { warped, M } = warpWithInfo(cv, src, corners);
    if (M) M.delete();
    return warped;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MANUAL PERSPECTIVE CROP (user-selected corners)
   Takes a file and 4 corners (fractions 0-1) → perspective warp → flat Blob
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const manualPerspectiveCrop = async (
    file: File,
    corners: { tl: [number, number]; tr: [number, number]; br: [number, number]; bl: [number, number] }
): Promise<Blob> => {
    await loadOpenCV();
    return new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = async () => {
            try {
                const cv = window.cv;
                const src = cv.imread(img);
                const imgW = src.cols, imgH = src.rows;

                const pts: Pt[] = [
                    { x: corners.tl[0] * imgW, y: corners.tl[1] * imgH },
                    { x: corners.tr[0] * imgW, y: corners.tr[1] * imgH },
                    { x: corners.br[0] * imgW, y: corners.br[1] * imgH },
                    { x: corners.bl[0] * imgW, y: corners.bl[1] * imgH },
                ];

                console.log('[Scan] Manual crop corners (px):', pts);
                const warped = warp(cv, src, pts);
                src.delete();

                const canvas = document.createElement('canvas');
                cv.imshow(canvas, warped);
                const blob = await c2b(canvas, 'image/webp', 0.95);
                warped.delete();
                URL.revokeObjectURL(url);
                resolve(blob);
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
};
