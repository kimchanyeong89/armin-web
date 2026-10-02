import { useEffect, useMemo, useState } from "react";
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

/** The curations the reader follows, newest follow first, kept live; empty when signed out. */
export function useFollowedCurationList(uid: string | null | undefined): (CurationRef & { key: string })[] {
  const [list, setList] = useState<(CurationRef & { key: string })[]>([]);
  useEffect(() => {
    if (!uid) {
      setList([]);
      return;
    }
    return onSnapshot(
      followedRef(uid),
      (snap) => setList(
        [...snap.docs]
          .sort((a, b) => (b.data().followedAt?.toMillis?.() ?? Date.now()) - (a.data().followedAt?.toMillis?.() ?? Date.now()))
          .map((d) => {
            const data = d.data();
            return { key: d.id, kind: data.kind, ownerUid: data.ownerUid, playlistId: data.playlistId ?? undefined, title: String(data.title || "") };
          }),
      ),
      () => setList([]),
    );
  }, [uid]);
  return list;
}

/** The keys of the curations the reader follows, kept live; empty when signed out. */
export function useFollowedCurations(uid: string | null | undefined): Set<string> {
  const list = useFollowedCurationList(uid);
  return useMemo(() => new Set(list.map((c) => c.key)), [list]);
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
