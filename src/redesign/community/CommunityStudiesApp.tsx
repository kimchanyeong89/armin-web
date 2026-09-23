import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useNavigate, useParams } from "react-router-dom";
import NearbyExhibitions from "../../components/NearbyExhibitions";
import { useLanguage } from "../../contexts/LanguageContext";
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
import { getOptimizedImageUrl } from "../../utils/imageProxy";
import { COMMUNITY_STUDIES, buildCommunityStudyPath, getCommunityStudy } from "./model";
import "./community-studies.css";

const FALLBACK_IMAGES = [
  "/images/fabre/01063661.jpg",
  "/images/fabre/00460739.jpg",
  "/images/fabre/01094940.jpg",
  "/images/fabre/01263357.jpg",
  "/images/fabre/00185147.jpg",
  "/images/fabre/01090311.jpg",
];

const categoryLabels: Record<CommunityCategory, { ko: string; en: string }> = {
  리뷰: { ko: "리뷰", en: "Review" },
  뉴스: { ko: "뉴스", en: "News" },
  토론: { ko: "토론", en: "Discussion" },
  인터뷰: { ko: "인터뷰", en: "Interview" },
  소식: { ko: "소식", en: "Updates" },
  질문: { ko: "질문", en: "Questions" },
};

const filterLabels: Record<CommunityHeaderType, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  museum: { ko: "미술관", en: "Museum" },
  artist: { ko: "작가", en: "Artist" },
  artwork: { ko: "작품", en: "Artwork" },
  exhibition: { ko: "전시", en: "Exhibition" },
};

const filters: CommunityHeaderType[] = ["all", "museum", "artist", "artwork", "exhibition"];

function postImage(post: CommunityFeedPost, index: number): string {
  return getOptimizedImageUrl(post.header?.image || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length], 1200);
}

function previewText(post: CommunityFeedPost): string {
  const raw = post.contentSnippet || post.content || "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function formatDate(value: Date, language: "ko" | "en"): string {
  const hours = Math.max(0, Math.floor((Date.now() - value.getTime()) / 3_600_000));
  if (hours < 1) return language === "ko" ? "방금 전" : "Now";
  if (hours < 24) return language === "ko" ? `${hours}시간 전` : `${hours}h ago`;
  return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" });
}

interface StudyViewProps {
  posts: CommunityFeedPost[];
  loading: boolean;
  language: "ko" | "en";
  onOpen: (post: CommunityFeedPost) => void;
}

function PostMeta({ post, language }: { post: CommunityFeedPost; language: "ko" | "en" }) {
  return (
    <div className="rc-post-meta">
      <span>{post.authorName}</span>
      <span>{formatDate(post.createdAt, language)}</span>
      <span>♥ {post.likes}</span>
      <span>↳ {post.commentCount}</span>
    </div>
  );
}

function CategoryMark({ post }: { post: CommunityFeedPost }) {
  const category = normalizeCommunityCategory(post.category);
  return (
    <span className="rc-category-mark" style={{ "--rc-mark": COMMUNITY_CATEGORY_COLORS[category] } as CSSProperties}>
      {category}
    </span>
  );
}

function EmptyFeed({ loading, language }: Pick<StudyViewProps, "loading" | "language">) {
  return (
    <div className="rc-empty" role="status">
      {loading
        ? (language === "ko" ? "대화를 불러오는 중" : "Loading conversations")
        : (language === "ko" ? "이 분류에는 아직 글이 없습니다." : "No posts in this view yet.")}
    </div>
  );
}

function LivingArchiveView({ posts, loading, language, onOpen }: StudyViewProps) {
  if (!posts.length) return <EmptyFeed loading={loading} language={language} />;
  const lead = posts[0];
  return (
    <div className="rc-archive-layout">
      <aside className="rc-archive-rail">
        <span>{language === "ko" ? "오늘의 기록" : "Today's register"}</span>
        <strong>{posts.length.toString().padStart(2, "0")}</strong>
        <p>{language === "ko" ? "관람 후 남겨진 생각을 주제와 반응으로 엮었습니다." : "Field notes arranged by subject and response."}</p>
      </aside>
      <section className="rc-archive-lead">
        <button type="button" onClick={() => onOpen(lead)}>
          <img src={postImage(lead, 0)} alt="" />
          <div>
            <CategoryMark post={lead} />
            <h2>{lead.title}</h2>
            <p>{previewText(lead)}</p>
            <PostMeta post={lead} language={language} />
          </div>
        </button>
      </section>
      <section className="rc-archive-list" aria-label={language === "ko" ? "게시글 목록" : "Post list"}>
        {posts.slice(1).map((post, index) => (
          <motion.button
            type="button"
            key={post.id}
            onClick={() => onOpen(post)}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index, 7) * 0.035 }}
          >
            <span className="rc-list-number">{String(index + 2).padStart(2, "0")}</span>
            <div><CategoryMark post={post} /><h3>{post.title}</h3><PostMeta post={post} language={language} /></div>
          </motion.button>
        ))}
      </section>
    </div>
  );
}

function SalonStreamView({ posts, loading, language, onOpen }: StudyViewProps) {
  if (!posts.length) return <EmptyFeed loading={loading} language={language} />;
  const lead = posts[0];
  return (
    <div className="rc-salon-layout">
      <button className="rc-salon-lead" type="button" onClick={() => onOpen(lead)}>
        <img src={postImage(lead, 0)} alt="" />
        <div className="rc-salon-lead-copy">
          <CategoryMark post={lead} />
          <h2>{lead.title}</h2>
          <p>{previewText(lead)}</p>
          <PostMeta post={lead} language={language} />
        </div>
      </button>
      <div className="rc-salon-ribbon" aria-hidden="true">
        <span>LOOK CLOSER</span><i /> <span>LEAVE A NOTE</span><i /> <span>RETURN DIFFERENT</span>
      </div>
      <section className="rc-salon-cards">
        {posts.slice(1).map((post, index) => (
          <motion.button
            type="button"
            key={post.id}
            onClick={() => onOpen(post)}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 6) * 0.05 }}
          >
            <img src={postImage(post, index + 1)} alt="" />
            <div><CategoryMark post={post} /><h3>{post.title}</h3><p>{previewText(post)}</p><PostMeta post={post} language={language} /></div>
          </motion.button>
        ))}
      </section>
    </div>
  );
}

function CriticsIndexView({ posts, loading, language, onOpen }: StudyViewProps) {
  if (!posts.length) return <EmptyFeed loading={loading} language={language} />;
  return (
    <div className="rc-index-layout">
      <div className="rc-index-head" aria-hidden="true"><span>NO.</span><span>SUBJECT / NOTE</span><span>AUTHOR</span><span>RESPONSE</span></div>
      {posts.map((post, index) => (
        <motion.button
          type="button"
          key={post.id}
          onClick={() => onOpen(post)}
          initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
          animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
          transition={{ delay: Math.min(index, 8) * 0.025, duration: 0.38 }}
        >
          <span className="rc-index-number">{String(index + 1).padStart(2, "0")}</span>
          <span className="rc-index-subject"><CategoryMark post={post} /><strong>{post.title}</strong><small>{previewText(post)}</small></span>
          <span className="rc-index-author">{post.authorName}<small>{formatDate(post.createdAt, language)}</small></span>
          <span className="rc-index-response">{post.likes + post.commentCount}<small>{language === "ko" ? "반응" : "signals"}</small></span>
        </motion.button>
      ))}
    </div>
  );
}

function AfterimageGalleryView({ posts, loading, language, onOpen }: StudyViewProps) {
  if (!posts.length) return <EmptyFeed loading={loading} language={language} />;
  return (
    <div className="rc-afterimage-layout">
      {posts.map((post, index) => (
        <motion.button
          type="button"
          key={post.id}
          className={index === 0 ? "is-featured" : ""}
          onClick={() => onOpen(post)}
          initial={{ opacity: 0, scale: 0.975 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: Math.min(index, 6) * 0.055, duration: 0.55 }}
        >
          <img src={postImage(post, index)} alt="" />
          <div className="rc-afterimage-shade" />
          <div className="rc-afterimage-copy"><CategoryMark post={post} /><h2>{post.title}</h2><PostMeta post={post} language={language} /></div>
        </motion.button>
      ))}
    </div>
  );
}

function CivicForumView({ posts, loading, language, onOpen }: StudyViewProps) {
  if (!posts.length) return <EmptyFeed loading={loading} language={language} />;
  return (
    <section className="rc-forum-layout" aria-label={language === "ko" ? "커뮤니티 게시글" : "Community posts"}>
      <div className="rc-forum-head"><span>{language === "ko" ? "주제" : "Topic"}</span><span>{language === "ko" ? "작성자" : "Author"}</span><span>{language === "ko" ? "활동" : "Activity"}</span></div>
      {posts.map((post, index) => (
        <motion.button
          type="button"
          key={post.id}
          onClick={() => onOpen(post)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index, 8) * 0.03 }}
        >
          <span className="rc-forum-topic"><CategoryMark post={post} /><strong>{post.title}</strong><small>{previewText(post)}</small></span>
          <span className="rc-forum-author">{post.authorName}<small>{formatDate(post.createdAt, language)}</small></span>
          <span className="rc-forum-activity"><strong>{post.commentCount}</strong><small>{language === "ko" ? "댓글" : "replies"}</small></span>
        </motion.button>
      ))}
    </section>
  );
}

function CollectionGridView({ posts, loading, language, onOpen }: StudyViewProps) {
  if (!posts.length) return <EmptyFeed loading={loading} language={language} />;
  return (
    <div className="rc-collection-layout">
      {posts.map((post, index) => (
        <motion.button
          type="button"
          key={post.id}
          className={index === 0 ? "is-lead" : index === 3 ? "is-wide" : ""}
          onClick={() => onOpen(post)}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(index, 7) * 0.04 }}
        >
          {(index === 0 || index === 3) && <img src={postImage(post, index)} alt="" />}
          <div><span className="rc-grid-coordinate">C{index + 1} / {String(post.likes).padStart(3, "0")}</span><CategoryMark post={post} /><h2>{post.title}</h2><p>{previewText(post)}</p><PostMeta post={post} language={language} /></div>
        </motion.button>
      ))}
    </div>
  );
}

function StudyView({ slug, ...props }: StudyViewProps & { slug: string }) {
  if (slug === "salon-stream") return <SalonStreamView {...props} />;
  if (slug === "critics-index") return <CriticsIndexView {...props} />;
  if (slug === "afterimage-gallery") return <AfterimageGalleryView {...props} />;
  if (slug === "civic-forum") return <CivicForumView {...props} />;
  if (slug === "collection-grid") return <CollectionGridView {...props} />;
  return <LivingArchiveView {...props} />;
}

export default function CommunityStudiesApp() {
  const { study: studyParam } = useParams();
  const study = getCommunityStudy(studyParam);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { language, toggleLanguage, t } = useLanguage();
  const [sort, setSort] = useState<CommunitySort>("latest");
  const [category, setCategory] = useState<CommunityCategory>("리뷰");
  const [filter, setFilter] = useState<CommunityHeaderType>("all");
  const [nearby, setNearby] = useState(false);
  const { posts, loading } = useCommunityFeed(sort);
  const visiblePosts = useMemo(() => filterCommunityPosts(posts, category, filter), [posts, category, filter]);
  const [isLight, setIsLight] = useState(() => {
    try { return localStorage.getItem("homeTheme") === "light"; } catch { return false; }
  });

  useEffect(() => {
    const syncTheme = () => {
      try { setIsLight(localStorage.getItem("homeTheme") === "light"); } catch { setIsLight(false); }
    };
    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [study.slug]);

  const selectCategory = (next: CommunityCategory) => {
    setNearby(false);
    setCategory(next);
    if (next !== "리뷰") setFilter("all");
  };

  return (
    <div className={`rc-page rc-page--${study.slug}`} data-light={isLight || undefined}>
      <header className="rc-global-header">
        <Link to="/redesign" className="rc-wordmark">COLLY <span>/ COMMUNITY</span></Link>
        <div className="rc-study-identity"><span>06 STUDIES</span><strong>{study.title}</strong></div>
        <div className="rc-header-actions">
          <a href="/community">{t({ ko: "현재 커뮤니티", en: "Current community" })}</a>
          <button type="button" onClick={toggleLanguage} aria-label={t({ ko: "언어 전환", en: "Change language" })}>{language.toUpperCase()}</button>
        </div>
      </header>

      <nav className="rc-study-nav" aria-label={t({ ko: "커뮤니티 디자인 시안", en: "Community design studies" })}>
        {COMMUNITY_STUDIES.map((item, index) => (
          <Link key={item.slug} className={item.slug === study.slug ? "is-active" : ""} to={buildCommunityStudyPath(item.slug)}>
            <span>{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong>
          </Link>
        ))}
      </nav>

      <main className="rc-main">
        <section className="rc-intro">
          <div>
            <span className="rc-intro-kicker">{study.skill}</span>
            <h1>{study.title}</h1>
          </div>
          <p>{language === "ko" ? {
            "living-archive": "관람 이후의 생각을 살아 있는 기록처럼 읽습니다.",
            "salon-stream": "한 편의 대화가 다음 대화를 여는 느슨한 살롱입니다.",
            "critics-index": "의견과 반응을 빠르게 비교하는 비평의 색인입니다.",
            "afterimage-gallery": "이미지의 잔상에서 대화가 시작되는 커뮤니티입니다.",
            "civic-forum": "누구나 명확하게 읽고 참여할 수 있는 열린 포럼입니다.",
            "collection-grid": "서로 다른 목소리를 수집하고 재배열하는 모듈형 피드입니다.",
          }[study.slug] : study.note}</p>
          <button className="rc-write-action" type="button" onClick={() => navigate("/community/write")}>
            <span>＋</span>{t({ ko: "새 글 작성", en: "Write a post" })}
          </button>
        </section>

        <section className="rc-controls" aria-label={t({ ko: "커뮤니티 필터", en: "Community filters" })}>
          <div className="rc-sort-control">
            <button type="button" className={sort === "latest" ? "is-active" : ""} onClick={() => setSort("latest")}>{t({ ko: "최신", en: "Latest" })}</button>
            <button type="button" className={sort === "popular" ? "is-active" : ""} onClick={() => setSort("popular")}>{t({ ko: "인기", en: "Popular" })}</button>
          </div>
          <div className="rc-category-control">
            <button type="button" className={nearby ? "is-active" : ""} onClick={() => setNearby(true)}>{t({ ko: "주변 전시", en: "Nearby" })}</button>
            {COMMUNITY_CATEGORIES.map((item) => (
              <button type="button" key={item} className={!nearby && item === category ? "is-active" : ""} onClick={() => selectCategory(item)}>{t(categoryLabels[item])}</button>
            ))}
          </div>
          {!nearby && category === "리뷰" && (
            <div className="rc-filter-control">
              {filters.map((item) => <button type="button" key={item} className={item === filter ? "is-active" : ""} onClick={() => setFilter(item)}>{t(filterLabels[item])}</button>)}
            </div>
          )}
        </section>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${study.slug}-${nearby ? "nearby" : `${sort}-${category}-${filter}`}`}
            className="rc-view-stage"
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: reducedMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {nearby ? (
              <div className="rc-nearby-stage"><NearbyExhibitions isLight={isLight} language={language} /></div>
            ) : (
              <StudyView
                slug={study.slug}
                posts={visiblePosts}
                loading={loading}
                language={language}
                onOpen={(post) => navigate(`/community/post/${post.id}`)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
