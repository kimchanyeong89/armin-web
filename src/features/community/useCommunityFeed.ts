import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import {
  mergeCommunityPosts,
  SAMPLE_COMMUNITY_FEED_POSTS,
  sortCommunityPosts,
  toCommunityFeedPost,
} from "./communityFeed";
import type { CommunityFeedPost, CommunitySort } from "./communityFeed";

export function useCommunityFeed(sort: CommunitySort) {
  const [posts, setPosts] = useState<CommunityFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [remotePostsDisabled, setRemotePostsDisabled] = useState(false);

  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      const useSamples = () => setPosts(sortCommunityPosts(SAMPLE_COMMUNITY_FEED_POSTS, sort));

      if (remotePostsDisabled) {
        useSamples();
        setLoading(false);
        return;
      }

      try {
        const postsRef = collection(db, "community_posts");
        const postsQuery = sort === "popular"
          ? query(postsRef, orderBy("likes", "desc"), limit(80))
          : query(postsRef, orderBy("createdAt", "desc"), limit(80));
        const snapshot = await getDocs(postsQuery);
        const remotePosts = snapshot.docs.map((item) => toCommunityFeedPost(item.id, item.data()));
        setPosts(mergeCommunityPosts(remotePosts, sort));
      } catch (error) {
        const code = String((error as any)?.code || "");
        const message = String((error as any)?.message || "").toLowerCase();
        if (code.includes("permission-denied") || message.includes("insufficient permissions")) {
          setRemotePostsDisabled(true);
          useSamples();
        } else {
          console.error("Error fetching posts:", error);
          useSamples();
        }
      } finally {
        setLoading(false);
      }
    };

    void loadPosts();
  }, [remotePostsDisabled, sort]);

  return { posts, loading };
}
