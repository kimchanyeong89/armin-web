import { artistFileKey, artistFileName, artistShardOf } from './artistKey.js';
import { getCanonicalName } from './canonicalArtist';

/**
 * An artist's works as the build ships them (scripts/build-artist-pages.mjs):
 * a file of their own when they have ten or more, otherwise their entry in one
 * of the 512 shared shard files. Every artist with at least one work is in one
 * or the other, so a page and a card can always count and show them — the
 * same numbers the full search index gives once it has loaded.
 */
export type StaticArtwork = {
    id: string;
    /** title */
    n?: string;
    /** artist as catalogued */
    a?: string;
    /** image */
    i?: string;
    /** date */
    d?: string;
    /** museum */
    m?: string;
    /** collection */
    e?: string;
    /** category */
    c?: string;
};

export const artistKeyOf = (name?: string | null): string =>
    name ? artistFileKey(getCanonicalName(name) || name) : '';

const byArtist = new Map<string, Promise<StaticArtwork[]>>();
const byShard = new Map<string, Promise<Record<string, StaticArtwork[]> | null>>();

const getJson = <T,>(url: string): Promise<T | null> =>
    fetch(url)
        .then((response) => (response.ok ? response.json() : null))
        /* a missing file in the dev server comes back as the app's HTML page */
        .catch(() => null);

export function loadArtistWorks(name?: string | null): Promise<StaticArtwork[]> {
    const key = artistKeyOf(name);
    if (!key) return Promise.resolve([]);
    let pending = byArtist.get(key);
    if (!pending) {
        pending = (async () => {
            const own = await getJson<StaticArtwork[]>(`/artists/${artistFileName(key)}.json`);
            if (Array.isArray(own)) return own;
            const shardId = artistShardOf(key);
            let shard = byShard.get(shardId);
            if (!shard) {
                shard = getJson<Record<string, StaticArtwork[]>>(`/artists/shards/${shardId}.json`);
                byShard.set(shardId, shard);
            }
            const works = (await shard)?.[key];
            return Array.isArray(works) ? works : [];
        })();
        byArtist.set(key, pending);
    }
    return pending;
}

/**
 * The Korean description built ahead of time (scripts/build-artist-bios-ko.mjs):
 * the Korean Wikipedia article's own text where there is one, otherwise the
 * English article put into Korean. `s` is the article it came from.
 */
export type ArtistBio = { t: string; s: string; o: 'ko' | 'en' };

const bioShards = new Map<string, Promise<Record<string, ArtistBio> | null>>();

export async function loadArtistBio(name?: string | null): Promise<ArtistBio | null> {
    const key = artistKeyOf(name);
    if (!key) return null;
    const shardId = artistShardOf(key);
    let shard = bioShards.get(shardId);
    if (!shard) {
        shard = getJson<Record<string, ArtistBio>>(`/data/artist-bios/${shardId}.json`);
        bioShards.set(shardId, shard);
    }
    const bio = (await shard)?.[key];
    return bio?.t ? bio : null;
}

/**
 * Born and died, for the line under an artist's name
 * (scripts/build-artist-life.mjs). One small file for every artist who has
 * dates, rather than the 6 MB artists-dates.json the onboarding reads.
 */
export type ArtistLife = [born: number, died: number];

let lifeFile: Promise<Record<string, ArtistLife> | null> | null = null;

export function loadArtistLife(name?: string | null): Promise<ArtistLife | null> {
    const key = artistKeyOf(name);
    if (!key) return Promise.resolve(null);
    if (!lifeFile) lifeFile = getJson<Record<string, ArtistLife>>('/data/artist-life.json');
    return lifeFile.then((all) => all?.[key] || null);
}
