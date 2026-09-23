/*
 * Taste math shared by the semantic-search worker and the script that builds the
 * data it scores against (scripts/taste/build-taste-data.mjs). It uses no Worker
 * globals, so Node imports this file as is and every formula lives in one place.
 *
 * Every vector is a SigLIP image embedding: 768 numbers, L2-normalised, so a dot
 * product is the cosine similarity.
 *
 * The constants were calibrated on 2026-09-15 against synthetic tastes (four focused
 * ones, noisy copies of them and random like sets) over the whole local corpus.
 */

export const DIM = 768;

/** Neighbour artworks per exhibition that decide its score (the closest ones). */
export const NEIGHBOR_TOP = 6;

/**
 * How much a taste centroid is discounted when it stands for fewer likes than an
 * even split would give it: score + penalty·ln(k·weight). A lone odd like then
 * cannot carry an exhibition on its own; a genuine second taste still can.
 */
export const SMALL_CLUSTER_PENALTY = 0.02;

/**
 * The lift over the user's average exhibition that reads as 84%. It is fixed, not
 * measured per user: measured, random likes looked as sure of their best exhibition
 * (94%) as a real taste; fixed, they stay near 80% while a real taste reaches 95–99%.
 */
export const EXHIBITION_LIFT_WIDTH = 0.05;

/** Likes at which a score keeps half its distance from neutral (50%, or 1×). One like is not a taste yet. */
export const LIKES_FOR_HALF_CONFIDENCE = 4;

/** The slice of all artworks that counts as a user's taste when a collection is measured against it. */
export const TASTE_TOP_SHARE = 0.05;

/** Prototypes kept per museum collection, and the fewest artworks with vectors a museum needs to be summarised. */
export const MUSEUM_PROTOTYPES = 16;
export const MUSEUM_MIN_ARTWORKS = 48;

/** Softness of the "inside the user's top 5%" test for one prototype. */
export const MUSEUM_SHARE_WIDTH = 0.04;

/** A museum is recommended from this many times its share of the user's taste, at most MUSEUM_MATCH_MAX of them. */
export const MUSEUM_MATCH_MIN_LIFT = 2;
export const MUSEUM_MATCH_MAX = 10;

export interface TasteCentroids {
    centroids: Float32Array[];
    /** Share of the likes behind each centroid; sums to 1. */
    weights: number[];
}

export function normalize(v: Float32Array): Float32Array {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    const n = Math.sqrt(s) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
}

/** Dot product of `a` with the vector that starts at `offset` inside `b`. */
export function dotAt(a: Float32Array, b: Float32Array, offset: number): number {
    let s = 0;
    for (let i = 0; i < DIM; i++) s += a[i] * b[offset + i];
    return s;
}

/**
 * K-means on the unit sphere. Seeds are chosen farthest-point from the first
 * vector, so the same likes in the same order always give the same clusters: a
 * profile rebuilt from unchanged likes does not shuffle anyone's scores.
 */
export function kMeans(vectors: Float32Array[], k: number, maxIter = 40): TasteCentroids {
    const n = vectors.length;
    k = Math.max(0, Math.min(k, n));
    if (k === 0) return { centroids: [], weights: [] };

    const centroids: Float32Array[] = [Float32Array.from(vectors[0])];
    const nearest = new Float32Array(n).fill(-2);
    while (centroids.length < k) {
        const last = centroids[centroids.length - 1];
        let far = 0;
        let farSim = 2;
        for (let i = 0; i < n; i++) {
            const s = dotAt(last, vectors[i], 0);
            if (s > nearest[i]) nearest[i] = s;
            if (nearest[i] < farSim) {
                farSim = nearest[i];
                far = i;
            }
        }
        centroids.push(Float32Array.from(vectors[far]));
    }

    const assign = new Int32Array(n).fill(-1);
    const counts = new Array<number>(k).fill(0);
    for (let iter = 0; iter < maxIter; iter++) {
        let changed = 0;
        counts.fill(0);
        const sums = centroids.map(() => new Float32Array(DIM));
        for (let i = 0; i < n; i++) {
            let best = 0;
            let bestSim = -2;
            for (let c = 0; c < k; c++) {
                const s = dotAt(centroids[c], vectors[i], 0);
                if (s > bestSim) {
                    bestSim = s;
                    best = c;
                }
            }
            if (assign[i] !== best) {
                assign[i] = best;
                changed++;
            }
            counts[best]++;
            const sum = sums[best];
            const v = vectors[i];
            for (let d = 0; d < DIM; d++) sum[d] += v[d];
        }
        for (let c = 0; c < k; c++) if (counts[c] > 0) centroids[c] = normalize(sums[c]);
        if (changed === 0) break;
    }

    const kept = centroids.map((c, i) => ({ c, w: counts[i] / n })).filter((x) => x.w > 0);
    return { centroids: kept.map((x) => x.c), weights: kept.map((x) => x.w) };
}

/** How close one vector is to a taste: its best centroid, discounted when that centroid stands for few likes. */
export function affinity(
    taste: TasteCentroids,
    packed: Float32Array,
    offset: number,
    penalty: number = SMALL_CLUSTER_PENALTY,
): number {
    const k = taste.centroids.length;
    let best = -2;
    for (let c = 0; c < k; c++) {
        const share = Math.min(1, (taste.weights[c] ?? 1 / k) * k);
        const s = dotAt(taste.centroids[c], packed, offset) + penalty * Math.log(share);
        if (s > best) best = s;
    }
    return best;
}

/** An exhibition's raw score: the mean affinity of its closest neighbour artworks. */
export function exhibitionRaw(
    taste: TasteCentroids,
    packed: Float32Array,
    start: number,
    count: number,
    penalty: number = SMALL_CLUSTER_PENALTY,
): number {
    const sims: number[] = [];
    for (let j = 0; j < count; j++) sims.push(affinity(taste, packed, (start + j) * DIM, penalty));
    sims.sort((a, b) => b - a);
    const top = sims.slice(0, Math.min(NEIGHBOR_TOP, sims.length));
    return top.length ? top.reduce((s, x) => s + x, 0) / top.length : 0;
}

/** How far a score may move from neutral with this many likes: n / (n + LIKES_FOR_HALF_CONFIDENCE). */
export function confidence(likedCount: number): number {
    return likedCount / (likedCount + LIKES_FOR_HALF_CONFIDENCE);
}

/** The prototypes that stand for one collection: where its artworks cluster, what share sits at each, and how tightly. */
export function summarizeCollection(vectors: Float32Array[]): TasteCentroids & { tight: number[] } {
    const { centroids, weights } = kMeans(vectors, Math.max(1, Math.min(MUSEUM_PROTOTYPES, Math.ceil(vectors.length / 8))));
    const sums = new Array<number>(centroids.length).fill(0);
    const counts = new Array<number>(centroids.length).fill(0);
    for (const v of vectors) {
        let best = 0;
        let bestSim = -2;
        for (let c = 0; c < centroids.length; c++) {
            const s = dotAt(centroids[c], v, 0);
            if (s > bestSim) {
                bestSim = s;
                best = c;
            }
        }
        sums[best] += bestSim;
        counts[best]++;
    }
    return { centroids, weights, tight: sums.map((s, c) => (counts[c] ? s / counts[c] : 1)) };
}

// ── the data the build script stores and the worker scores against ───────────

/** Today's exhibitions. Each item's neighbour artworks follow the previous item's in `vectors`. */
export interface ExhibitionBundle {
    version: string;
    /** `base` is the item's raw score against the whole corpus, so generic neighbours do not lift every taste. */
    items: { id: string; count: number; base: number }[];
    vectors: PackedVectors;
}

/** Permanent collections as prototypes, plus a random sample of all artworks for each user's top-5% line. */
export interface MuseumBundle {
    version: string;
    museums: { id: string; weights: number[]; tight: number[] }[];
    vectors: PackedVectors;
    sample: PackedVectors;
}

export interface OpenExhibitions {
    version: string;
    items: ExhibitionBundle['items'];
    starts: number[];
    vectors: Float32Array;
}

export interface OpenMuseums {
    version: string;
    museums: MuseumBundle['museums'];
    starts: number[];
    vectors: Float32Array;
    sample: Float32Array;
}

/** Unpacks a bundle once so every request can score against it; throws when it does not hold together. */
export function openExhibitions(bundle: ExhibitionBundle): OpenExhibitions {
    const vectors = unpackInt8(bundle.vectors);
    const starts = groupStarts(bundle.items.map((item) => item.count), vectors.length / DIM);
    return { version: bundle.version, items: bundle.items, starts, vectors };
}

export function openMuseums(bundle: MuseumBundle): OpenMuseums {
    const vectors = unpackInt8(bundle.vectors);
    const starts = groupStarts(bundle.museums.map((m) => m.weights.length), vectors.length / DIM);
    if (bundle.museums.some((m) => m.tight.length !== m.weights.length)) throw new Error('museum tight/weights lengths differ');
    return { version: bundle.version, museums: bundle.museums, starts, vectors, sample: unpackInt8(bundle.sample) };
}

function groupStarts(counts: number[], total: number): number[] {
    const starts: number[] = [];
    let at = 0;
    for (const count of counts) {
        starts.push(at);
        at += count;
    }
    if (at !== total) throw new Error(`bundle holds ${total} vectors but its groups add up to ${at}`);
    return starts;
}

// ── scores ────────────────────────────────────────────────────────────────────

/** 1–99 per exhibition, in item order: 50 is a typical exhibition for this user, higher stands out. */
export function exhibitionPercents(taste: TasteCentroids, likedCount: number, data: OpenExhibitions): number[] {
    const lifts = data.items.map((item, i) => exhibitionRaw(taste, data.vectors, data.starts[i], item.count) - item.base);
    if (!lifts.length) return [];
    const mean = lifts.reduce((s, x) => s + x, 0) / lifts.length;
    const scale = confidence(likedCount) / EXHIBITION_LIFT_WIDTH;
    return lifts.map((x) => Math.round(Math.min(99, Math.max(1, 100 * normalCdf((x - mean) * scale)))));
}

/** The affinity above which the user's top TASTE_TOP_SHARE of all artworks lies, read off the corpus sample. */
export function tasteTopLine(taste: TasteCentroids, sample: Float32Array): number {
    const n = sample.length / DIM;
    const scores = new Float32Array(n);
    for (let i = 0; i < n; i++) scores[i] = affinity(taste, sample, i * DIM);
    scores.sort();
    return scores[Math.min(n - 1, Math.floor(n * (1 - TASTE_TOP_SHARE)))];
}

/**
 * How many times its share of the user's taste a museum holds: the part of its collection
 * above the user's top-5% line, over 5%. A prototype's affinity is scaled by how tightly
 * its artworks sit around it, which is about what one of those artworks would score.
 */
export function museumLift(taste: TasteCentroids, data: OpenMuseums, index: number, topLine: number): number {
    const museum = data.museums[index];
    let share = 0;
    for (let p = 0; p < museum.weights.length; p++) {
        const typical = museum.tight[p] * affinity(taste, data.vectors, (data.starts[index] + p) * DIM);
        share += museum.weights[p] * normalCdf((typical - topLine) / MUSEUM_SHARE_WIDTH);
    }
    return share / TASTE_TOP_SHARE;
}

/** The museums to recommend, best first; with few likes each lift is pulled toward 1×. */
export function museumMatches(taste: TasteCentroids, likedCount: number, data: OpenMuseums): { id: string; lift: number }[] {
    if (!data.museums.length) return [];
    const topLine = tasteTopLine(taste, data.sample);
    const c = confidence(likedCount);
    return data.museums
        .map((museum, i) => ({ id: museum.id, lift: Math.pow(museumLift(taste, data, i, topLine), c) }))
        .filter((m) => m.lift >= MUSEUM_MATCH_MIN_LIFT)
        .sort((a, b) => b.lift - a.lift)
        .slice(0, MUSEUM_MATCH_MAX)
        .map((m) => ({ id: m.id, lift: Math.round(m.lift * 10) / 10 }));
}

function normalCdf(z: number): number {
    return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Abramowitz & Stegun 7.1.26 — accurate to 1.5e-7, plenty for a percentage.
function erf(x: number): number {
    const sign = Math.sign(x);
    const a = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * a);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
    return sign * y;
}

// ── compact storage: one signed byte per number, one scale per vector ─────────

export interface PackedVectors {
    /** One multiplier per vector, in order. */
    scales: number[];
    /** base64 of DIM int8 values per vector. */
    vectors: string;
}

export function packInt8(vectors: Float32Array[]): PackedVectors {
    const bytes = new Int8Array(vectors.length * DIM);
    const scales: number[] = [];
    vectors.forEach((v, i) => {
        let max = 0;
        for (let d = 0; d < DIM; d++) max = Math.max(max, Math.abs(v[d]));
        const scale = max / 127 || 1;
        scales.push(Number(scale.toPrecision(7)));
        for (let d = 0; d < DIM; d++) bytes[i * DIM + d] = Math.round(v[d] / scale);
    });
    return { scales, vectors: toBase64(new Uint8Array(bytes.buffer)) };
}

/** Back to one Float32Array holding every vector, each re-normalised. */
export function unpackInt8(packed: PackedVectors): Float32Array {
    const raw = fromBase64(packed.vectors);
    const bytes = new Int8Array(raw.buffer, raw.byteOffset, raw.length);
    if (bytes.length !== packed.scales.length * DIM) throw new Error(`packed vectors: ${bytes.length} bytes for ${packed.scales.length} scales`);
    const out = new Float32Array(packed.scales.length * DIM);
    for (let i = 0; i < packed.scales.length; i++) {
        const scale = packed.scales[i];
        let s = 0;
        for (let d = 0; d < DIM; d++) {
            const x = bytes[i * DIM + d] * scale;
            out[i * DIM + d] = x;
            s += x * x;
        }
        const n = Math.sqrt(s) || 1;
        for (let d = 0; d < DIM; d++) out[i * DIM + d] /= n;
    }
    return out;
}

function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
}
