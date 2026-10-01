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
  type DocumentData,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { PublicProfile } from "../community/publicProfile";
import { toItem, type SharedPlaylistItem } from "../playlists/sharedPlaylists";

/**
 * Someone's collection — the works they liked and their playlists — as anyone
 * may see it. Nothing is copied: firestore.rules lets everyone read
 * users/{uid}/liked_artworks and users/{uid}/playlists unless the owner set
 * public_profiles/{uid}.hidden, so the page always shows the collection as it is.
 */

/** A work as the collection holds it: the fields every view reads, over the stored record. */
export type CollectedWork = SharedPlaylistItem & Record<string, unknown>;

export interface CollectorPlaylist {
  id: string;
  name: string;
  coverImage: string;
  items: CollectedWork[];
}

export interface Collection {
  card: (PublicProfile & { hidden?: boolean }) | null;
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
  return snap.exists() ? (snap.data() as PublicProfile & { hidden?: boolean }) : null;
};

/** One person's collection. A hidden one comes back empty unless the reader is its owner. */
export async function readCollection(uid: string, readerUid?: string | null): Promise<Collection> {
  const card = await readCard(uid);
  const hidden = card?.hidden === true;
  if (hidden && readerUid !== uid) return { card, hidden, likes: [], playlists: [] };

  const [likeSnap, listSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "liked_artworks")),
    getDocs(collection(db, "users", uid, "playlists")),
  ]);
  const likes = [...likeSnap.docs].sort(newestFirst("likedAt")).map((d) => work(d.id, d.data()));
  const playlists = await Promise.all(
    [...listSnap.docs].sort(newestFirst("createdAt")).map(async (d) => {
      const items = await getDocs(collection(db, "users", uid, "playlists", d.id, "items"));
      /* a playlist may also hold exhibitions, museums or artists; the collection shows its works */
      const works = [...items.docs]
        .filter((item) => (item.data().itemType ?? "artwork") === "artwork")
        .sort(newestFirst("addedAt"))
        .map((item) => work(item.id, item.data()));
      const data = d.data();
      return { id: d.id, name: String(data.name || ""), coverImage: String(data.coverImage || works[0]?.image || ""), items: works };
    }),
  );
  return { card, hidden, likes, playlists };
}

/** People with a public collection, whoever liked a work most recently first. */
export async function listCollectors(max = 36): Promise<Collector[]> {
  const cards = await getDocs(query(collection(db, "public_profiles"), orderBy("updatedAt", "desc"), limit(max)));
  const found = await Promise.all(
    cards.docs
      .filter((d) => d.data().hidden !== true)
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

/** Hides the signed-in user's collection from everyone else, or shows it again. */
export async function setCollectionHidden(uid: string, hidden: boolean): Promise<void> {
  await setDoc(doc(db, "public_profiles", uid), { hidden }, { merge: true });
}
