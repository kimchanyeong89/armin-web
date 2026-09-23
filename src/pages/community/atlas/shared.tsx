import { useEffect, useState, type CSSProperties } from "react";
import {
  COMMUNITY_CATEGORY_COLORS,
  type CommunityCategory,
  type CommunityHeaderType,
} from "../../../features/community/communityFeed";
import ProfileAvatar from "../../../components/ProfileAvatar";
import type { ProfileImageCrop } from "../../../types/Profile";

export const CATEGORY_LABEL: Record<CommunityCategory, { ko: string; en: string }> = {
  리뷰: { ko: "리뷰", en: "Review" },
  뉴스: { ko: "뉴스", en: "News" },
  토론: { ko: "토론", en: "Discussion" },
  인터뷰: { ko: "인터뷰", en: "Interview" },
  소식: { ko: "소식", en: "Updates" },
  질문: { ko: "질문", en: "Questions" },
};

export const TARGET_LABEL: Record<CommunityHeaderType, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  museum: { ko: "미술관", en: "Museum" },
  artist: { ko: "작가", en: "Artist" },
  artwork: { ko: "작품", en: "Artwork" },
  exhibition: { ko: "전시", en: "Exhibition" },
};

/** what a review is written about — a museum, artist, artwork or exhibition */
export interface PostHeader {
  id: string;
  type: Exclude<CommunityHeaderType, "all">;
  name: string;
  image?: string;
}

/** each category keeps the live board's colour, handed to the CSS as --cat */
export const catStyle = (c: CommunityCategory): CSSProperties =>
  ({ "--cat": COMMUNITY_CATEGORY_COLORS[c] } as CSSProperties);

export const two = (n: number) => String(n).padStart(2, "0");

/** the live board's clock: minutes, then hours, then a short date */
export function ago(date: Date, ko: boolean): string {
  const min = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (min < 1) return ko ? "방금 전" : "now";
  if (min < 60) return ko ? `${min}분 전` : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return ko ? `${h}시간 전` : `${h}h ago`;
  return date.toLocaleDateString(ko ? "ko-KR" : "en-US", { month: "short", day: "numeric" });
}

export function Avatar({ name, src, size, crop }: {
  name: string;
  src?: string | null;
  size: number;
  crop?: ProfileImageCrop | null;
}) {
  const initial = (
    <span className="ca-av ca-av--init" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}>
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
  if (!src) return initial;
  /* the app's own avatar, so a photo keeps the framing its owner set in My Page */
  return (
    <span className="ca-av" style={{ width: size, height: size }}>
      <ProfileAvatar src={src} crop={crop} size={size} alt="" background="var(--soft)" fallback={initial} />
    </span>
  );
}

/** the app's light or dark choice — kept in localStorage and changed from elsewhere */
export function useHomeTheme(): boolean {
  const read = () => {
    try { return localStorage.getItem("homeTheme") === "light"; } catch { return false; }
  };
  const [light, setLight] = useState(read);
  useEffect(() => {
    const sync = () => setLight(read());
    window.addEventListener("theme-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("theme-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return light;
}
