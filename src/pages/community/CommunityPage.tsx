import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, MessageSquare, PenLine, TrendingUp, MapPin } from "lucide-react";
import { LikeIcon } from "../../components/like/LikeIcon";
import NearbyExhibitions from "../../components/NearbyExhibitions";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { resolveCommunityRank } from "../../utils/communityRank";
import { useLanguage } from "../../contexts/LanguageContext";
import { LiveAvatar, LiveName } from "../../components/LiveAuthor";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_CATEGORY_COLORS,
  filterCommunityPosts,
  normalizeCommunityCategory,
} from "../../features/community/communityFeed";
import type {
  CommunityCategory,
  CommunityFeedPost,
  CommunityHeaderType,
  CommunitySort,
} from "../../features/community/communityFeed";
import { useCommunityFeed } from "../../features/community/useCommunityFeed";
import { COMMUNITY_FONT_OPTIONS, getCommunityFontOption } from "./communityFonts";
import "./community-rail.css";

type SortTab = CommunitySort;
type CategoryTab = CommunityCategory;
/** The rail can also sit on "all", which skips category filtering entirely. */
type CategoryView = "all" | CommunityCategory;
type HeaderType = CommunityHeaderType;

const CATEGORY_TABS = COMMUNITY_CATEGORIES;
const CATEGORY_COLORS = COMMUNITY_CATEGORY_COLORS;

// Labels come from REVIEW_FILTER_LABELS below so they can be localised.
const REVIEW_FILTERS: HeaderType[] = ["all", "museum", "artist", "artwork", "exhibition"];

const CATEGORY_LABELS: Record<CategoryTab, { ko: string; en: string }> = {
  리뷰: { ko: "리뷰", en: "Review" },
  뉴스: { ko: "뉴스", en: "News" },
  토론: { ko: "토론", en: "Discussion" },
  인터뷰: { ko: "인터뷰", en: "Interview" },
  소식: { ko: "소식", en: "Updates" },
  질문: { ko: "질문", en: "Questions" },
};

const REVIEW_FILTER_LABELS: Record<HeaderType, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  museum: { ko: "미술관", en: "Museum" },
  artist: { ko: "작가", en: "Artist" },
  artwork: { ko: "작품", en: "Artwork" },
  exhibition: { ko: "전시", en: "Exhibition" },
};

function decodeHtml(raw: string): string {
  if (typeof window === "undefined") return raw;
  const el = document.createElement("textarea");
  el.innerHTML = raw;
  return el.value;
}

/** First readable line of a post, with attachment furniture stripped out. */
function extractPreviewText(raw?: string, emptyLabel = "No preview available."): string {
  if (!raw) return emptyLabel;

  const decoded = decodeHtml(raw);
  let plainText = "";

  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(decoded, "text/html");
    doc.querySelectorAll("script, style, img, figure, figcaption, .post-image-container, .att-title, .att-artist, .att-meta, [data-attachment-id]").forEach((node) => {
      node.remove();
    });
    plainText = doc.body.textContent || "";
  } else {
    const noScript = decoded.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    plainText = noScript
      .replace(/<div[^>]*class=["'][^"']*(post-image-container|att-title|att-artist|att-meta)[^"']*["'][\s\S]*?<\/div>/gi, " ")
      .replace(/<img[^>]*>/gi, " ")
      .replace(/<[^>]*>/g, " ");
  }

  const noUrls = plainText.replace(/https?:\/\/\S+/gi, " ");
  const compact = noUrls.replace(/\u200B/g, " ").replace(/\s+/g, " ").trim();

  if (!compact) return emptyLabel;
  return compact.slice(0, 90);
}

const CommunityPage: React.FC = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const [sortTab, setSortTab] = useState<SortTab>("latest");
  const { posts, loading } = useCommunityFeed(sortTab);
  const [activeCategory, setActiveCategory] = useState<CategoryView>("all");
  const [activeFilter, setActiveFilter] = useState<HeaderType>("all");
  // When true, the category row's "주변 전시" chip is selected and the post
  // list is replaced by the nearby-exhibition browser (moved here from the AI tab).
  const [nearbyView, setNearbyView] = useState(false);

  // Type study, opt-in via ?font=. Nothing here loads unless the parameter is set.
  const [fontKey, setFontKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("font");
  });
  const fontOption = getCommunityFontOption(fontKey);

  useEffect(() => {
    if (!fontOption) return;
    const added: HTMLElement[] = [];
    fontOption.hrefs.forEach((href) => {
      if (document.querySelector(`link[data-cm-font="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.cmFont = href;
      document.head.appendChild(link);
      added.push(link);
    });
    if (fontOption.faceCss) {
      const style = document.createElement("style");
      style.dataset.cmFont = fontOption.key;
      style.textContent = fontOption.faceCss;
      document.head.appendChild(style);
      added.push(style);
    }
    return () => { added.forEach((node) => node.remove()); };
  }, [fontOption]);

  const selectFont = (key: string) => {
    setFontKey(key);
    const url = new URL(window.location.href);
    url.searchParams.set("font", key);
    window.history.replaceState(null, "", url.toString());
  };

  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem("homeTheme") === "light");
      } catch {
        setIsLightTheme(false);
      }
    };

    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const colors = isLightTheme
    ? {
        pageBg: "#f6f6f6",
        shellBg: "#fbfbfb",
        text: "#101010",
        title: "#0f0f0f",
        medText: "#666",
        lowText: "#8a8a8a",
        divider: "rgba(0,0,0,0.09)",
        rowHover: "rgba(0,0,0,0.03)",
        filterBg: "rgba(0,0,0,0.06)",
        subFilterBg: "rgba(0,0,0,0.02)",
        subFilterBorder: "rgba(0,0,0,0.16)",
        stickyBg: "rgba(251,251,251,0.95)",
      }
    : {
        pageBg: "#050505",
        shellBg: "#080808",
        text: "rgba(255,255,255,0.9)",
        title: "rgba(255,255,255,0.96)",
        medText: "rgba(255,255,255,0.58)",
        lowText: "rgba(255,255,255,0.40)",
        divider: "rgba(255,255,255,0.08)",
        rowHover: "rgba(255,255,255,0.03)",
        filterBg: "rgba(255,255,255,0.07)",
        subFilterBg: "rgba(255,255,255,0.03)",
        subFilterBorder: "rgba(255,255,255,0.20)",
        stickyBg: "rgba(8,8,8,0.95)",
      };

  const filteredPosts = useMemo(() => {
    if (activeCategory === "all") return posts;
    return filterCommunityPosts(posts, activeCategory, activeFilter);
  }, [posts, activeCategory, activeFilter]);

  // The rail shows how much sits behind each category.
  const categoryCounts = useMemo(() => {
    const base = Object.fromEntries(CATEGORY_TABS.map((tab) => [tab, 0])) as Record<CategoryTab, number>;
    posts.forEach((post) => { base[normalizeCommunityCategory(post.category)] += 1; });
    return base;
  }, [posts]);

  const formatDate = (value: Date) => {
    const now = Date.now();
    const diff = now - value.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (minutes < 60) return language === "ko" ? `${minutes}분 전` : `${minutes}m ago`;
    if (hours < 24) return language === "ko" ? `${hours}시간 전` : `${hours}h ago`;
    return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" });
  };

  const getCategoryLabel = (category: CategoryTab) => t(CATEGORY_LABELS[category]);

  const getFilterLabel = (headerType: HeaderType) => t(REVIEW_FILTER_LABELS[headerType]);

  const resolveTagLabel = (post: CommunityFeedPost) => {
    return getCategoryLabel(normalizeCommunityCategory(post.category));
  };

  const resolveTagColor = (post: CommunityFeedPost) => {
    const category = normalizeCommunityCategory(post.category);
    return CATEGORY_COLORS[category];
  };

  const railVars = {
    "--cm-page-bg": colors.pageBg,
    "--cm-shell-bg": colors.shellBg,
    "--cm-sticky-bg": colors.stickyBg,
    "--cm-text": colors.text,
    "--cm-title": colors.title,
    "--cm-med": colors.medText,
    "--cm-low": colors.lowText,
    "--cm-line": colors.divider,
    "--cm-hover": colors.rowHover,
    "--cm-chip": colors.filterBg,
    "--cm-gold": "#D4A547",
    // Deliberately fainter than colors.rowHover: a wash, not a panel.
    "--cm-row-hover": isLightTheme ? "rgba(0,0,0,0.022)" : "rgba(255,255,255,0.022)",
    "--cm-row-press": isLightTheme ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.045)",
    ...(fontOption ? { "--cm-font": fontOption.stack } : {}),
    ...(fontOption?.titleStack ? { "--cm-title-font": fontOption.titleStack } : {}),
  } as React.CSSProperties;

  return (
    <div className="cm-page" data-light={isLightTheme || undefined} style={railVars}>
      <div className="cm-shell">
        {fontOption && (
          <div className="cm-fontbar">
            <div className="cm-fontbar-tabs" role="group" aria-label="한글 폰트 시안">
              {COMMUNITY_FONT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={option.key === fontOption.key}
                  className={option.key === fontOption.key ? "is-active" : ""}
                  style={{ fontFamily: option.titleStack || option.stack }}
                  onClick={() => selectFont(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p>{fontOption.note}</p>
          </div>
        )}

        <header className="cm-head">
          <h1>{t({ ko: "커뮤니티", en: "Community" })}</h1>
        </header>

        <div className="cm-controls">
          <div className="cm-sort" role="group" aria-label={t({ ko: "정렬", en: "Sort" })}>
            <button className={sortTab === "latest" ? "is-active" : ""} onClick={() => setSortTab("latest")}>
              {t({ ko: "최신", en: "Latest" })}
            </button>
            <button className={sortTab === "popular" ? "is-active" : ""} onClick={() => setSortTab("popular")}>
              {t({ ko: "인기", en: "Popular" })}
            </button>
          </div>
        </div>

        <div className="cm-body">
          <div className="cm-railbar">
          <nav className="cm-rail" role="tablist" aria-orientation="vertical" aria-label={t({ ko: "분류", en: "Category" })}>
            <button
              type="button"
              role="tab"
              aria-selected={!nearbyView && activeCategory === "all"}
              className={!nearbyView && activeCategory === "all" ? "is-active" : ""}
              style={{ "--cm-cat": "#D4A547" } as React.CSSProperties}
              onClick={() => {
                setNearbyView(false);
                setActiveCategory("all");
                setActiveFilter("all");
              }}
            >
              <span>{t({ ko: "전체", en: "All" })}</span>
              <span className="cm-rail-count">{posts.length}</span>
            </button>
            {CATEGORY_TABS.map((tab) => {
              const active = !nearbyView && activeCategory === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? "is-active" : ""}
                  style={{ "--cm-cat": CATEGORY_COLORS[tab] } as React.CSSProperties}
                  onClick={() => {
                    setNearbyView(false);
                    setActiveCategory(tab);
                    if (tab !== "리뷰") setActiveFilter("all");
                  }}
                >
                  <span>{getCategoryLabel(tab)}</span>
                  <span className="cm-rail-count">{categoryCounts[tab]}</span>
                </button>
              );
            })}
          </nav>
          <div className="cm-actions">
            <button
              type="button"
              className={nearbyView ? "cm-nearby is-active" : "cm-nearby"}
              aria-pressed={nearbyView}
              onClick={() => setNearbyView(true)}
            >
              <MapPin size={13} strokeWidth={2.4} />
              {t({ ko: "주변 전시", en: "Nearby" })}
            </button>
            <button className="cm-write" onClick={() => navigate("/community/write")}>
              <PenLine size={13} strokeWidth={2.4} />
              {t({ ko: "새 글", en: "Write" })}
            </button>
          </div>
          </div>

          <div className="cm-listcol">
            {nearbyView ? (
              <NearbyExhibitions isLight={isLightTheme} language={language} />
            ) : (
              <>
                {activeCategory === "리뷰" && (
                  <div className="cm-target" role="group" aria-label={t({ ko: "리뷰 대상", en: "Review target" })}>
                    {REVIEW_FILTERS.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        aria-pressed={activeFilter === filter}
                        className={activeFilter === filter ? "is-active" : ""}
                        onClick={() => setActiveFilter(filter)}
                      >
                        {getFilterLabel(filter)}
                      </button>
                    ))}
                  </div>
                )}

                {loading ? (
                  <p className="cm-state" role="status" aria-live="polite">{t({ ko: "불러오는 중…", en: "Loading…" })}</p>
                ) : filteredPosts.length === 0 ? (
                  <p className="cm-state" role="status" aria-live="polite">
                    {activeCategory === "all"
                      ? t({ ko: "아직 게시글이 없습니다.", en: "No posts yet." })
                      : language === "ko"
                        ? `${getCategoryLabel(activeCategory)} 카테고리에 게시글이 없습니다.`
                        : `No posts in ${getCategoryLabel(activeCategory)}.`}
                  </p>
                ) : (
                  <>
                  <div className="cm-colhead" aria-hidden="true">
                    <span />
                    <span>{t({ ko: "제목", en: "Title" })}</span>
                    <span>{t({ ko: "글쓴이", en: "Author" })}</span>
                    <span>{t({ ko: "날짜", en: "Date" })}</span>
                    <span>♥</span>
                    <span>{t({ ko: "댓글", en: "Re" })}</span>
                  </div>
                  <ul className="cm-list">
                    {filteredPosts.map((post) => {
                      const hot = post.likes >= 100 || post.commentCount >= 50;
                      const thumb = post.header?.image;
                      const rank = resolveCommunityRank(post.authorRank, post.likes, post.commentCount);
                      const authorPhoto = post.authorPhotoURL || post.authorPhoto || null;
                      const authorName = post.authorName || t({ ko: "익명", en: "Unknown" });

                      return (
                        <li key={post.id} style={{ "--cm-cat": resolveTagColor(post) } as React.CSSProperties}>
                          <button onClick={() => navigate(`/community/post/${post.id}`)}>
                            <span className="cm-thumb">
                              {thumb ? (
                                <img
                                  src={getOptimizedImageUrl(thumb, 180)}
                                  alt=""
                                  width={40}
                                  height={40}
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : null}
                            </span>

                            <span className="cm-main">
                              <span className="cm-titleline">
                                <span className="cm-chip">{resolveTagLabel(post)}</span>
                                <span className="cm-title">{post.title}</span>
                                {hot && (
                                  <span className="cm-hot"><TrendingUp size={10} strokeWidth={2.3} />{t({ ko: "인기", en: "HOT" })}</span>
                                )}
                              </span>
                              <span className="cm-excerpt">
                                {extractPreviewText(
                                  post.content || post.contentSnippet,
                                  t({ ko: "내용 미리보기가 없습니다.", en: "No preview available." }),
                                )}
                              </span>
                            </span>

                            <span className="cm-author">
                              <LiveAvatar uid={post.authorId} fallbackName={authorName} fallbackPhoto={authorPhoto || undefined} size={18} />
                              <LiveName
                                uid={post.authorId}
                                fallbackName={authorName}
                                style={{
                                  fontSize: 11.5,
                                  // Only the post title is bold; the author steps down a notch.
                                  fontWeight: 500,
                                  color: colors.text,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              />
                              {/* The level is a mark next to the name; the text lives in the tooltip. */}
                              <span className="cm-rankmark" title={rank} aria-label={rank}>
                                <BadgeCheck size={11} strokeWidth={2.1} />
                              </span>
                            </span>

                            <span className="cm-date">{formatDate(post.createdAt)}</span>
                            <span className="cm-n"><LikeIcon liked={false} size={10} strokeWidth={1.8} />{post.likes}</span>
                            <span className="cm-n"><MessageSquare size={10} strokeWidth={1.8} />{post.commentCount}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;
