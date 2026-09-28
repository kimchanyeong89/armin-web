import { useMemo } from "react";
import { ListMusic, MapPin, PenLine, TrendingUp } from "lucide-react";
import { RankAvatar } from "../../../components/RankAvatar";
import NearbyExhibitions from "../../../components/NearbyExhibitions";
import {
  COMMUNITY_CATEGORIES,
  filterCommunityPosts,
  normalizeCommunityCategory,
  type CommunityCategory,
  type CommunityFeedPost,
  type CommunityHeaderType,
  type CommunitySort,
} from "../../../features/community/communityFeed";
import { getOptimizedImageUrl } from "../../../utils/imageProxy";
import { textOf } from "./prose";
import { CATEGORY_LABEL, TARGET_LABEL, ago, catStyle } from "./shared";
import PlaylistShelf from "./PlaylistShelf";

export interface FeedState {
  sort: CommunitySort;
  category: "all" | CommunityCategory;
  target: CommunityHeaderType;
  nearby: boolean;
  /** the shelf of playlists their owners made public, shown in place of the posts */
  playlists?: boolean;
}

const TARGETS: CommunityHeaderType[] = ["all", "museum", "artist", "artwork", "exhibition"];

/**
 * The live board, element by element: the same title, sort, rail, Nearby and
 * Write, review targets, columns and rows. Chips give way to type and
 * hairlines — each category keeps its colour as a point and a label — and
 * the AI tab's point marks what is chosen and draws itself out on the row
 * pointed at.
 */
export default function Feed({ posts, loading, ko, language, isLight = false, state, set, onOpen, onWrite }: {
  posts: CommunityFeedPost[];
  loading: boolean;
  ko: boolean;
  language: string;
  isLight?: boolean;
  state: FeedState;
  set: (patch: Partial<FeedState>) => void;
  onOpen: (post: CommunityFeedPost) => void;
  onWrite: () => void;
}) {
  const counts = useMemo(() => {
    const c = Object.fromEntries(COMMUNITY_CATEGORIES.map((k) => [k, 0])) as Record<CommunityCategory, number>;
    posts.forEach((p) => { c[normalizeCommunityCategory(p.category)] += 1; });
    return c;
  }, [posts]);
  const visible = useMemo(
    () => (state.category === "all" ? posts : filterCommunityPosts(posts, state.category, state.target)),
    [posts, state.category, state.target],
  );
  const excerpts = useMemo(
    () => new Map(visible.map((p) => [p.id, textOf(p.content || p.contentSnippet || "", 90)])),
    [visible],
  );
  const label = (c: CommunityCategory) => (ko ? CATEGORY_LABEL[c].ko : CATEGORY_LABEL[c].en);
  const rail: ("all" | CommunityCategory)[] = ["all", ...COMMUNITY_CATEGORIES];

  return (
    <div className="ca-feed">
      {/* the tab's own words, set as the AI tab sets its own: a gold label,
          a line, and what the board is for */}
      <section className="ca-statement colly-rise">
        <p className="ca-statement__meta">{ko ? "커뮤니티" : "COMMUNITY"}</p>
        <h1>{ko ? "전시를 본 사람들의 이야기." : "What people saw, in their words."}</h1>
        <p>{ko
          ? "관람 후기와 전시 소식, 궁금한 점을 나누는 곳입니다. 주변 전시와 다른 사람의 플레이리스트도 여기서 볼 수 있습니다."
          : "Reviews, exhibition news and questions from people who went. Nearby shows and shared playlists live here too."}</p>
      </section>

      <section className="ca-lead">
        <div>
          <div className="ca-sort" role="group" aria-label={ko ? "정렬" : "Sort"} data-i={state.sort === "popular" ? 1 : 0}>
            <button type="button" aria-pressed={state.sort === "latest"} onClick={() => set({ sort: "latest" })}>
              {ko ? "최신" : "Latest"}
            </button>
            <button type="button" aria-pressed={state.sort === "popular"} onClick={() => set({ sort: "popular" })}>
              {ko ? "인기" : "Popular"}
            </button>
            <i className="ca-sort__bar" aria-hidden="true" />
          </div>
        </div>
        <div className="ca-acts">
          <button type="button" className="ca-act" aria-pressed={!!state.playlists} onClick={() => set({ playlists: !state.playlists, nearby: false })}>
            <ListMusic size={13} strokeWidth={1.8} /><span>{ko ? "플레이리스트" : "Playlists"}</span>
          </button>
          <button type="button" className="ca-act" aria-pressed={state.nearby} onClick={() => set({ nearby: !state.nearby, playlists: false })}>
            <MapPin size={13} strokeWidth={1.8} /><span>{ko ? "주변 전시" : "Nearby"}</span>
          </button>
          <button type="button" className="ca-act ca-act--write" onClick={onWrite}>
            <PenLine size={13} strokeWidth={1.8} /><span>{ko ? "새 글" : "Write"}</span>
          </button>
        </div>
      </section>

      <div className="ca-body">
        <div className="ca-rail" role="tablist" aria-label={ko ? "분류" : "Category"}>
          {rail.map((c) => {
            const on = !state.nearby && !state.playlists && state.category === c;
            return (
              <button key={c} type="button" role="tab" aria-selected={on} style={c === "all" ? undefined : catStyle(c)}
                onClick={() => set({ category: c, nearby: false, playlists: false, target: c === "리뷰" ? state.target : "all" })}>
                <span className="ca-pt" aria-hidden="true"><i /></span>
                <span>{c === "all" ? (ko ? "전체" : "All") : label(c)}</span>
                <b>{c === "all" ? posts.length : counts[c]}</b>
              </button>
            );
          })}
        </div>

        <div className="ca-board">
          {state.playlists ? (
            <PlaylistShelf ko={ko} />
          ) : state.nearby ? (
            <div className="ca-nearby"><NearbyExhibitions isLight={isLight} language={language} /></div>
          ) : (
            <>
              {state.category === "리뷰" && (
                <div className="ca-targets" role="group" aria-label={ko ? "리뷰 대상" : "Review target"}>
                  {TARGETS.map((t) => (
                    <button key={t} type="button" aria-pressed={state.target === t} onClick={() => set({ target: t })}>
                      {ko ? TARGET_LABEL[t].ko : TARGET_LABEL[t].en}
                    </button>
                  ))}
                </div>
              )}
              <div className="ca-cols" aria-hidden="true">
                <span />
                <span>{ko ? "제목" : "Title"}</span>
                <span>{ko ? "글쓴이" : "Author"}</span>
                <span>{ko ? "날짜" : "Date"}</span>
                <span>♥</span>
                <span>{ko ? "댓글" : "Re"}</span>
              </div>
              {visible.length === 0 ? (
                <p className="ca-empty" role="status" aria-live="polite">
                  {loading
                    ? (ko ? "불러오는 중…" : "Loading…")
                    : state.category === "all"
                      ? (ko ? "아직 게시글이 없습니다." : "No posts yet.")
                      : ko ? `${label(state.category)} 카테고리에 게시글이 없습니다.` : `No posts in ${label(state.category)}.`}
                </p>
              ) : (
                <ul className="ca-rows">
                  {visible.map((post) => {
                    const cat = normalizeCommunityCategory(post.category);
                    const hot = post.likes >= 100 || post.commentCount >= 50;
                    const name = post.authorName || (ko ? "익명" : "Unknown");
                    const img = post.header?.image;
                    return (
                      <li key={post.id}>
                        <button type="button" className="ca-row" style={catStyle(cat)} onClick={() => onOpen(post)}>
                          <span className="ca-row__thumb">
                            {img && (
                              <img src={getOptimizedImageUrl(img, 120)} alt="" loading="lazy" decoding="async"
                                onError={(e) => { e.currentTarget.style.display = "none"; }} />
                            )}
                          </span>
                          <span className="ca-row__main">
                            <span className="ca-row__cat">
                              <span className="ca-pt" aria-hidden="true"><i /></span>
                              {label(cat)}
                              {hot && <em className="ca-hot"><TrendingUp size={10} strokeWidth={2} />{ko ? "인기" : "HOT"}</em>}
                            </span>
                            <span className="ca-row__title">{post.title}</span>
                            <span className="ca-row__ex">{excerpts.get(post.id) || (ko ? "내용 미리보기가 없습니다." : "No preview available.")}</span>
                            <span className="ca-row__meta">{name} · {ago(post.createdAt, ko)}</span>
                          </span>
                          <span className="ca-row__by">
                            <RankAvatar rank={post.authorRank} name={name} src={post.authorPhotoURL || post.authorPhoto} crop={post.authorPhotoCrop} size={18} />
                            <span>{name}</span>
                          </span>
                          <span className="ca-row__date">{ago(post.createdAt, ko)}</span>
                          <span className="ca-row__n">{post.likes}</span>
                          <span className="ca-row__n">{post.commentCount}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
