import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { sortCommunityPosts, type CommunityFeedPost } from "../../features/community/communityFeed";
import { useCommunityFeed } from "../../features/community/useCommunityFeed";
import Composer from "../../pages/community/atlas/Composer";
import Feed, { type FeedState } from "../../pages/community/atlas/Feed";
import PostView from "./PostView";
import { ME, useStudyStore } from "./store";
import "../../pages/community/atlas/atlas.css";

const BASE = "/redesign/community-atlas";

/**
 * The study shell around the shared community pages in
 * src/pages/community/atlas — the same board, composer and post as
 * /community, except that what is written here stays in this browser.
 */
export default function CommunityAtlasApp() {
  const { language, toggleLanguage } = useLanguage();
  const ko = language === "ko";
  const navigate = useNavigate();
  const store = useStudyStore();
  const [feed, setFeed] = useState<FeedState>({ sort: "latest", category: "all", target: "all", view: "posts" });
  const { posts: live, loading } = useCommunityFeed(feed.sort);

  /* the live feed with what was written here laid over it */
  const posts = useMemo(() => {
    const liked = (id: string) => (store.liked.includes(id) ? 1 : 0);
    const replies = (id: string) => store.comments.filter((c) => c.postId === id).length;
    const mine: CommunityFeedPost[] = store.posts.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      authorName: ko ? ME.ko : ME.en,
      authorRank: "Lv.1 Observer",
      createdAt: new Date(p.createdAt),
      likes: liked(p.id),
      commentCount: replies(p.id),
      content: p.content,
      header: p.header ?? { id: "none", type: "museum", name: "" },
    }));
    const theirs = live.map((p) => ({ ...p, likes: p.likes + liked(p.id), commentCount: p.commentCount + replies(p.id) }));
    return sortCommunityPosts([...mine, ...theirs], feed.sort);
  }, [live, store.posts, store.comments, store.liked, feed.sort, ko]);

  return (
    <div className="ca">
      <header className="ca-top">
        <Link to="/redesign" className="ca-wordmark">COLLY <span>/ {ko ? "커뮤니티" : "COMMUNITY"}</span></Link>
        <button type="button" className="ca-lang" onClick={toggleLanguage}>{ko ? "EN" : "KR"}</button>
      </header>
      <main className="ca-main">
        <Routes>
          <Route index element={
            <Feed posts={posts} loading={loading} ko={ko} language={language} state={feed}
              set={(patch) => setFeed((s) => ({ ...s, ...patch }))}
              onOpen={(p) => navigate(`${BASE}/post/${encodeURIComponent(p.id)}`)}
              onWrite={() => navigate(`${BASE}/write`)} />
          } />
          <Route path="write" element={
            <Composer ko={ko} onCancel={() => navigate(BASE)}
              onPublish={(p) => {
                const id = store.publish({ title: p.title, category: p.category, header: p.header, content: p.content });
                navigate(`${BASE}/post/${id}`, { replace: true });
              }} />
          } />
          <Route path="post/:id" element={
            <PostView posts={posts} loading={loading} ko={ko} store={store} onBack={() => navigate(BASE)} />
          } />
        </Routes>
      </main>
    </div>
  );
}
