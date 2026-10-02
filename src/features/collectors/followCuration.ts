import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Following a curation, not a person: someone's liked works shown as one
 * collection, or one of their shared playlists. Kept on the follower's own
 * record, users/{uid}/followed_curations/{key}; only they read or write it.
 */
export type CurationKind = "likes" | "playlist";

export interface CurationRef {
  kind: CurationKind;
  ownerUid: string;
  /** a playlist's id; the likes collection has none */
  playlistId?: string;
  title: string;
}

export const curationKey = (ref: Pick<CurationRef, "kind" | "ownerUid" | "playlistId">) =>
  ref.kind === "likes" ? `likes__${ref.ownerUid}` : `playlist__${ref.playlistId}`;

const followedRef = (uid: string) => collection(db, "users", uid, "followed_curations");

/** The keys of the curations the reader follows, kept live; empty when signed out. */
export function useFollowedCurations(uid: string | null | undefined): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!uid) {
      setKeys(new Set());
      return;
    }
    return onSnapshot(
      followedRef(uid),
      (snap) => setKeys(new Set(snap.docs.map((d) => d.id))),
      () => setKeys(new Set()),
    );
  }, [uid]);
  return keys;
}

export async function followCuration(uid: string, ref: CurationRef): Promise<void> {
  await setDoc(doc(followedRef(uid), curationKey(ref)), {
    kind: ref.kind,
    ownerUid: ref.ownerUid,
    playlistId: ref.playlistId ?? null,
    title: ref.title,
    followedAt: serverTimestamp(),
  });
}

export async function unfollowCuration(uid: string, ref: Pick<CurationRef, "kind" | "ownerUid" | "playlistId">): Promise<void> {
  await deleteDoc(doc(followedRef(uid), curationKey(ref)));
}
