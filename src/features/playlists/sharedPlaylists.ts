import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Shared playlists. `users/{uid}` and everything under it can only be read by
 * its owner, so sharing a playlist writes a public copy — its name, cover and
 * works — to `public_playlists/{playlistId}`, where anyone with the link and
 * the community's playlist shelf read it. The copy is derived from the owner's
 * playlist and can be rebuilt from it at any time.
 */
export interface SharedPlaylistItem {
  id: string;
  title: string;
  artist: string;
  image: string;
  museumName: string;
  year: string;
}

export interface SharedPlaylist {
  id: string;
  ownerUid: string;
  name: string;
  coverImage: string;
  itemCount: number;
  items: SharedPlaylistItem[];
  updatedAt: Date | null;
}

const PUBLIC_PLAYLISTS = "public_playlists";
/** the works a public copy carries; its count still says how many the playlist holds */
export const SHARED_ITEM_LIMIT = 300;

const ownRef = (uid: string, playlistId: string) => doc(db, "users", uid, "playlists", playlistId);
const publicRef = (playlistId: string) => doc(db, PUBLIC_PLAYLISTS, playlistId);

export const sharedPlaylistPath = (playlistId: string) => `/community/playlist/${encodeURIComponent(playlistId)}`;
export const sharedPlaylistUrl = (playlistId: string) => `${window.location.origin}${sharedPlaylistPath(playlistId)}`;

const millis = (value: any) => (typeof value?.toMillis === "function" ? value.toMillis() : 0);

const toItem = (docId: string, data: DocumentData): SharedPlaylistItem => ({
  id: String(data.artworkId || data.id || docId),
  title: String(data.title || data.name || "Untitled"),
  artist: String(data.artist || ""),
  image: String(data.image || data.imageUrl || data.thumbnail?.url || ""),
  museumName: String(data.museumName || data.museum || ""),
  year: data.year == null ? "" : String(data.year),
});

/** JSON with object keys in order, so two copies compare equal however their fields were ordered. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

/** Writes the public copy from the playlist as it stands — the newest work first — and skips the write when nothing shown changed. */
async function writePublicCopy(uid: string, playlistId: string, own: DocumentData): Promise<void> {
  const snap = await getDocs(collection(db, "users", uid, "playlists", playlistId, "items"));
  const items = [...snap.docs]
    .sort((a, b) => millis(b.data().addedAt) - millis(a.data().addedAt))
    .map((d) => toItem(d.id, d.data()));
  const copy = {
    ownerUid: uid,
    name: String(own.name || ""),
    coverImage: String(own.coverImage || items[0]?.image || ""),
    itemCount: items.length,
    items: items.slice(0, SHARED_ITEM_LIMIT),
  };
  const current = await getDoc(publicRef(playlistId));
  if (current.exists()) {
    const d = current.data();
    const shown = { ownerUid: d.ownerUid, name: d.name, coverImage: d.coverImage, itemCount: d.itemCount, items: d.items };
    if (stable(shown) === stable(copy)) return;
  }
  await setDoc(publicRef(playlistId), { ...copy, updatedAt: serverTimestamp() });
}

/** Makes a playlist public: the copy is written first, so a refused write leaves the playlist private. */
export async function sharePlaylist(uid: string, playlistId: string): Promise<void> {
  const own = await getDoc(ownRef(uid, playlistId));
  if (!own.exists()) throw new Error("playlist-missing");
  await writePublicCopy(uid, playlistId, own.data());
  await setDoc(ownRef(uid, playlistId), { shared: true }, { merge: true });
}

/** Makes a playlist private again: the public copy goes first, then the mark. */
export async function unsharePlaylist(uid: string, playlistId: string): Promise<void> {
  await deleteDoc(publicRef(playlistId));
  await setDoc(ownRef(uid, playlistId), { shared: false }, { merge: true });
}

/** Brings a shared playlist's public copy up to date after its works change; a private playlist is left alone. */
export async function refreshSharedPlaylist(uid: string, playlistId: string): Promise<void> {
  const own = await getDoc(ownRef(uid, playlistId));
  if (!own.exists() || own.data().shared !== true) return;
  await writePublicCopy(uid, playlistId, own.data());
}

const fromDoc = (id: string, data: DocumentData): SharedPlaylist => ({
  id,
  ownerUid: String(data.ownerUid || ""),
  name: String(data.name || ""),
  coverImage: String(data.coverImage || ""),
  itemCount: Number(data.itemCount || 0),
  items: Array.isArray(data.items) ? data.items : [],
  updatedAt: typeof data.updatedAt?.toDate === "function" ? data.updatedAt.toDate() : null,
});

/** One public playlist, or null when it is private or gone. */
export async function readSharedPlaylist(playlistId: string): Promise<SharedPlaylist | null> {
  const snap = await getDoc(publicRef(playlistId));
  return snap.exists() ? fromDoc(snap.id, snap.data()) : null;
}

/** The public playlists, the most recently changed first. */
export async function listSharedPlaylists(max = 48): Promise<SharedPlaylist[]> {
  const snap = await getDocs(query(collection(db, PUBLIC_PLAYLISTS), orderBy("updatedAt", "desc"), limit(max)));
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

/** Copies a link; false when the browser refuses. */
export async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
