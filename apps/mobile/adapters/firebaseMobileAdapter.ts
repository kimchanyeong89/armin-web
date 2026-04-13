import type { FirebasePort } from "@armin/shared/firebase";
import type { AppUserProfile, UserProfilePatch } from "@armin/shared/types/Profile";
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
import { getMobileFirebaseApp } from "../src/firebase";

function sanitizeDocId(value: string): string {
  return String(value).replace(/\//g, "__");
}

function restoreArtworkIdFromDocId(value: string): string {
  return String(value).replace(/__/g, "/");
}

export function createFirebaseMobilePort(): FirebasePort {
  const db = getFirestore(getMobileFirebaseApp());

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
        return snap.docs
          .map((d) => {
            const raw = d.data()?.artworkId;
            if (typeof raw === "string" && raw.trim().length > 0) {
              return raw.trim();
            }
            return restoreArtworkIdFromDocId(d.id);
          })
          .filter((id, index, arr) => id.length > 0 && arr.indexOf(id) === index);
      },
      async setLikedArtwork(uid: string, artworkId: string, payload: Record<string, unknown>): Promise<void> {
        await setDoc(
          doc(db, `users/${uid}/liked_artworks/${sanitizeDocId(artworkId)}`),
          {
            ...payload,
            artworkId,
          },
          { merge: true },
        );
      },
      async removeLikedArtwork(uid: string, artworkId: string): Promise<void> {
        await deleteDoc(doc(db, `users/${uid}/liked_artworks/${sanitizeDocId(artworkId)}`));
      },
    },
  };
}
