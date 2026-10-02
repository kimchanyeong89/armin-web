import { SAMPLE_COMMUNITY_POSTS } from "../../data/sampleCommunityPosts";

import type { ProfileImageCrop } from "../../types/Profile";

export type CommunitySort = "latest" | "popular";
export type CommunityCategory = "리뷰" | "뉴스" | "토론" | "인터뷰" | "소식" | "질문";
export type CommunityHeaderType = "all" | "museum" | "artist" | "artwork" | "exhibition";

export interface CommunityFeedPost {
  id: string;
  title: string;
  category?: string;
  isSample?: boolean;
  authorId?: string;
  authorName: string;
  authorPhotoURL?: string | null;
  authorPhoto?: string | null;
  /** how the author framed a custom photo (from their public card) */
  authorPhotoCrop?: ProfileImageCrop | null;
  authorRank?: string;
  createdAt: Date;
  likes: number;
  commentCount: number;
  contentSnippet?: string;
  content?: string;
  header: {
    id: string;
    type: string;
    name: string;
    image?: string;
  };
}

export const COMMUNITY_CATEGORIES: CommunityCategory[] = ["리뷰", "뉴스", "토론", "인터뷰", "소식", "질문"];

export const COMMUNITY_CATEGORY_COLORS: Record<CommunityCategory, string> = {
  리뷰: "#D4A547",
  뉴스: "#60A5FA",
  토론: "#F97316",
  인터뷰: "#A78BFA",
  소식: "#34D399",
  질문: "#FB7185",
};

export function normalizeCommunityCategory(value?: string): CommunityCategory {
  const lowered = String(value || "리뷰").trim().toLowerCase();
  if (lowered === "리뷰" || lowered === "review") return "리뷰";
  if (lowered === "뉴스" || lowered === "news") return "뉴스";
  if (lowered === "토론" || lowered === "discussion") return "토론";
  if (lowered === "인터뷰" || lowered === "interview") return "인터뷰";
  if (lowered === "소식" || lowered === "notice" || lowered === "update") return "소식";
  if (lowered === "질문" || lowered === "question" || lowered === "qna") return "질문";
  return "리뷰";
}

export function normalizeCommunityHeaderType(value?: string): Exclude<CommunityHeaderType, "all"> {
  const lowered = String(value || "museum").toLowerCase();
  if (lowered === "museum" || lowered === "artist" || lowered === "artwork" || lowered === "exhibition") {
    return lowered;
  }
  return "museum";
}

function createdAtValue(value: Date): number {
  return value instanceof Date ? value.getTime() : 0;
}

export function sortCommunityPosts(posts: CommunityFeedPost[], sort: CommunitySort): CommunityFeedPost[] {
  return [...posts].sort((a, b) => {
    if (sort === "popular") return Number(b.likes || 0) - Number(a.likes || 0);
    return createdAtValue(b.createdAt) - createdAtValue(a.createdAt);
  });
}

export function filterCommunityPosts(
  posts: CommunityFeedPost[],
  category: CommunityCategory,
  headerType: CommunityHeaderType,
): CommunityFeedPost[] {
  const scoped = posts.filter((post) => normalizeCommunityCategory(post.category) === category);
  if (category !== "리뷰" || headerType === "all") return scoped;
  return scoped.filter((post) => normalizeCommunityHeaderType(post.header?.type) === headerType);
}

export const SAMPLE_COMMUNITY_FEED_POSTS: CommunityFeedPost[] = SAMPLE_COMMUNITY_POSTS.map((post) => ({
  id: post.id,
  title: post.title,
  category: post.category,
  isSample: true,
  authorName: post.authorName,
  authorRank: post.authorRank,
  authorPhotoURL: post.authorPhotoURL ?? null,
  createdAt: post.createdAt,
  likes: post.likes,
  commentCount: post.commentCount,
  contentSnippet: post.contentSnippet,
  content: post.content,
  header: post.header,
}));

export function toCommunityFeedPost(id: string, data: Record<string, any>): CommunityFeedPost {
  return {
    id,
    ...data,
    likes: Number(data.likes || 0),
    commentCount: Number(data.commentCount || 0),
    header: data.header || { id: "unknown", type: "museum", name: "Unknown" },
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
  } as CommunityFeedPost;
}

/** Only real posts: an empty category stays empty rather than filled with made-up samples (10/2). */
export function mergeCommunityPosts(remotePosts: CommunityFeedPost[], sort: CommunitySort): CommunityFeedPost[] {
  return sortCommunityPosts(remotePosts, sort);
}
