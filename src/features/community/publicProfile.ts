import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../../firebase";
import type { ProfileImageCrop } from "../../types/Profile";
import { DEFAULT_COMMUNITY_RANK, rankForScore, userActivityScore } from "../../utils/communityRank";

/**
 * A user's public card: the name, photo (with its crop) and level the
 * community shows beside a post or comment. `users/{uid}` can only be read by
 * its owner, so the owner keeps this copy current and anyone may read it.
 */
export interface PublicProfile {
  name?: string;
  photoURL?: string | null;
  photoCrop?: ProfileImageCrop | null;
  rank?: string;
}

const PUBLIC_PROFILES = "public_profiles";

const countOrZero = async (source: Parameters<typeof getCountFromServer>[0]) => {
  try {
    return (await getCountFromServer(source)).data().count;
  } catch {
    return 0;
  }
};

/** A user's posts, on the current board and on the old one. */
export async function readPostCount(uid: string): Promise<number> {
  const [current, legacy] = await Promise.all([
    countOrZero(query(collection(db, "community_posts"), where("authorId", "==", uid))),
    countOrZero(query(collection(db, "community"), where("authorId", "==", uid))),
  ]);
  return current + legacy;
}

/** Likes and posts counted on the server: the score My Page shows. */
export async function readActivityScore(uid: string): Promise<number> {
  const [likedArtworks, likedExhibitions, posts] = await Promise.all([
    countOrZero(collection(db, "users", uid, "liked_artworks")),
    countOrZero(collection(db, "users", uid, "liked_exhibitions")),
    readPostCount(uid),
  ]);
  return userActivityScore({ likedArtworks, likedExhibitions, posts });
}

/** The signed-in user's card as it should read now, from their own profile and score. */
export async function buildPublicProfile(
  user: Pick<User, "uid" | "displayName" | "photoURL">,
  knownScore?: number,
): Promise<PublicProfile> {
  const [snap, score] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    knownScore ?? readActivityScore(user.uid),
  ]);
  const data: Record<string, any> = snap.exists() ? snap.data() : {};
  const custom = typeof data.photoURL === "string" && data.photoURL ? data.photoURL : null;
  return {
    name: data.nickname || user.displayName || "",
    photoURL: custom || user.photoURL || null,
    photoCrop: custom ? data.profileImageCrop || null : null,
    rank: rankForScore(score),
  };
}

const lastWritten = new Map<string, string>();

/** Rebuild the card and store it when it changed; returns the card even if storing fails. */
export async function syncPublicProfile(
  user: Pick<User, "uid" | "displayName" | "photoURL">,
  knownScore?: number,
): Promise<PublicProfile> {
  const card = await buildPublicProfile(user, knownScore);
  const key = JSON.stringify(card);
  if (lastWritten.get(user.uid) !== key) {
    try {
      await setDoc(doc(db, PUBLIC_PROFILES, user.uid), { ...card, updatedAt: serverTimestamp() }, { merge: true });
      lastWritten.set(user.uid, key);
    } catch {
      /* the stored card stays as it was; every post still carries its own copy */
    }
  }
  return card;
}

/** Live cards for these users; a user without a readable card is simply absent. */
export function usePublicProfiles(uids: ReadonlyArray<string | null | undefined>): Record<string, PublicProfile> {
  const key = Array.from(new Set(uids.filter((uid): uid is string => !!uid))).sort().join("|");
  const [cards, setCards] = useState<Record<string, PublicProfile>>({});
  useEffect(() => {
    if (!key) return;
    const stops = key.split("|").map((uid) =>
      onSnapshot(
        doc(db, PUBLIC_PROFILES, uid),
        (snap) => {
          if (!snap.exists()) return;
          const card = snap.data() as PublicProfile;
          setCards((prev) => ({ ...prev, [uid]: card }));
        },
        () => {
          /* not readable: the author the post stored stays */
        },
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [key]);
  return cards;
}

/** Who to show beside a post or comment: the live card where there is one, else what was stored. */
export function shownAuthor(
  card: PublicProfile | undefined,
  stored: { name?: string; photo?: string | null; rank?: string },
): { name: string; photo: string | null; crop: ProfileImageCrop | null; rank: string } {
  if (!card) return { name: stored.name || "", photo: stored.photo ?? null, crop: null, rank: stored.rank || "" };
  return {
    name: card.name || stored.name || "",
    photo: card.photoURL ?? null,
    crop: card.photoCrop ?? null,
    rank: card.rank || stored.rank || "",
  };
}

/** The author a new post or comment stores: the writer's card, else their sign-in profile. */
export function storedAuthor(
  card: PublicProfile | null,
  user: Pick<User, "displayName" | "photoURL">,
): { authorName: string; authorPhotoURL: string | null; authorRank: string } {
  return {
    authorName: card?.name || user.displayName || "Anonymous",
    authorPhotoURL: card ? card.photoURL ?? null : user.photoURL || null,
    authorRank: card?.rank || DEFAULT_COMMUNITY_RANK,
  };
}
