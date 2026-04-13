import type { AppUserProfile, UserProfilePatch } from "../types/Profile";

export type AuthUserLike = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
};

export type UserProfileRepository = {
  getUserProfile: (uid: string) => Promise<AppUserProfile | null>;
  upsertUserProfile: (uid: string, patch: UserProfilePatch) => Promise<void>;
  observeUserProfile?: (
    uid: string,
    onChange: (profile: AppUserProfile | null) => void,
    onError?: (error: unknown) => void
  ) => () => void;
};

export type LikesRepository = {
  listLikedArtworkIds: (uid: string) => Promise<string[]>;
  setLikedArtwork: (uid: string, artworkId: string, payload: Record<string, unknown>) => Promise<void>;
  removeLikedArtwork: (uid: string, artworkId: string) => Promise<void>;
};

export type FirebasePort = {
  profile: UserProfileRepository;
  likes: LikesRepository;
};
