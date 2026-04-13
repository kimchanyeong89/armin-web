export type CommunityUserProfile = {
  nickname?: string;
  displayName?: string;
  photoURL?: string | null;
};

export type CommunityComment = {
  id: string;
  text: string;
  createdAt: unknown;
  userId?: string;
  userName?: string;
  userPhotoURL?: string | null;
  authorId?: string;
  authorName?: string;
  authorPhotoURL?: string | null;
  authorRank?: string;
  likes?: string[];
  parentId?: string | null;
  _tempId?: number;
};

export type CommunityPostSummary = {
  id: string;
  title: string;
  category?: string;
  authorId?: string;
  authorName?: string;
  authorPhotoURL?: string | null;
  authorRank?: string;
  contentSnippet?: string;
  createdAt?: unknown;
  likes?: number;
  commentCount?: number;
};
