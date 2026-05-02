import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { BadgeCheck, MessageSquare, PenLine, TrendingUp, Heart } from "lucide-react";
import { db } from "../../firebase";
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { resolveCommunityRank } from "../../utils/communityRank";
import { useLanguage } from "../../contexts/LanguageContext";
import { LiveAvatar, LiveName } from "../../components/LiveAuthor";
import { SAMPLE_COMMUNITY_POSTS } from "../../data/sampleCommunityPosts";

type SortTab = "latest" | "popular";
type CategoryTab = "리뷰" | "뉴스" | "토론" | "인터뷰" | "소식" | "질문";
type HeaderType = "all" | "museum" | "artist" | "artwork" | "exhibition";

interface Post {
  id: string;
  title: string;
  category?: string;
  isSample?: boolean;
  authorId?: string;
  authorName: string;
  authorPhotoURL?: string | null;
  authorPhoto?: string | null;
  authorRank?: string;
  createdAt: any;
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

const CATEGORY_TABS: CategoryTab[] = ["리뷰", "뉴스", "토론", "인터뷰", "소식", "질문"];

const CATEGORY_COLORS: Record<CategoryTab, string> = {
  리뷰: "#BFFF0A",
  뉴스: "#60A5FA",
  토론: "#F97316",
  인터뷰: "#A78BFA",
  소식: "#34D399",
  질문: "#FB7185",
};

const REVIEW_FILTERS: Array<{ id: HeaderType; label: string; color: string }> = [
  { id: "all", label: "전체", color: "" },
  { id: "museum", label: "미술관", color: "#BFFF0A" },
  { id: "artist", label: "작가", color: "#60A5FA" },
  { id: "artwork", label: "작품", color: "#FB7185" },
  { id: "exhibition", label: "전시", color: "#A78BFA" },
];

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

const SAMPLE_POSTS: Post[] = SAMPLE_COMMUNITY_POSTS.map((post) => ({
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
  content: "",
  header: post.header,
}));

function decodeHtml(raw: string): string {
  if (typeof window === "undefined") return raw;
  const el = document.createElement("textarea");
  el.innerHTML = raw;
  return el.value;
}

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

  const noTags = plainText;
  const noUrls = noTags.replace(/https?:\/\/\S+/gi, " ");
  const compact = noUrls.replace(/\u200B/g, " ").replace(/\s+/g, " ").trim();

  if (!compact) return emptyLabel;
  return compact.slice(0, 160);
}

const CommunityPage: React.FC = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortTab, setSortTab] = useState<SortTab>("latest");
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("리뷰");
  const [activeFilter, setActiveFilter] = useState<HeaderType>("all");
  const [remotePostsDisabled, setRemotePostsDisabled] = useState(false);

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

  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);

      const fallbackToSamples = () => {
        const samplePosts = [...SAMPLE_POSTS];
        samplePosts.sort((a, b) => {
          if (sortTab === "popular") return Number(b.likes || 0) - Number(a.likes || 0);
          return (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();
        });
        setPosts(samplePosts);
      };

      if (remotePostsDisabled) {
        fallbackToSamples();
        setLoading(false);
        return;
      }

      try {
        const postsRef = collection(db, "community_posts");
        const q =
          sortTab === "popular"
            ? query(postsRef, orderBy("likes", "desc"), limit(80))
            : query(postsRef, orderBy("createdAt", "desc"), limit(80));

        const snapshot = await getDocs(q);
        const loadedPosts = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            likes: Number(data.likes || 0),
            commentCount: Number(data.commentCount || 0),
            header: data.header || { id: "unknown", type: "museum", name: "Unknown" },
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
          } as Post;
        });

        const categoriesWithContent = new Set(loadedPosts.map((post) => normalizeCategory(post.category)));
        const fallbackSamples = SAMPLE_POSTS.filter((sample) => !categoriesWithContent.has(normalizeCategory(sample.category)));

        const merged = [...fallbackSamples, ...loadedPosts];
        merged.sort((a, b) => {
          if (sortTab === "popular") return Number(b.likes || 0) - Number(a.likes || 0);
          return (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime();
        });

        setPosts(merged);
      } catch (error) {
        const code = String((error as any)?.code || "");
        const message = String((error as any)?.message || "").toLowerCase();
        if (code.includes("permission-denied") || message.includes("insufficient permissions")) {
          setRemotePostsDisabled(true);
          fallbackToSamples();
        } else {
          console.error("Error fetching posts:", error);
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchPosts();
  }, [sortTab, remotePostsDisabled]);

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

  const normalizeHeaderType = (value?: string): HeaderType => {
    if (!value) return "museum";
    const lowered = String(value).toLowerCase();
    if (lowered === "museum" || lowered === "artist" || lowered === "artwork" || lowered === "exhibition") {
      return lowered;
    }
    return "museum";
  };

  const normalizeCategory = (value?: string): CategoryTab => {
    const lowered = String(value || "리뷰").trim().toLowerCase();
    if (lowered === "리뷰" || lowered === "review") return "리뷰";
    if (lowered === "뉴스" || lowered === "news") return "뉴스";
    if (lowered === "토론" || lowered === "discussion") return "토론";
    if (lowered === "인터뷰" || lowered === "interview") return "인터뷰";
    if (lowered === "소식" || lowered === "notice" || lowered === "update") return "소식";
    if (lowered === "질문" || lowered === "question" || lowered === "qna") return "질문";
    return "리뷰";
  };

  const filteredPosts = useMemo(() => {
    let scoped = posts.filter((post) => normalizeCategory(post.category) === activeCategory);
    if (activeCategory !== "리뷰") return scoped;
    if (activeFilter === "all") return scoped;
    scoped = scoped.filter((post) => normalizeHeaderType(post.header?.type) === activeFilter);
    return scoped;
  }, [posts, activeCategory, activeFilter]);

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

  const resolveTagLabel = (post: Post) => {
    return getCategoryLabel(normalizeCategory(post.category));
  };

  const resolveTagColor = (post: Post) => {
    const category = normalizeCategory(post.category);
    return CATEGORY_COLORS[category];
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        overscrollBehavior: "contain",
        background: colors.pageBg,
        fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          minHeight: "100%",
          background: colors.shellBg,
          color: colors.text,
        }}
      >
        <div
          style={{
            padding: "max(52px, calc(env(safe-area-inset-top) + 30px)) 14px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: "#BFFF0A", display: "inline-block" }} />
                <span style={{ fontSize: 9, letterSpacing: "0.28em", color: colors.lowText, textTransform: "uppercase" }}>
                  {t({ ko: "커뮤니티", en: "Community" })}
                </span>
              </div>
              <h1 style={{ margin: 0, fontSize: "clamp(30px, 4.5vw, 40px)", fontWeight: 700, letterSpacing: "-0.015em", color: colors.title }}>
                {t({ ko: "커뮤니티", en: "Community" })}
              </h1>
            </div>

            <button
              onClick={() => navigate("/community/write")}
              style={{
                border: "none",
                borderRadius: 999,
                background: "#BFFF0A",
                color: "#000",
                height: 36,
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              <PenLine size={12} strokeWidth={2.6} />
              {t({ ko: "작성", en: "Write" })}
            </button>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: 4,
              borderRadius: 999,
              border: `1px solid ${colors.divider}`,
              background: isLightTheme ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.28)",
              marginBottom: 10,
            }}
          >
            <button
              onClick={() => setSortTab("latest")}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "7px 12px",
                background: sortTab === "latest" ? "#BFFF0A" : "transparent",
                color: sortTab === "latest" ? "#000" : colors.medText,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
                letterSpacing: "0.03em",
              }}
            >
              {t({ ko: "최신", en: "Latest" })}
            </button>
            <button
              onClick={() => setSortTab("popular")}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "7px 12px",
                background: sortTab === "popular" ? (isLightTheme ? "#111" : "#fff") : "transparent",
                color: sortTab === "popular" ? (isLightTheme ? "#fff" : "#000") : colors.medText,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
                letterSpacing: "0.03em",
              }}
            >
              {t({ ko: "인기", en: "Popular" })}
            </button>
          </div>
        </div>

        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: colors.stickyBg,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            padding: "10px 14px 10px",
          }}
        >
          <div style={{ display: "flex", gap: 8, overflowX: "auto", overflowY: "visible", padding: "4px 4px 12px", scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {CATEGORY_TABS.map((tab) => {
              const active = activeCategory === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveCategory(tab);
                    if (tab !== "리뷰") {
                      setActiveFilter("all");
                    }
                  }}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "7px 12px",
                    background: active ? CATEGORY_COLORS[tab] : colors.filterBg,
                    color: active ? "#000" : colors.medText,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {getCategoryLabel(tab)}
                </button>
              );
            })}
          </div>
        </div>

        {activeCategory === "리뷰" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "0 14px 12px" }}>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", overflowY: "visible", scrollbarWidth: "none", msOverflowStyle: "none" }}>
              {REVIEW_FILTERS.map((filter) => {
                const active = activeFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      onClick={() => setActiveFilter(filter.id)}
                      style={{
                        border: `1px solid ${active ? (filter.id === "all" ? colors.subFilterBorder : filter.color) : colors.subFilterBorder}`,
                        borderRadius: 10,
                        padding: "6px 12px",
                        background: active
                          ? filter.id === "all"
                            ? (isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.14)")
                            : `${filter.color}22`
                          : colors.subFilterBg,
                        color: active ? (filter.id === "all" ? colors.text : filter.color) : colors.medText,
                        cursor: "pointer",
                        fontSize: 10,
                        fontWeight: active ? 700 : 500,
                        whiteSpace: "nowrap",
                        letterSpacing: "0.02em",
                        boxShadow: active ? `inset 0 0 0 1px ${filter.id === "all" ? "transparent" : filter.color}` : "none",
                      }}
                    >
                      {getFilterLabel(filter.id)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ height: 1, background: colors.divider, margin: "0 14px" }} />

        <div style={{ paddingBottom: 88 }}>
          {loading ? (
            <div style={{ padding: "56px 24px", textAlign: "center", color: colors.medText }}>
              {t({ ko: "불러오는 중...", en: "Loading..." })}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div style={{ padding: "70px 24px", textAlign: "center", color: colors.medText }}>
              {language === "ko"
                ? `${getCategoryLabel(activeCategory)} 카테고리에 게시글이 없습니다.`
                : `No posts in ${getCategoryLabel(activeCategory)}.`}
            </div>
          ) : (
            filteredPosts.map((post) => {
              const hot = post.likes >= 100 || post.commentCount >= 50;
              const tagColor = resolveTagColor(post);
              const thumb = post.header?.image;
              const excerpt = extractPreviewText(
                post.content || post.contentSnippet,
                t({ ko: "내용 미리보기가 없습니다.", en: "No preview available." }),
              );
              const rank = resolveCommunityRank(post.authorRank, post.likes, post.commentCount);
              const authorPhoto = post.authorPhotoURL || post.authorPhoto || null;
              const authorName = post.authorName || t({ ko: "익명", en: "Unknown" });

              return (
                <button
                  key={post.id}
                  onClick={() => {
                    navigate(`/community/post/${post.id}`);
                  }}
                  style={{
                    width: "100%",
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    padding: "0 14px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      borderBottom: `1px solid ${colors.divider}`,
                      display: "grid",
                      gridTemplateColumns: "92px minmax(0,1fr)",
                      gap: 14,
                      padding: "14px 0",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background = colors.rowHover;
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 4,
                          overflow: "hidden",
                          border: `1px solid ${colors.divider}`,
                          background: isLightTheme ? "#ececec" : "#1a1a1a",
                          flexShrink: 0,
                        }}
                      >
                        {thumb ? (
                          <img
                            src={getOptimizedImageUrl(thumb, 180)}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                              filter: isLightTheme ? "saturate(0.72)" : "saturate(0.45) brightness(0.88)",
                            }}
                          />
                        ) : null}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            background: tagColor,
                            color: "#000",
                            textTransform: "uppercase",
                          }}
                        >
                          {resolveTagLabel(post)}
                        </span>
                        {hot && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#BFFF0A", letterSpacing: "0.06em" }}>
                            <TrendingUp size={10} strokeWidth={2.3} /> {t({ ko: "인기", en: "HOT" })}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 14, lineHeight: 1.45, color: colors.title, fontWeight: 600, letterSpacing: "-0.004em" }}>{post.title}</div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          lineHeight: 1.5,
                          color: colors.lowText,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {excerpt}
                      </div>

                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, color: colors.medText }}>
                        <LiveAvatar uid={post.authorId} fallbackName={authorName} fallbackPhoto={authorPhoto || undefined} size={20} />
                        <LiveName uid={post.authorId} fallbackName={authorName} style={{ fontSize: 11, fontWeight: 600, color: colors.text }} />
                        <span style={{ fontSize: 11, color: colors.lowText }}>·</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: isLightTheme ? "#222" : "rgba(255,255,255,0.82)" }}>
                          <BadgeCheck size={11} strokeWidth={2.1} /> {rank}
                        </span>
                        <span style={{ fontSize: 10, fontFamily: "'Space Mono', monospace", color: colors.lowText }}>{formatDate(post.createdAt)}</span>
                        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, color: colors.lowText }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                            <Heart size={10} strokeWidth={1.8} /> {post.likes}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                            <MessageSquare size={10} strokeWidth={1.8} /> {post.commentCount}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunityPage;
