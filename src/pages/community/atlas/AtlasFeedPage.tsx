import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useCommunityFeed } from "../../../features/community/useCommunityFeed";
import { shownAuthor, syncPublicProfile, usePublicProfiles } from "../../../features/community/publicProfile";
import { resolveCommunityRank } from "../../../utils/communityRank";
import Feed, { type FeedState, type FeedView } from "./Feed";
import { useBlockedUsers } from "../../../features/community/moderation";
import { useHomeTheme } from "./shared";
import "./atlas.css";

/** /community — the live board, drawn by the shared Feed. */
export default function AtlasFeedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isLight = useHomeTheme();
  const [params, setParams] = useSearchParams();
  /* the room is kept in the address, so coming back from a collector, a
     playlist or an exhibition returns to it. "collectors" and "playlists" are
     the addresses the curation room had before. */
  const roomOf = (v: string | null): FeedView =>
    v === "curation" || v === "collectors" || v === "playlists" ? "curation" : v === "exhibitions" ? "exhibitions" : "posts";
  const [state, setState] = useState<FeedState>(() => ({
    sort: "latest", category: "all", target: "all", view: roomOf(params.get("view")),
  }));
  const set = (patch: Partial<FeedState>) => {
    setState((s) => ({ ...s, ...patch }));
    if (patch.view !== undefined) setParams(patch.view === "posts" ? {} : { view: patch.view }, { replace: true });
  };
  const { posts, loading } = useCommunityFeed(state.sort);
  const { blocked } = useBlockedUsers();
  /* a signed-in reader's own card is brought up to date as they arrive */
  useEffect(() => {
    if (user && !user.isAnonymous) syncPublicProfile(user).catch(() => {});
  }, [user]);
  const cards = usePublicProfiles(posts.map((p) => p.authorId));
  /* each author as their public card shows them now; without a card, as the post
     stored them, with the rank earned from likes and replies */
  const shown = useMemo(
    () => posts.filter((p) => !p.authorId || !blocked.has(p.authorId)).map((p) => {
      const author = shownAuthor(p.authorId ? cards[p.authorId] : undefined, {
        name: p.authorName,
        photo: p.authorPhotoURL || p.authorPhoto,
        rank: resolveCommunityRank(p.authorRank, p.likes, p.commentCount),
      });
      return {
        ...p,
        authorName: author.name,
        authorPhotoURL: author.photo,
        authorPhoto: author.photo,
        authorPhotoCrop: author.crop,
        authorRank: author.rank,
      };
    }),
    [posts, cards, blocked],
  );

  return (
    <div className="ca ca--app" data-light={isLight || undefined}>
      <main className="ca-main">
        <Feed posts={shown} loading={loading} ko={language === "ko"} language={language} isLight={isLight}
          state={state} set={set}
          onOpen={(p) => navigate(`/community/post/${p.id}`)}
          onWrite={() => navigate("/community/write")} />
      </main>
    </div>
  );
}
