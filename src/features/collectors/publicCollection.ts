import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { PublicProfile } from "../community/publicProfile";
import { toItem, type SharedPlaylistItem } from "../playlists/sharedPlaylists";

/**
 * Someone's curation — the works they liked and their playlists — as far as
 * they chose to show it. Nothing is public by default (10/1):
 * - the liked works open when the owner turns on public_profiles/{uid}.likesPublic
 *   (firestore.rules likesShown); they are read live, never copied;
 * - a playlist opens on its own when the owner shares it, and others read its
 *   public copy (public_playlists, sharedPlaylists.ts).
 */

/** A work as the collection holds it: the fields every view reads, over the stored record. */
export type CollectedWork = SharedPlaylistItem & Record<string, unknown>;

export interface CollectorPlaylist {
  id: string;
  name: string;
  coverImage: string;
  items: CollectedWork[];
  /** the owner shared it (it has a public copy) */
  shared?: boolean;
}

export interface Collection {
  card: (PublicProfile & { hidden?: boolean; likesPublic?: boolean }) | null;
  /** the liked works are not on show (the owner has not chosen to show them) */
  hidden: boolean;
  likes: CollectedWork[];
  playlists: CollectorPlaylist[];
}

export interface Collector {
  uid: string;
  card: PublicProfile;
  likeCount: number;
  /** the latest few works, newest first */
  recent: CollectedWork[];
}

export const collectorPath = (uid: string) => `/community/u/${encodeURIComponent(uid)}`;

/* likedAt is a server time on most hearts and a millisecond number on a few */
const when = (value: any): number =>
  typeof value?.toMillis === "function" ? value.toMillis() : typeof value === "number" ? value : 0;

const work = (id: string, data: DocumentData): CollectedWork => ({ ...data, ...toItem(id, data) });

const newestFirst = (field: string) => (a: { data: () => DocumentData }, b: { data: () => DocumentData }) =>
  when(b.data()[field]) - when(a.data()[field]);

const readCard = async (uid: string) => {
  const snap = await getDoc(doc(db, "public_profiles", uid));
  return snap.exists() ? (snap.data() as PublicProfile & { hidden?: boolean; likesPublic?: boolean }) : null;
};

/** whether a card puts its owner's liked works on show */
export const likesOnShow = (card: { hidden?: boolean; likesPublic?: boolean } | null | undefined) =>
  card?.likesPublic === true && card?.hidden !== true;

/** One person's curation as the reader may see it: everything for its owner;
    for anyone else the liked works only when on show, and the shared playlists. */
export async function readCollection(uid: string, readerUid?: string | null): Promise<Collection> {
  const card = await readCard(uid);
  const own = !!readerUid && readerUid === uid;
  const hidden = !likesOnShow(card);

  /* read apart, so one closed side never takes the other down */
  const likes = own || !hidden
    ? await getDocs(collection(db, "users", uid, "liked_artworks"))
      .then((snap) => [...snap.docs].sort(newestFirst("likedAt")).map((d) => work(d.id, d.data())))
      .catch(() => [] as CollectedWork[])
    : [];
  const playlists = own ? await readOwnPlaylists(uid).catch(() => []) : await readSharedPlaylists(uid).catch(() => []);
  return { card, hidden, likes, playlists };
}

/** The owner's own playlists, every one of them. */
async function readOwnPlaylists(uid: string): Promise<CollectorPlaylist[]> {
  const listSnap = await getDocs(collection(db, "users", uid, "playlists"));
  return Promise.all(
    [...listSnap.docs].sort(newestFirst("createdAt")).map(async (d) => {
      const items = await getDocs(collection(db, "users", uid, "playlists", d.id, "items"));
      /* a playlist may also hold exhibitions, museums or artists; the collection shows its works */
      const works = [...items.docs]
        .filter((item) => (item.data().itemType ?? "artwork") === "artwork")
        .sort(newestFirst("addedAt"))
        .map((item) => work(item.id, item.data()));
      const data = d.data();
      return { id: d.id, name: String(data.name || ""), coverImage: String(data.coverImage || works[0]?.image || ""), items: works, shared: data.shared === true };
    }),
  );
}

/** Someone else's playlists: the ones they shared, from their public copies. */
async function readSharedPlaylists(uid: string): Promise<CollectorPlaylist[]> {
  const snap = await getDocs(query(collection(db, "public_playlists"), where("ownerUid", "==", uid)));
  return [...snap.docs].sort(newestFirst("updatedAt")).map((d) => {
    const data = d.data();
    const items = (Array.isArray(data.items) ? data.items : []).map((item: DocumentData) => ({ ...item, ...toItem(String(item.id || ""), item) }));
    return { id: d.id, name: String(data.name || ""), coverImage: String(data.coverImage || items[0]?.image || ""), items, shared: true };
  });
}

/** People who put their liked works on show, whoever liked a work most recently first. */
export async function listCollectors(max = 36): Promise<Collector[]> {
  /* one equality, no order: no composite index needed; the order is set below */
  const cards = await getDocs(query(collection(db, "public_profiles"), where("likesPublic", "==", true), limit(max)));
  const found = await Promise.all(
    cards.docs
      .filter((d) => likesOnShow(d.data()))
      .map(async (d): Promise<Collector | null> => {
        const likes = collection(db, "users", d.id, "liked_artworks");
        try {
          const [count, latest] = await Promise.all([
            getCountFromServer(likes),
            getDocs(query(likes, orderBy("likedAt", "desc"), limit(4))),
          ]);
          const likeCount = count.data().count;
          if (likeCount === 0) return null;
          return { uid: d.id, card: d.data() as PublicProfile, likeCount, recent: latest.docs.map((w) => work(w.id, w.data())) };
        } catch {
          return null;
        }
      }),
  );
  const latestAt = (c: Collector) => when(c.recent[0]?.likedAt);
  return found.filter((c): c is Collector => !!c).sort((a, b) => latestAt(b) - latestAt(a));
}

/** Puts the signed-in user's liked works on the Curation page, or takes them off. */
export async function setLikesPublic(uid: string, on: boolean): Promise<void> {
  await setDoc(doc(db, "public_profiles", uid), { likesPublic: on, hidden: !on }, { merge: true });
}

/** Whether the signed-in user's liked works are on show. */
export async function readLikesPublic(uid: string): Promise<boolean> {
  return likesOnShow(await readCard(uid));
}
