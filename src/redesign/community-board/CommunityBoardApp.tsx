import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import {
  COMMUNITY_BOARD_STUDIES,
  buildCommunityBoardPath,
  getCommunityBoardStudy,
} from "./model";
import "./community-board.css";

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

const REVIEW_TARGETS: CommunityHeaderType[] = ["all", "museum", "artist", "artwork", "exhibition"];
const targetLabels: Record<CommunityHeaderType, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  museum: { ko: "미술관", en: "Museum" },
  artist: { ko: "작가", en: "Artist" },
  artwork: { ko: "작품", en: "Artwork" },
  exhibition: { ko: "전시", en: "Exhibition" },
};

type CategoryView = "all" | CommunityCategory;

function thumbUrl(post: CommunityFeedPost, index: number, width = 320): string {
  return getOptimizedImageUrl(post.header?.image || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length], width);
}

function previewText(post: CommunityFeedPost, max = 110): string {
  const raw = post.contentSnippet || post.content || "";
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function formatDate(value: Date, language: "ko" | "en"): string {
  const hours = Math.max(0, Math.floor((Date.now() - value.getTime()) / 3_600_000));
  if (hours < 1) return language === "ko" ? "방금" : "now";
  if (hours < 24) return language === "ko" ? hours + "시간" : hours + "h";
  return value.toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { month: "numeric", day: "numeric" });
}

function catOf(post: CommunityFeedPost): CommunityCategory {
  return normalizeCommunityCategory(post.category);
}

function rowStyle(post: CommunityFeedPost): CSSProperties {
  return { "--cb-cat": COMMUNITY_CATEGORY_COLORS[catOf(post)] } as CSSProperties;
}

function label(item: CommunityCategory, language: "ko" | "en") {
  return language === "ko" ? categoryLabels[item].ko : categoryLabels[item].en;
}

function Thumb({ post, index, size }: { post: CommunityFeedPost; index: number; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      className="cb-thumb"
      src={failed ? FALLBACK_IMAGES[index % FALLBACK_IMAGES.length] : thumbUrl(post, index)}
      onError={() => setFailed(true)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}

/* The rail is identical in all five - only the list below it changes. */
function RailNav({ counts, total, category, onCategory, language }: {
  counts: Record<CommunityCategory, number>;
  total: number;
  category: CategoryView;
  onCategory: (next: CategoryView) => void;
  language: "ko" | "en";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const order: CategoryView[] = ["all", ...COMMUNITY_CATEGORIES];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = order[(order.indexOf(category) + step + order.length) % order.length];
    onCategory(next);
    ref.current?.querySelectorAll("button")[order.indexOf(next)]?.focus();
  };

  return (
    <div
      className="cb-rail-nav"
      ref={ref}
      role="tablist"
      aria-orientation="vertical"
      aria-label={language === "ko" ? "분류" : "Category"}
      onKeyDown={onKeyDown}
    >
      <button
        type="button" role="tab"
        aria-selected={category === "all"}
        tabIndex={category === "all" ? 0 : -1}
        className={category === "all" ? "is-active" : ""}
        style={{ "--cb-cat": "#d4a547" } as CSSProperties}
        onClick={() => onCategory("all")}
      >
        <span>{language === "ko" ? "전체" : "All"}</span>
        <i>{total}</i>
      </button>
      {COMMUNITY_CATEGORIES.map((item) => {
        const active = item === category;
        return (
          <button
            key={item}
            type="button" role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={active ? "is-active" : ""}
            style={{ "--cb-cat": COMMUNITY_CATEGORY_COLORS[item] } as CSSProperties}
            onClick={() => onCategory(item)}
          >
            <span>{label(item, language)}</span>
            <i>{counts[item]}</i>
          </button>
        );
      })}
    </div>
  );
}

interface ListProps {
  posts: CommunityFeedPost[];
  language: "ko" | "en";
  onOpen: (post: CommunityFeedPost) => void;
}

/* 01 · TIGHT — 36px thumb, 48px row, category reduced to a dot. */
function TightList({ posts, language, onOpen }: ListProps) {
  return (
    <ul className="cb-list cb-list--tight">
      {posts.map((post, index) => (
        <li key={post.id} style={rowStyle(post)}>
          <button type="button" onClick={() => onOpen(post)}>
            <Thumb post={post} index={index} size={36} />
            <span className="cb-dot" aria-hidden="true" />
            <b>{post.title}</b>
            <span className="cb-by">{post.authorName}</span>
            <span className="cb-date">{formatDate(post.createdAt, language)}</span>
            <span className="cb-n">{post.likes}</span>
            <span className="cb-n">{post.commentCount}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* 02 · GALLERY — 72px thumb, 92px row, excerpt kept. */
function GalleryList({ posts, language, onOpen }: ListProps) {
  return (
    <ul className="cb-list cb-list--gallery">
      {posts.map((post, index) => (
        <li key={post.id} style={rowStyle(post)}>
          <button type="button" onClick={() => onOpen(post)}>
            <Thumb post={post} index={index} size={72} />
            <span className="cb-body">
              <span className="cb-chip">{catOf(post)}</span>
              <b>{post.title}</b>
              <small>{previewText(post, 120)}</small>
            </span>
            <span className="cb-side">
              <span className="cb-meta">{post.authorName} · {formatDate(post.createdAt, language)}</span>
              <span className="cb-counts"><i>♥ {post.likes}</i><i>↳ {post.commentCount}</i></span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* 03 · ALIGNED — author, date and counts as fixed columns under micro headers. */
function AlignedList({ posts, language, onOpen }: ListProps) {
  return (
    <div className="cb-aligned">
      <div className="cb-aligned-head" aria-hidden="true">
        <span /><span>{language === "ko" ? "제목" : "Title"}</span>
        <span>{language === "ko" ? "글쓴이" : "Author"}</span>
        <span>{language === "ko" ? "날짜" : "Date"}</span>
        <span>♥</span><span>{language === "ko" ? "댓글" : "Re"}</span>
      </div>
      <ul className="cb-list cb-list--aligned">
        {posts.map((post, index) => (
          <li key={post.id} style={rowStyle(post)}>
            <button type="button" onClick={() => onOpen(post)}>
              <Thumb post={post} index={index} size={40} />
              <span className="cb-body">
                <span className="cb-chip">{catOf(post)}</span>
                <b>{post.title}</b>
              </span>
              <span className="cb-by">{post.authorName}</span>
              <span className="cb-date">{formatDate(post.createdAt, language)}</span>
              <span className="cb-n">{post.likes}</span>
              <span className="cb-n">{post.commentCount}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 04 · QUIET — no chip, small thumb, roomy leading. */
function QuietList({ posts, language, onOpen }: ListProps) {
  return (
    <ul className="cb-list cb-list--quiet">
      {posts.map((post, index) => (
        <li key={post.id} style={rowStyle(post)}>
          <button type="button" onClick={() => onOpen(post)}>
            <Thumb post={post} index={index} size={28} />
            <span className="cb-body">
              <b>{post.title}</b>
              <small>
                {post.authorName} · {formatDate(post.createdAt, language)} ·{" "}
                {language === "ko" ? "좋아요" : "likes"} {post.likes} ·{" "}
                {language === "ko" ? "댓글" : "replies"} {post.commentCount}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* 05 · SIGNAL — likes + replies merged into one activity figure with a bar. */
function SignalList({ posts, language, onOpen }: ListProps) {
  const max = Math.max(1, ...posts.map((post) => post.likes + post.commentCount * 2));
  return (
    <ul className="cb-list cb-list--signal">
      {posts.map((post, index) => {
        const activity = post.likes + post.commentCount * 2;
        const hot = post.likes >= 100 || post.commentCount >= 50;
        return (
          <li key={post.id} style={rowStyle(post)} data-hot={hot || undefined}>
            <button type="button" onClick={() => onOpen(post)}>
              <Thumb post={post} index={index} size={48} />
              <span className="cb-body">
                <b>{post.title}</b>
                <small>{post.authorName} · {formatDate(post.createdAt, language)}</small>
              </span>
              <span className="cb-activity">
                <span className="cb-activity-figure">
                  <strong>{activity}</strong>
                  <em>{language === "ko" ? "반응" : "signal"}</em>
                </span>
                <span className="cb-activity-bar" aria-hidden="true">
                  <i style={{ width: Math.round((activity / max) * 100) + "%" }} />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BoardList({ slug, ...props }: ListProps & { slug: string }) {
  if (slug === "gallery") return <GalleryList {...props} />;
  if (slug === "aligned") return <AlignedList {...props} />;
  if (slug === "quiet") return <QuietList {...props} />;
  if (slug === "signal") return <SignalList {...props} />;
  return <TightList {...props} />;
}

export default function CommunityBoardApp() {
  const { study: studyParam } = useParams();
  const study = getCommunityBoardStudy(studyParam);
  const navigate = useNavigate();
  const { language, toggleLanguage, t } = useLanguage();
  const [sort, setSort] = useState<CommunitySort>("latest");
  const [category, setCategory] = useState<CategoryView>("all");
  const [target, setTarget] = useState<CommunityHeaderType>("all");
  const { posts, loading } = useCommunityFeed(sort);

  const [isLight, setIsLight] = useState(() => {
    try { return localStorage.getItem("homeTheme") === "light"; } catch { return false; }
  });
  useEffect(() => {
    const sync = () => {
      try { setIsLight(localStorage.getItem("homeTheme") === "light"); } catch { setIsLight(false); }
    };
    window.addEventListener("theme-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("theme-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const counts = useMemo(() => {
    const base = Object.fromEntries(COMMUNITY_CATEGORIES.map((item) => [item, 0])) as Record<CommunityCategory, number>;
    posts.forEach((post) => { base[catOf(post)] += 1; });
    return base;
  }, [posts]);

  const visiblePosts = useMemo(
    () => (category === "all" ? posts : filterCommunityPosts(posts, category, target)),
    [posts, category, target],
  );

  return (
    <div className={"cb-page cb-page--" + study.slug} data-light={isLight || undefined}>
      <header className="cb-header">
        <Link to="/redesign" className="cb-wordmark">COLLY <span>/ BOARD</span></Link>
        <div className="cb-identity"><span>05 STUDIES</span><strong>{language === "ko" ? study.titleKo : study.title}</strong></div>
        <div className="cb-header-actions">
          <a href="/community">{t({ ko: "현재 커뮤니티", en: "Current community" })}</a>
          <button type="button" onClick={toggleLanguage}>{language === "ko" ? "EN" : "KR"}</button>
        </div>
      </header>

      <nav className="cb-study-nav" aria-label={t({ ko: "보드 시안", en: "Board studies" })}>
        {COMMUNITY_BOARD_STUDIES.map((item, index) => (
          <Link key={item.slug} to={buildCommunityBoardPath(item.slug)}
            className={item.slug === study.slug ? "is-active" : ""}
            aria-current={item.slug === study.slug ? "page" : undefined}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{language === "ko" ? item.titleKo : item.title}</strong>
          </Link>
        ))}
      </nav>

      <main className="cb-main">
        <section className="cb-intro">
          <div>
            <span className="cb-kicker">{study.skills}</span>
            <h1>{language === "ko" ? study.titleKo : study.title}</h1>
            <p>{language === "ko" ? study.noteKo : study.note}</p>
          </div>
          <button className="cb-write" type="button" onClick={() => navigate("/community/write")}>
            <span aria-hidden="true">＋</span>{t({ ko: "새 글", en: "Write" })}
          </button>
        </section>

        <div className="cb-body">
          <RailNav
            counts={counts}
            total={posts.length}
            category={category}
            onCategory={(next) => { setCategory(next); if (next !== "리뷰") setTarget("all"); }}
            language={language}
          />

          <div>
            <div className="cb-sort" role="group" aria-label={t({ ko: "정렬", en: "Sort" })}>
              <button type="button" className={sort === "latest" ? "is-active" : ""} onClick={() => setSort("latest")}>{t({ ko: "최신", en: "Latest" })}</button>
              <button type="button" className={sort === "popular" ? "is-active" : ""} onClick={() => setSort("popular")}>{t({ ko: "인기", en: "Popular" })}</button>
            </div>

            {category === "리뷰" && (
              <div className="cb-target" role="group" aria-label={t({ ko: "리뷰 대상", en: "Review target" })}>
                {REVIEW_TARGETS.map((item) => (
                  <button key={item} type="button"
                    aria-pressed={target === item}
                    className={target === item ? "is-active" : ""}
                    onClick={() => setTarget(item)}>
                    {language === "ko" ? targetLabels[item].ko : targetLabels[item].en}
                  </button>
                ))}
              </div>
            )}

            {visiblePosts.length === 0 ? (
              <p className="cb-empty" role="status" aria-live="polite">
                {loading
                  ? (language === "ko" ? "불러오는 중…" : "Loading…")
                  : (language === "ko" ? "이 분류에는 아직 글이 없습니다." : "No posts in this category yet.")}
              </p>
            ) : (
              <BoardList
                slug={study.slug}
                posts={visiblePosts}
                language={language}
                onOpen={(post) => navigate("/community/post/" + post.id)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
