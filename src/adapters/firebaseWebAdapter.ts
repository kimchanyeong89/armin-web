import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import type { AppUserProfile, UserProfilePatch } from "../../packages/shared/src/types/Profile";
import type { FirebasePort } from "../../packages/shared/src/firebase";

function sanitizeDocId(value: string): string {
  return String(value).replace(/\//g, "__");
}

export function createFirebaseWebPort(): FirebasePort {
  const db = getFirestore();

  return {
    profile: {
      async getUserProfile(uid: string): Promise<AppUserProfile | null> {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() ? (snap.data() as AppUserProfile) : null;
      },
      async upsertUserProfile(uid: string, patch: UserProfilePatch): Promise<void> {
        await setDoc(doc(db, "users", uid), patch, { merge: true });
      },
      observeUserProfile(uid, onChange, onError) {
        return onSnapshot(
          doc(db, "users", uid),
          (snap) => {
            onChange(snap.exists() ? (snap.data() as AppUserProfile) : null);
          },
          (error) => {
            if (onError) onError(error);
          },
        );
      },
    },
    likes: {
      async listLikedArtworkIds(uid: string): Promise<string[]> {
        const snap = await getDocs(collection(db, `users/${uid}/liked_artworks`));
        return snap.docs.map((d) => d.id);
      },
      async setLikedArtwork(uid: string, artworkId: string, payload: Record<string, unknown>): Promise<void> {
        await setDoc(doc(db, `users/${uid}/liked_artworks/${sanitizeDocId(artworkId)}`), payload, { merge: true });
      },
      async removeLikedArtwork(uid: string, artworkId: string): Promise<void> {
        await deleteDoc(doc(db, `users/${uid}/liked_artworks/${sanitizeDocId(artworkId)}`));
      },
      async listLikedMuseumIds(uid: string): Promise<string[]> {
        const snap = await getDocs(collection(db, `users/${uid}/liked_museums`));
        return snap.docs.map((d) => d.id);
      },
      async setLikedMuseum(uid: string, museumId: string, payload: Record<string, unknown>): Promise<void> {
        await setDoc(doc(db, `users/${uid}/liked_museums/${sanitizeDocId(museumId)}`), payload, { merge: true });
      },
      async removeLikedMuseum(uid: string, museumId: string): Promise<void> {
        await deleteDoc(doc(db, `users/${uid}/liked_museums/${sanitizeDocId(museumId)}`));
      },
      async listLikedExhibitionIds(uid: string): Promise<string[]> {
        const snap = await getDocs(collection(db, `users/${uid}/liked_exhibitions`));
        return snap.docs.map((d) => d.id);
      },
      async setLikedExhibition(uid: string, exhibitionId: string, payload: Record<string, unknown>): Promise<void> {
        await setDoc(doc(db, `users/${uid}/liked_exhibitions/${sanitizeDocId(exhibitionId)}`), payload, { merge: true });
      },
      async removeLikedExhibition(uid: string, exhibitionId: string): Promise<void> {
        await deleteDoc(doc(db, `users/${uid}/liked_exhibitions/${sanitizeDocId(exhibitionId)}`));
      },
    },
  };
}
