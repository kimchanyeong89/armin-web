import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  getFirestore,
  collection,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  getCountFromServer,
  orderBy,
} from "firebase/firestore";
import {
  ArrowLeft,
  BookmarkPlus,
  Heart,
  ListMusic,
  MapPin,
  MessageCircle,
  Pencil,
  Play,
  ShoppingBag,
  User,
  Calendar,
  Palette,
} from "lucide-react";

import { ProductModal } from "./ProductModal";
import { ArtworkLightbox } from "../components/ArtworkLightbox";
import { exhibitions } from "../data/exhibitions";
import { findMuseumForArtwork, getExhibitionTokens, normalizeToken } from "../utils/museumUtils";
import { getOptimizedImageUrl } from "../utils/imageProxy";

import CommentModal from "./CommentModal";
import Slideshow from "./Slideshow";
import { PlaylistModal } from "./PlaylistModal";

type ViewMode = "artworks" | "exhibitions" | "museums" | "artists" | "playlists";
type SortMode = "recent" | "oldest" | "newest";

const RANKS = [
  { name: "Observer", threshold: 0, short: "Lv.1" },
  { name: "Seeker", threshold: 5, short: "Lv.2" },
  { name: "Collector", threshold: 15, short: "Lv.3" },
  { name: "Curator", threshold: 30, short: "Lv.4" },
  { name: "Gallerist", threshold: 60, short: "Lv.5" },
  { name: "Patron", threshold: 100, short: "Lv.6" },
  { name: "Visionary", threshold: 200, short: "Lv.7" },
];

export const getFallbackExhibitionIdForJson = (item: any): string => {
  if (item.exhibitionId) return item.exhibitionId;
  if (item.e) return item.e;

  const museum = findMuseumForArtwork(item, exhibitions);
  if (museum && museum.permanentExhibitions && museum.permanentExhibitions.length > 0) {
    const file = museum.permanentExhibitions[0].collectionFile;
    if (file) return file.replace(".json", "");
  }

  // Legacy hardcodes as last resort
  if (item.museumName || item.m) {
    const museumName = (item.museumName || item.m || "").toLowerCase();
    if (museumName.includes("brucke") || museumName.includes("brücke")) return "bruecke-museum-collection";
    if (museumName.includes("tate")) {
      if (museumName.includes("modern")) return "tate-modern-collection";
      if (museumName.includes("britain")) return "tate-britain-artworks";
      if (museumName.includes("st iv")) return "tate-st-ives-artworks";
      if (museumName.includes("liverpool")) return "tate-liverpool-artworks";
      return "tate-modern-collection";
    }
  }

  return "";
};

const _recoveredUrlsCache: Record<string, string | null> = {};

const MyPageImage = ({ item, width = 600, style }: { item: any; width?: number; style?: React.CSSProperties }) => {
  const [loaded, setLoaded] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [recoveredSrc, setRecoveredSrc] = useState<string | null>(null);
  const [hasFailedAll, setHasFailedAll] = useState(false);

  const exhId = getFallbackExhibitionIdForJson(item);
  const itemId = item.artworkId || item.id;

  const fallbackImages = useMemo(() => {
    const list: string[] = [];
    const mainImg = item.image || item.i || "";
    if (mainImg) list.push(mainImg);
    if (item.fallbackImages && Array.isArray(item.fallbackImages)) {
      list.push(...item.fallbackImages);
    }
    if (exhId && itemId) {
      list.push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/${exhId}/images/${itemId}.jpg`);
      list.push(`https://pub-396fad1f96754c2f816f260faf970e63.r2.dev/artworks/${itemId}.jpg`);
    }
    return Array.from(new Set(list)).filter(Boolean);
  }, [item, exhId, itemId]);

  const handleAdvancedRecovery = async () => {
    if (!exhId || !itemId) {
      setHasFailedAll(true);
      setLoaded(true);
      return;
    }
    
    const cacheKey = `${exhId}_${itemId}`;
    if (_recoveredUrlsCache[cacheKey] !== undefined) {
      const cached = _recoveredUrlsCache[cacheKey];
      if (cached) {
         setRecoveredSrc(cached);
      } else {
         setHasFailedAll(true);
         setLoaded(true);
      }
      return;
    }

    try {
      const res = await fetch(`/data/${exhId}.json`);
      if (res.ok) {
        const data = await res.json();
        const found = data.find((d: any) => d.id === itemId);
        const realImage = found?.imageUrl || found?.image || found?.original_imageUrl;
        if (realImage) {
          _recoveredUrlsCache[cacheKey] = realImage;
          setRecoveredSrc(realImage);
          return;
        }
      }
    } catch(e) {}
    
    _recoveredUrlsCache[cacheKey] = null;
    setHasFailedAll(true);
    setLoaded(true);
  };

  const currentRawSrc = recoveredSrc || fallbackImages[errorCount] || "";
  const currentSrc = currentRawSrc ? getOptimizedImageUrl(currentRawSrc, width) : "";
  const blurSrc = currentRawSrc ? getOptimizedImageUrl(currentRawSrc, 20) : "";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}>
      {blurSrc && (
        <div
          style={{
            position: "absolute",
            inset: "-10%",
            backgroundImage: `url(${blurSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(10px)",
            opacity: loaded ? 0 : 1,
            transition: "opacity 0.6s ease-out",
          }}
        />
      )}

      {/* Actual Image (rendered first so spinner and Mypage labels overlay it naturally) */}
      {!hasFailedAll && currentSrc ? (
        <img
          src={currentSrc}
          alt={item.title || item.name || "Artwork"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (recoveredSrc) {
               setHasFailedAll(true);
               setLoaded(true);
            } else if (errorCount < fallbackImages.length - 1) {
               setErrorCount((c) => c + 1);
            } else {
               handleAdvancedRecovery();
            }
          }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.4s ease-in",
            position: "relative",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.36)",
            fontSize: 12,
            position: "relative",
          }}
        >
          No Image
        </div>
      )}

      {/* Loading Spinner ring (absolute over the image) */}
      {!loaded && currentSrc && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.1)",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "2px solid rgba(255,255,255,0.3)",
              borderTop: "2px solid rgba(255,255,255,0.9)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}
      <style>
        {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
};

const MyPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const [likedExhibitions, setLikedExhibitions] = useState<any[]>([]);
  const [likedMuseums, setLikedMuseums] = useState<any[]>([]);
  const [likedArtists, setLikedArtists] = useState<any[]>([]);

  const [profileData, setProfileData] = useState<any>({});
  const [username, setUsername] = useState("");

  const [showSlideshow, setShowSlideshow] = useState(false);
  const [lightboxYoutubeId, setLightboxYoutubeId] = useState<string | null>(null);
  const [commentArtwork, setCommentArtwork] = useState<any | null>(null);
  const [productArtwork, setProductArtwork] = useState<any>(null);
  const [galleryArtwork, setGalleryArtwork] = useState<any>(null);

  const [playlists, setPlaylists] = useState<any[]>([]);
  const [playlistArtwork, setPlaylistArtwork] = useState<any>(null);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [activePlaylistItems, setActivePlaylistItems] = useState<any[]>([]);

  const [userScore, setUserScore] = useState(0);
  const [userRank, setUserRank] = useState(RANKS[0]);

  const [viewMode, setViewMode] = useState<ViewMode>("artworks");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [unlikedItems, setUnlikedItems] = useState<Set<string>>(new Set());

  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 768 : false));
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });

  const displayPhotoURL = profileData.photoURL || user?.photoURL;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    if (galleryArtwork || showSlideshow) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [galleryArtwork, showSlideshow]);

  const fetchProfile = async () => {
    if (!user) return;

    const db = getFirestore();
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setProfileData(userDoc.data());
        if (userDoc.data().nickname) setUsername(userDoc.data().nickname);
        return;
      }

      const legacyDoc = await getDoc(doc(db, `users/${user.uid}/profile/info`));
      if (legacyDoc.exists()) {
        setProfileData({ ...legacyDoc.data(), nickname: legacyDoc.data().username });
        setUsername(legacyDoc.data().username || "");
        return;
      }

      setUsername(user.displayName || user.email?.split("@")[0] || "Art Explorer");
    } catch (error) {
      console.error("Error fetching profile", error);
    }
  };

  const fetchPlaylists = async () => {
    if (!user) return;
    const db = getFirestore();

    try {
      const playlistsQ = query(collection(db, `users/${user.uid}/playlists`), orderBy("createdAt", "desc"));
      const snap = await getDocs(playlistsQ);
      const loaded: any[] = snap.docs.map((playlistDoc) => ({ id: playlistDoc.id, ...playlistDoc.data() }));

      await Promise.all(
        loaded.map(async (playlist) => {
          const itemsSnap = await getDocs(collection(db, `users/${user.uid}/playlists/${playlist.id}/items`));
          playlist.items = itemsSnap.docs.map((itemDoc) => ({ id: itemDoc.id, ...itemDoc.data() }));
        }),
      );

      setPlaylists(loaded);
    } catch (error) {
      console.error("Error fetching playlists", error);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/");
      return;
    }

    const db = getFirestore();

    const fetchData = async () => {
      try {
        const [artworksSnap, exhibitionsSnap, museumsSnap, artistsSnap] = await Promise.all([
          getDocs(collection(db, `users/${user.uid}/liked_artworks`)),
          getDocs(collection(db, `users/${user.uid}/liked_exhibitions`)),
          getDocs(collection(db, `users/${user.uid}/liked_museums`)),
          getDocs(collection(db, `users/${user.uid}/liked_artists`)),
        ]);

        setLikedArtworks(artworksSnap.docs.map((record) => ({ id: record.id, ...record.data() })));
        setLikedExhibitions(exhibitionsSnap.docs.map((record) => ({ id: record.id, ...record.data() })));
        setLikedMuseums(museumsSnap.docs.map((record) => ({ id: record.id, ...record.data() })));
        setLikedArtists(artistsSnap.docs.map((record) => ({ id: record.id, ...record.data() })));

        await Promise.all([fetchPlaylists(), fetchProfile()]);
      } catch (error) {
        console.error("Error fetching mypage data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || loading) return;

    const calculateScore = async () => {
      const db = getFirestore();
      let score = 0;

      score += likedArtworks.length;
      score += likedExhibitions.length * 2;

      try {
        const postsQuery = query(collection(db, "community"), where("authorId", "==", user.uid));
        const postsSnapshot = await getCountFromServer(postsQuery);
        score += postsSnapshot.data().count * 5;
      } catch (error) {
        console.warn("Could not fetch community stats for score", error);
      }

      setUserScore(score);

      let currentRank = RANKS[0];
      for (let i = RANKS.length - 1; i >= 0; i -= 1) {
        if (score >= RANKS[i].threshold) {
          currentRank = RANKS[i];
          break;
        }
      }
      setUserRank(currentRank);
    };

    calculateScore();
  }, [user, loading, likedArtworks.length, likedExhibitions.length]);

  const handleUnlike = async (itemId: string, itemType: "artwork" | "exhibition" | "museum" | "artist") => {
    if (!user) return;

    const db = getFirestore();
    const collectionName =
      itemType === "museum"
        ? "liked_museums"
        : itemType === "exhibition"
          ? "liked_exhibitions"
          : itemType === "artist"
            ? "liked_artists"
            : "liked_artworks";

    const ref = doc(db, `users/${user.uid}/${collectionName}/${itemId}`);

    try {
      setUnlikedItems((prev) => new Set(prev).add(itemId));
      await deleteDoc(ref);
    } catch (error) {
      console.error("Error unliking item", error);
      setUnlikedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleRelike = async (item: any, itemType: "artwork" | "exhibition" | "museum" | "artist") => {
    if (!user) return;

    const db = getFirestore();
    const itemId =
      itemType === "museum"
        ? item.museumId || item.id
        : itemType === "exhibition"
          ? item.exhibitionId || item.id
          : itemType === "artist"
            ? item.artist || item.id
            : item.artworkId || item.id;

    const collectionName =
      itemType === "museum"
        ? "liked_museums"
        : itemType === "exhibition"
          ? "liked_exhibitions"
          : itemType === "artist"
            ? "liked_artists"
            : "liked_artworks";

    const ref = doc(db, `users/${user.uid}/${collectionName}/${itemId}`);

    try {
      setUnlikedItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      await setDoc(ref, { ...item, likedAt: new Date() });
    } catch (error) {
      console.error("Error re-liking item", error);
    }
  };

  const resolveCollectionIdForMuseum = (art: any, museum?: any): string | null => {
    if (!museum) return null;

    const normalize = (value?: string) => normalizeToken(value) || "";
    const permanent = museum.permanentExhibitions || [];
    const artExhId = normalize(art.exhibitionId);

    const direct = permanent.find((pe: any) => normalize(pe?.id) === artExhId);
    if (direct?.id) return direct.id;

    if (artExhId) {
      const aliasMatch = permanent.find((pe: any) => getExhibitionTokens(pe).has(artExhId));
      if (aliasMatch?.id) return aliasMatch.id;
    }

    const artId = normalize(art.artworkId || art.id);
    const artImage = normalize(art.image || art.imageUrl || art.thumbnail?.url || art.thumbnail?.src || art.thumbnail?.imageUrl || art.thumbnail?.iiifUrl);
    const artSource = normalize(art.sourceUrl || art.detailUrl || art.url || art.link || art.source);

    let bestMatch: { id: string; score: number } | null = null;

    for (const pe of permanent) {
      const peId = normalize(pe?.id);
      if (!peId) continue;

      let score = 0;
      if (artId) {
        if (artId === peId) score = 1000;
        else if (artId.startsWith(`${peId}-`) || artId.startsWith(`${peId}_`)) score = 900 + peId.length;
        else if (artId.includes(`${peId}-`) || artId.includes(`${peId}_`)) score = 700 + peId.length;
        else if (artId.includes(peId)) score = 500 + peId.length;
      }

      const collectionFile = (pe as any)?.collectionFile as string | undefined;
      if (!score && collectionFile) {
        const base = normalize(String(collectionFile).replace(".json", ""));
        if (base && (artId.includes(base) || artImage.includes(base) || artSource.includes(base))) {
          score = 600 + base.length;
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: pe.id, score };
      }
    }

    if (bestMatch?.id) return bestMatch.id;
    return permanent?.[0]?.id || null;
  };

  const resolveCollectionIdAcrossMuseums = (art: any): string | null => {
    const normalize = (value?: string) => normalizeToken(value) || "";
    const artExhId = normalize(art.exhibitionId);

    if (artExhId) {
      for (const museum of exhibitions) {
        for (const pe of museum.permanentExhibitions || []) {
          const peId = normalize(pe?.id);
          if (peId === artExhId || getExhibitionTokens(pe).has(artExhId)) return pe.id;
        }
      }
    }

    const artId = normalize(art.artworkId || art.id);
    const artImage = normalize(art.image || art.imageUrl || art.thumbnail?.url || art.thumbnail?.src || art.thumbnail?.imageUrl || art.thumbnail?.iiifUrl);
    const artSource = normalize(art.sourceUrl || art.detailUrl || art.url || art.link || art.source);

    let bestMatch: { id: string; score: number } | null = null;

    for (const museum of exhibitions) {
      for (const pe of museum.permanentExhibitions || []) {
        const peId = normalize(pe?.id);
        if (!peId) continue;

        let score = 0;
        if (artId) {
          if (artId === peId) score = 1000;
          else if (artId.startsWith(`${peId}-`) || artId.startsWith(`${peId}_`)) score = 900 + peId.length;
          else if (artId.includes(`${peId}-`) || artId.includes(`${peId}_`)) score = 700 + peId.length;
          else if (artId.includes(peId)) score = 500 + peId.length;
        }

        const collectionFile = (pe as any)?.collectionFile as string | undefined;
        if (!score && collectionFile) {
          const base = normalize(String(collectionFile).replace(".json", ""));
          if (base && (artId.includes(base) || artImage.includes(base) || artSource.includes(base))) {
            score = 600 + base.length;
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { id: pe.id, score };
        }
      }
    }

    return bestMatch?.id || null;
  };

  const getExhibitionId = (art: any) => {
    if (art.exhibitionId) return art.exhibitionId;

    const direct = resolveCollectionIdAcrossMuseums(art);
    if (direct) return direct;

    const match = findMuseumForArtwork(art, exhibitions);
    const fromMuseum = resolveCollectionIdForMuseum(art, match);
    if (fromMuseum) return fromMuseum;

    const artId = art.artworkId || art.id || "";
    if (artId.startsWith("bruecke-")) return "bruecke-collection";

    return null;
  };

  const handleViewInMuseum = (art: any) => {
    let exhibitionId = getExhibitionId(art);

    if (!exhibitionId) {
      const match = findMuseumForArtwork(art, exhibitions);
      if (match) {
        exhibitionId = resolveCollectionIdForMuseum(art, match) || match.permanentExhibitions?.[0]?.id || null;
      }
    }

    if (!exhibitionId) {
      const targetName = (art.museumName || art.museum || art.source || "").toLowerCase();
      if (targetName.includes("neue nationalgalerie")) exhibitionId = "smb-neue-nationalgalerie-collection";
      else if (targetName.includes("alte nationalgalerie")) exhibitionId = "smb-alte-nationalgalerie-collection";
      else if (targetName.includes("bode-museum") || targetName.includes("bode museum")) exhibitionId = "smb-bode-museum-collection";
      else if (targetName.includes("brucke") || targetName.includes("brücke")) exhibitionId = "bruecke-museum-collection";
      else if (targetName.includes("picasso") && targetName.includes("barcelona")) exhibitionId = "picasso-bcn-collection";
    }

    if (exhibitionId) {
      sessionStorage.setItem(
        "pendingMuseumSearchQuery",
        JSON.stringify({
          artworkTitle: art.title || art.name,
          artworkId: art.artworkId || art.id,
        }),
      );
      setGalleryArtwork(null);
      navigate(`/collection/${exhibitionId}`);
      return;
    }

    const match = findMuseumForArtwork(art, exhibitions);
    if (match) {
      setGalleryArtwork(null);
      if (match.permanentExhibitions?.length > 0) {
        navigate(`/collection/${match.permanentExhibitions[0].id}`);
      } else {
        navigate(`/?selectMuseum=${match.id}`);
      }
      return;
    }

    alert("이 작품의 미술관 정보를 찾을 수 없습니다.");
  };

  const pageBg = isLightTheme ? "#FAFAFA" : "#080808";
  const panelBg = isLightTheme ? "rgba(255,255,255,0.84)" : "rgba(8,8,8,0.84)";
  const panelBorder = isLightTheme ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.10)";
  const pageText = isLightTheme ? "rgba(0,0,0,0.88)" : "rgba(255,255,255,0.88)";
  const subText = isLightTheme ? "rgba(0,0,0,0.56)" : "rgba(255,255,255,0.56)";
  const faintText = isLightTheme ? "rgba(0,0,0,0.36)" : "rgba(255,255,255,0.36)";
  const divider = isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const lime = "#BFFF0A";

  const heroImage =
    likedArtworks[0]?.image ||
    likedArtworks[0]?.i ||
    displayPhotoURL ||
    "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1800&q=80";

  const tabs = useMemo(
    () => [
      { id: "artworks" as const, label: "Artworks", icon: Palette, count: likedArtworks.length },
      { id: "exhibitions" as const, label: "Exhibitions", icon: Calendar, count: likedExhibitions.length },
      { id: "museums" as const, label: "Museums", icon: MapPin, count: likedMuseums.length },
      { id: "artists" as const, label: "Artists", icon: User, count: likedArtists.length },
      { id: "playlists" as const, label: "Playlists", icon: ListMusic, count: playlists.length },
    ],
    [likedArtworks.length, likedExhibitions.length, likedMuseums.length, likedArtists.length, playlists.length],
  );

  const currentItems = useMemo(() => {
    if (activePlaylist) return activePlaylistItems;
    if (viewMode === "artworks") return likedArtworks;
    if (viewMode === "exhibitions") return likedExhibitions;
    if (viewMode === "museums") return likedMuseums;
    if (viewMode === "artists") return likedArtists;
    return [];
  }, [activePlaylist, activePlaylistItems, likedArtworks, likedExhibitions, likedMuseums, likedArtists, viewMode]);

  const toMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.seconds === "number") return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const sortedItems = useMemo(() => {
    const cloned = [...currentItems];
    cloned.sort((a, b) => {
      if (sortMode === "recent") return toMillis(b.likedAt) - toMillis(a.likedAt);
      if (sortMode === "oldest") return (a.year || 0) - (b.year || 0);
      return (b.year || 0) - (a.year || 0);
    });
    return cloned;
  }, [currentItems, sortMode]);

  const isArtworkLikeMode = activePlaylist !== null || viewMode === "artworks";

  const resolveItemType = (mode: ViewMode) => {
    if (mode === "museums") return "museum" as const;
    if (mode === "exhibitions") return "exhibition" as const;
    if (mode === "artists") return "artist" as const;
    return "artwork" as const;
  };

  const getItemId = (item: any, mode: ViewMode) => {
    if (mode === "museums") return String(item.museumId || item.id || "");
    if (mode === "exhibitions") return String(item.exhibitionId || item.id || "");
    if (mode === "artists") return String(item.artist || item.id || "");
    return String(item.artworkId || item.id || "");
  };

  const openItem = (item: any, mode: ViewMode) => {
    if (mode === "museums") {
      const targetId = item.museumId || item.slug || item.id;
      if (targetId) {
        sessionStorage.setItem(
          "pendingMuseum",
          JSON.stringify({ id: targetId, name: item.name || "", image: item.image || "" }),
        );
        navigate(`/?museum=${encodeURIComponent(targetId)}`);
      }
      return;
    }

    if (mode === "exhibitions") {
      const targetId = item.exhibitionId || item.id;
      if (targetId) navigate(`/?exhibition=${encodeURIComponent(targetId)}`);
      return;
    }

    if (item.youtubeId) {
      setLightboxYoutubeId(item.youtubeId);
      return;
    }

    if (item.image || item.i) {
      const exhId = getFallbackExhibitionIdForJson(item);
      const itemId = item.artworkId || item.id;
      const cacheKey = `${exhId}_${itemId}`;
      const recoveredSrc = _recoveredUrlsCache[cacheKey];
      
      setGalleryArtwork({ 
        ...item, 
        image: recoveredSrc || item.image || item.i 
      });
    }
  };

  const displayName = profileData.nickname || username || user?.displayName || "Art Explorer";

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate("/");
  };

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: pageBg,
          color: pageText,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        Loading profile...
      </div>
    );
  }

  const renderArtworkCard = (rawItem: any, index: number) => {
    const normalized = {
      ...rawItem,
      image: rawItem.image || rawItem.i || "",
      title: rawItem.title || rawItem.name || rawItem.n || "Untitled",
      artist: rawItem.artist || rawItem.a || "",
      museumName: rawItem.museumName || rawItem.m || "",
    };

    const modeForItem: ViewMode = activePlaylist ? "artworks" : viewMode;
    const itemType = resolveItemType(modeForItem);
    const itemId = getItemId(normalized, modeForItem);
    const isUnliked = unlikedItems.has(itemId);

    return (
      <div
        key={`${modeForItem}-${itemId}-${index}`}
        onClick={() => openItem(normalized, modeForItem)}
        style={{
          breakInside: "avoid",
          marginBottom: 2,
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
          borderRadius: 0,
          aspectRatio: "1 / 1",
          background: isLightTheme ? "#f0f0f0" : "#151515",
        }}
      >
        <MyPageImage item={normalized} width={900} />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.76) 0%, transparent 54%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "absolute", right: 7, bottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (isUnliked) handleRelike(normalized, itemType);
              else handleUnlike(itemId, itemType);
            }}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title={isUnliked ? "Like again" : "Unlike"}
          >
            <Heart size={13} strokeWidth={2.2} fill={isUnliked ? "none" : lime} color={isUnliked ? "#fff" : lime} />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setPlaylistArtwork(normalized);
            }}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title="Save to Playlist"
          >
            <BookmarkPlus size={12} strokeWidth={2.2} />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setProductArtwork(normalized);
            }}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title="Purchase Product"
          >
            <ShoppingBag size={12} strokeWidth={2.1} />
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              setCommentArtwork(normalized);
            }}
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "none",
              background: "rgba(0,0,0,0.56)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
            title="Comments"
          >
            <MessageCircle size={12} strokeWidth={2.1} />
          </button>
        </div>

        <div style={{ position: "absolute", left: 8, right: 40, bottom: 8, color: "#fff", pointerEvents: "none" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {normalized.title}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              opacity: 0.88,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {normalized.artist || normalized.museumName}
          </div>
        </div>
      </div>
    );
  };

  const renderSimpleCard = (rawItem: any, index: number) => {
    const normalized = {
      ...rawItem,
      image: rawItem.image || rawItem.i || "",
      title: rawItem.title || rawItem.name || rawItem.n || "Untitled",
      subtitle: rawItem.artist || rawItem.museumName || rawItem.location || "",
    };

    const itemType = resolveItemType(viewMode);
    const itemId = getItemId(normalized, viewMode);
    const isUnliked = unlikedItems.has(itemId);

    return (
      <div
        key={`${viewMode}-${itemId}-${index}`}
        onClick={() => openItem(normalized, viewMode)}
        style={{
          position: "relative",
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${divider}`,
          background: isLightTheme ? "#fff" : "rgba(255,255,255,0.03)",
          cursor: "pointer",
        }}
      >
        <div style={{ aspectRatio: "4 / 5", background: isLightTheme ? "#f0f0f0" : "#1a1a1a" }}>
          {normalized.image ? <MyPageImage item={normalized} width={700} /> : null}
        </div>

        <button
          onClick={(event) => {
            event.stopPropagation();
            if (isUnliked) handleRelike(normalized, itemType);
            else handleUnlike(itemId, itemType);
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 25,
            height: 25,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.56)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Heart size={12} strokeWidth={2.1} fill={isUnliked ? "none" : lime} color={isUnliked ? "#fff" : lime} />
        </button>

        <div style={{ padding: "8px 9px" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: pageText,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {normalized.title}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              color: subText,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {normalized.subtitle}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        background: pageBg,
        color: pageText,
        fontFamily: "'Space Grotesk', 'Apple SD Gothic Neo', sans-serif",
      }}
    >
      <div style={{ position: "relative", height: isMobile ? 230 : 310, overflow: "hidden" }}>
        <img
          src={getOptimizedImageUrl(heroImage, 1400)}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: isLightTheme ? "saturate(0.7) contrast(1.02)" : "saturate(0.42) brightness(0.82) contrast(1.1)" }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: isLightTheme
              ? "linear-gradient(to bottom, rgba(255,255,255,0.12) 0%, rgba(250,250,250,0.40) 55%, rgba(250,250,250,0.98) 100%)"
              : "linear-gradient(to bottom, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.56) 58%, rgba(8,8,8,0.98) 100%)",
          }}
        />

        <button
          onClick={handleBack}
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: panelBorder,
            background: panelBg,
            color: pageText,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 4,
            padding: 0,
          }}
          title="Back"
        >
          <ArrowLeft size={16} strokeWidth={2.4} />
        </button>

        <button
          onClick={() => navigate("/onboarding")}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            height: 30,
            borderRadius: 999,
            border: panelBorder,
            background: panelBg,
            color: pageText,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            cursor: "pointer",
            zIndex: 4,
            padding: "0 11px",
            fontSize: 11,
            fontWeight: 600,
          }}
          title="Edit"
        >
          <Pencil size={11} />
          Edit
        </button>
      </div>

      <div style={{ padding: isMobile ? "0 10px" : "0 24px", marginTop: -34, position: "relative", zIndex: 3 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div
              style={{
                width: isMobile ? 58 : 72,
                height: isMobile ? 58 : 72,
                borderRadius: "50%",
                overflow: "hidden",
                background: lime,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 0 4px ${isLightTheme ? "#fafafa" : "#080808"}`,
              }}
            >
              {displayPhotoURL ? (
                <img src={displayPhotoURL} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "#000", fontWeight: 700, fontSize: isMobile ? 15 : 18 }}>{displayName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: isMobile ? 18 : 26,
                  fontWeight: 700,
                  color: pageText,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                {displayName}
                <span
                  style={{
                    fontSize: isMobile ? 10 : 11,
                    fontWeight: 700,
                    borderRadius: 999,
                    background: "rgba(191,255,10,0.14)",
                    border: `1px solid ${isLightTheme ? "rgba(90,120,0,0.24)" : "rgba(191,255,10,0.24)"}`,
                    color: isLightTheme ? "#5A7800" : lime,
                    padding: "3px 7px",
                    letterSpacing: "0.04em",
                  }}
                >
                  {userRank.short} {userRank.name}
                </span>
              </div>

              <div
                style={{
                  marginTop: 3,
                  fontSize: isMobile ? 11 : 12,
                  color: subText,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.email} • Score: {userScore}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowSlideshow(true)}
            style={{
              border: "none",
              borderRadius: 999,
              background: lime,
              color: "#000",
              height: isMobile ? 38 : 44,
              padding: isMobile ? "0 14px" : "0 20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              flexShrink: 0,
              fontSize: isMobile ? 12 : 14,
              fontWeight: 700,
            }}
          >
            <Play size={13} strokeWidth={2.4} />
            <span>Play Slideshow</span>
          </button>
        </div>
      </div>

      {!activePlaylist && (
        <div style={{ padding: isMobile ? "16px 10px 0" : "18px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: pageText }}>
            <span style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.03em" }}>My Playlists</span>
            <span style={{ fontSize: 14, color: subText }}>{playlists.length}</span>
          </div>

          {playlists.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                padding: "12px 0 10px",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => {
                    setViewMode("artworks");
                    setActivePlaylist(playlist);
                    setActivePlaylistItems(playlist.items || []);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    minWidth: 84,
                    textAlign: "left",
                    cursor: "pointer",
                    color: pageText,
                  }}
                >
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 12,
                      overflow: "hidden",
                      background: isLightTheme ? "#ececec" : "#191919",
                      border: `1px solid ${divider}`,
                    }}
                  >
                    {playlist.coverImage ? (
                      <MyPageImage item={{ image: playlist.coverImage }} width={300} />
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: pageText,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {playlist.name}
                  </div>
                  <div style={{ marginTop: 1, fontSize: 10, color: subText }}>{playlist.items?.length || 0} items</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: subText }}>No playlists yet.</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 8, borderTop: `1px solid ${divider}` }} />

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: isLightTheme ? "rgba(250,250,250,0.95)" : "rgba(8,8,8,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: `1px solid ${divider}`,
        }}
      >
        <div style={{ display: "flex" }}>
          {tabs.map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setViewMode(tab.id);
                  setActivePlaylist(null);
                }}
                style={{
                  flex: 1,
                  border: "none",
                  background: "none",
                  padding: "8px 3px 9px",
                  cursor: "pointer",
                  borderBottom: `2px solid ${active ? lime : "transparent"}`,
                  color: active ? pageText : faintText,
                }}
              >
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{tab.count}</div>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <tab.icon size={10} strokeWidth={active ? 2.4 : 1.9} color={active ? (isLightTheme ? "#5A7800" : lime) : faintText} />
                  <span style={{ fontSize: 10, fontWeight: active ? 600 : 400 }}>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "10px 12px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {activePlaylist ? (
          <button
            onClick={() => setActivePlaylist(null)}
            style={{ border: "none", background: "none", color: subText, cursor: "pointer", fontSize: 12, padding: 0 }}
          >
            ← {activePlaylist.name}
          </button>
        ) : (
          <span />
        )}

        <div style={{ display: "flex", gap: 6 }}>
          {(["recent", "oldest", "newest"] as const).map((mode) => {
            const active = sortMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "5px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  background: active ? (isLightTheme ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.13)") : "transparent",
                  color: active ? pageText : faintText,
                }}
              >
                {mode === "recent" ? "Latest" : mode === "oldest" ? "Oldest" : "Newest"}
              </button>
            );
          })}
        </div>
      </div>

      {viewMode === "playlists" && !activePlaylist ? (
        <div style={{ padding: "8px 12px 96px", display: "flex", flexDirection: "column", gap: 10 }}>
          {playlists.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: subText }}>No playlists yet.</div>
          ) : (
            playlists.map((playlist) => (
              <div
                key={playlist.id}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${divider}`,
                  background: isLightTheme ? "#fff" : "rgba(255,255,255,0.03)",
                  padding: 10,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setViewMode("artworks");
                  setActivePlaylist(playlist);
                  setActivePlaylistItems(playlist.items || []);
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 8,
                    overflow: "hidden",
                    flexShrink: 0,
                    background: isLightTheme ? "#efefef" : "#1a1a1a",
                  }}
                >
                  {playlist.coverImage ? (
                    <MyPageImage item={{ image: playlist.coverImage }} width={220} />
                  ) : null}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: pageText,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {playlist.name}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: subText }}>{playlist.items?.length || 0} items</div>
                </div>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowSlideshow(true);
                    setActivePlaylist(playlist);
                    setActivePlaylistItems(playlist.items || []);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "none",
                    background: lime,
                    color: "#000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <Play size={13} strokeWidth={2.3} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : sortedItems.length === 0 ? (
        <div style={{ padding: "48px 20px 90px", textAlign: "center", color: subText }}>
          No {activePlaylist ? "items in this playlist" : viewMode} saved yet.
        </div>
      ) : isArtworkLikeMode ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
            gap: 2,
            padding: "2px 2px 90px",
          }}
        >
          {sortedItems.map((item, index) => renderArtworkCard(item, index))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
            gap: 8,
            padding: "2px 10px 96px",
          }}
        >
          {sortedItems.map((item, index) => renderSimpleCard(item, index))}
        </div>
      )}

      {showSlideshow && (
        <Slideshow artworks={activePlaylist ? activePlaylistItems : likedArtworks} onClose={() => setShowSlideshow(false)} />
      )}

      {galleryArtwork && (
        <ArtworkLightbox
          artwork={galleryArtwork}
          onClose={() => setGalleryArtwork(null)}
          isLiked={(() => {
            const id = galleryArtwork.artworkId || galleryArtwork.id;
            const inList = likedArtworks.some((art) => (art.artworkId || art.id) === id);
            return inList && !unlikedItems.has(String(id));
          })()}
          onToggleLike={(_event, artwork) => {
            const id = String(artwork.artworkId || artwork.id);
            const inList = likedArtworks.some((art) => String(art.artworkId || art.id) === id);
            const isLiked = inList && !unlikedItems.has(id);
            if (isLiked) handleUnlike(id, "artwork");
            else handleRelike(artwork, "artwork");
          }}
          onViewInMuseum={handleViewInMuseum}
          onPurchase={() => setProductArtwork(galleryArtwork)}
          onSaveToPlaylist={(artwork) => setPlaylistArtwork(artwork)}
          likedArtworksList={likedArtworks}
          onChangeArtwork={setGalleryArtwork}
        />
      )}

      {lightboxYoutubeId && (
        <div
          onClick={() => setLightboxYoutubeId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.95)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            cursor: "pointer",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: "90vw", maxWidth: 1200, aspectRatio: "16/9" }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${lightboxYoutubeId}?autoplay=1&rel=0&modestbranding=1`}
              title="Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: "none", borderRadius: 8 }}
            />
          </div>
        </div>
      )}

      {productArtwork && (
        <ProductModal
          artwork={{
            id: productArtwork.artworkId || productArtwork.id,
            name: productArtwork.title || productArtwork.name || "Untitled",
            artist: productArtwork.artist || "Unknown",
            image: productArtwork.image || productArtwork.i || "",
            year: productArtwork.year,
            roomId: "",
            exhibitionName: productArtwork.museumName || "",
            exhibitionTitle: "",
          }}
          onSelectArtwork={(nextArtwork) => setProductArtwork(nextArtwork)}
          onClose={() => setProductArtwork(null)}
        />
      )}

      {playlistArtwork && (
        <PlaylistModal
          isOpen={true}
          onClose={() => {
            setPlaylistArtwork(null);
            void fetchPlaylists();
          }}
          item={playlistArtwork}
          itemType={viewMode === "exhibitions" ? "exhibition" : viewMode === "museums" ? "museum" : viewMode === "artists" ? "artist" : "artwork"}
        />
      )}

      {commentArtwork && (
        <CommentModal
          isOpen={true}
          onClose={() => setCommentArtwork(null)}
          artworkId={commentArtwork.id || commentArtwork.artworkId}
        />
      )}
    </div>
  );
};

export default MyPage;
