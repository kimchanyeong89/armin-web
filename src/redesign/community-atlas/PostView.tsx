import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import type { CommunityFeedPost } from "../../features/community/communityFeed";
import PostArticle, { type ArticleComment } from "../../pages/community/atlas/PostArticle";
import { ME, type StudyStore } from "./store";

/**
 * The study's post: the shared PostArticle, fed from the feed already in
 * hand and the post's real comments (read once — reading is public). Likes
 * and comments made here go to the study's local store.
 */
export default function PostView({ posts, loading, ko, store, onBack }: {
  posts: CommunityFeedPost[];
  loading: boolean;
  ko: boolean;
  store: StudyStore;
  onBack: () => void;
}) {
  const { id = "" } = useParams();
  const post = posts.find((p) => p.id === id);
  const mine = store.posts.some((p) => p.id === id);
  const [remote, setRemote] = useState<ArticleComment[]>([]);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    setRemote([]);
    if (!id || mine || id.startsWith("sample-")) return;
    let alive = true;
    getDocs(query(collection(db, "community_posts", id, "comments"), orderBy("createdAt", "desc")))
      .then((snap) => {
        if (!alive) return;
        setRemote(snap.docs.map((d) => {
          const c = d.data();
          return {
            id: d.id,
            name: String(c.authorName || ""),
            photo: c.authorPhotoURL,
            rank: c.authorRank,
            text: String(c.text || ""),
            at: c.createdAt?.toDate ? c.createdAt.toDate() : null,
          };
        }));
      })
      .catch(() => { /* no comments shown */ });
    return () => { alive = false; };
  }, [id, mine]);

  if (!post) {
    return (
      <p className="ca-empty" role="status" aria-live="polite">
        {loading ? (ko ? "불러오는 중…" : "Loading…") : (ko ? "게시글을 찾을 수 없습니다." : "Post not found.")}
      </p>
    );
  }

  const local: ArticleComment[] = store.comments
    .filter((c) => c.postId === id)
    .map((c) => ({ id: c.id, name: ko ? ME.ko : ME.en, rank: "Lv.1 Observer", text: c.text, at: new Date(c.createdAt) }));
  const comments = [...local, ...remote].sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));

  return (
    <PostArticle
      post={{
        title: post.title,
        category: post.category,
        header: post.header,
        authorName: post.authorName || (ko ? "익명" : "Unknown"),
        authorPhoto: post.authorPhotoURL || post.authorPhoto,
        authorRank: post.authorRank,
        createdAt: post.createdAt,
        likes: post.likes,
        content: post.content || post.contentSnippet,
      }}
      ko={ko}
      comments={comments}
      commentCount={post.commentCount}
      liked={store.liked.includes(id)}
      onLike={() => store.toggleLike(id)}
      onComment={(text) => { store.addComment(id, text); return true; }}
      onBack={onBack}
      onDelete={mine ? () => {
        if (window.confirm(ko ? "이 글을 삭제할까요?" : "Delete this post?")) { store.remove(id); onBack(); }
      } : undefined}
    />
  );
}
