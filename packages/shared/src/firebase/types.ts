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
  listLikedMuseumIds: (uid: string) => Promise<string[]>;
  setLikedMuseum: (uid: string, museumId: string, payload: Record<string, unknown>) => Promise<void>;
  removeLikedMuseum: (uid: string, museumId: string) => Promise<void>;
  listLikedExhibitionIds: (uid: string) => Promise<string[]>;
  setLikedExhibition: (uid: string, exhibitionId: string, payload: Record<string, unknown>) => Promise<void>;
  removeLikedExhibition: (uid: string, exhibitionId: string) => Promise<void>;
};

export type FirebasePort = {
  profile: UserProfileRepository;
  likes: LikesRepository;
};
