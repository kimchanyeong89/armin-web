import { useEffect, useState } from "react";
import type { CommunityCategory } from "../../features/community/communityFeed";
import type { PostHeader } from "../../pages/community/atlas/shared";

/**
 * What this study writes stays in the browser that wrote it. Posts,
 * comments and likes go to localStorage and are laid over the live feed;
 * nothing is sent to the real community, so trying the composer never puts
 * a test post in front of real readers.
 */
const KEY = "colly.communityAtlas.v1";

/** what the study calls whoever is using it — there is no sign-in here */
export const ME = { ko: "나", en: "You" };

export interface LocalPost {
  id: string;
  title: string;
  category: CommunityCategory;
  header: PostHeader | null;
  /** cleaned HTML — see prose.ts */
  content: string;
  createdAt: number;
}

export interface LocalComment {
  id: string;
  postId: string;
  text: string;
  createdAt: number;
}

interface Saved {
  posts: LocalPost[];
  comments: LocalComment[];
  liked: string[];
}

const EMPTY: Saved = { posts: [], comments: [], liked: [] };

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function useStudyStore() {
  const [saved, setSaved] = useState<Saved>(read);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode: the session still works */ }
  }, [saved]);

  return {
    ...saved,
    publish(post: Omit<LocalPost, "id" | "createdAt">): string {
      const id = newId("local");
      setSaved((s) => ({ ...s, posts: [{ ...post, id, createdAt: Date.now() }, ...s.posts] }));
      return id;
    },
    remove(id: string) {
      setSaved((s) => ({
        posts: s.posts.filter((p) => p.id !== id),
        comments: s.comments.filter((c) => c.postId !== id),
        liked: s.liked.filter((x) => x !== id),
      }));
    },
    toggleLike(id: string) {
      setSaved((s) => ({ ...s, liked: s.liked.includes(id) ? s.liked.filter((x) => x !== id) : [...s.liked, id] }));
    },
    addComment(postId: string, text: string) {
      setSaved((s) => ({ ...s, comments: [...s.comments, { id: newId("c"), postId, text, createdAt: Date.now() }] }));
    },
  };
}

export type StudyStore = ReturnType<typeof useStudyStore>;
