export type ProfileImageCrop = {
  x?: number;
  y?: number;
  scale?: number;
  previewSize?: number;
  maskSize?: number;
  fitMode?: "contain" | "cover";
};

export type AppUserProfile = {
  nickname?: string;
  displayName?: string;
  email?: string;
  birthDate?: string;
  photoURL?: string;
  soulmateArtist?: string | null;
  profileImageCrop?: ProfileImageCrop | null;
  isOnboarded?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type UserProfilePatch = Partial<AppUserProfile>;
