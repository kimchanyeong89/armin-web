
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getFirestore, collection, getDoc, doc, setDoc, deleteDoc, getDocs, query, where, getCountFromServer, orderBy } from "firebase/firestore";
import { ProductModal } from "./ProductModal";
import { ArtworkLightbox } from '../components/ArtworkLightbox';
import { exhibitions } from '../data/exhibitions';
import { findMuseumForArtwork, getExhibitionTokens, normalizeToken } from '../utils/museumUtils';

import { GlobalNav } from './GlobalNav';
import { getOptimizedImageUrl } from '../utils/imageProxy';

import ProfileEditModal from "./ProfileEditModal";
import CommentModal from "./CommentModal";
import Slideshow from "./Slideshow";
import { PlaylistModal } from "./PlaylistModal";

// Ranking System Definitions - Art Tools Progression
const RANKS = [
  {
    name: "Observer",
    threshold: 0,
    description: "Sketching out ideas.",
    // Pencil
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
  },
  {
    name: "Seeker",
    threshold: 5,
    description: "Adding some color.",
    // Paint Tube
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2z" /><path d="M18 2v20" /></svg>
  },
  {
    name: "Collector",
    threshold: 15,
    description: "Refining the craft.",
    // Ink Pen / Fountain Pen
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>
  },
  {
    name: "Curator",
    threshold: 30,
    description: "Broad strokes of genius.",
    // Paintbrush
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 21.9a10.02 10.02 0 0 0 2.1-4.7c.4-3.1-3.1-6.2-3.1-6.2s-3.5 3.1-3.1 6.2A10.02 10.02 0 0 0 8 21.9" /><path d="M9 2L7 11h4L9 2z" /></svg>
  },
  {
    name: "Gallerist",
    threshold: 60,
    description: "Mixing it all together.",
    // Palette
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>
  },
  {
    name: "Patron",
    threshold: 100,
    description: "Setting the stage.",
    // Easel
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16" /><path d="M12 2v18" /><path d="M12 2L8 20" /><path d="M12 2l4 20" /><path d="M7 8h10" /></svg>
  },
  {
    name: "Visionary",
    threshold: 200,
    description: "A finished masterpiece.",
    // Ornate Frame
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="M4 4l4 4" /><path d="M20 4l-4 4" /><path d="M4 20l4-4" /><path d="M20 20l-4-4" /><circle cx="12" cy="12" r="3" /></svg>
  }
];

export const getFallbackExhibitionIdForJson = (item: any): string => {
  if (item.exhibitionId) return item.exhibitionId;
  if (item.e) return item.e;
  
  if (item.museumName || item.m) {
    const m = (item.museumName || item.m || '').toLowerCase();
    if (m.includes('brücke') || m.includes('brucke')) return 'bruecke-museum-collection';
    if (m.includes('tate')) {
      if (m.includes('modern')) return 'tate-modern-collection';
      if (m.includes('britain')) return 'tate-britain-artworks';
      if (m.includes('st iv')) return 'tate-st-ives-artworks';
      if (m.includes('liverpool')) return 'tate-liverpool-artworks';
      return 'tate-modern-collection';
    }
  }
  return '';
};

const MyPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const [likedExhibitions, setLikedExhibitions] = useState<any[]>([]);
  const [likedMuseums, setLikedMuseums] = useState<any[]>([]);
  const [likedArtists, setLikedArtists] = useState<any[]>([]);
  const [profileImageIsLandscape, setProfileImageIsLandscape] = useState(true);
  const [isProfileImageLoaded, setIsProfileImageLoaded] = useState(false);

  // Rank State
  const [userScore, setUserScore] = useState(0);
  const [userRank, setUserRank] = useState(RANKS[0]);
  const [nextRank, setNextRank] = useState(RANKS[1]);
  const [showRankInfo, setShowRankInfo] = useState(false);


  // Profile data
  const [profileData, setProfileData] = useState<any>({});
  const [showEditModal, setShowEditModal] = useState(false);

  // Slideshow state
  const [showSlideshow, setShowSlideshow] = useState(false);

  // Lightbox closing animation states
  const [isYoutubeClosing, setIsYoutubeClosing] = useState(false);
  const [closingYoutubeId, setClosingYoutubeId] = useState<string | null>(null);

  const displayPhotoURL = profileData.photoURL || user?.photoURL;

  useEffect(() => {
    setIsProfileImageLoaded(false);
  }, [displayPhotoURL]);


  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [viewMode, setViewMode] = useState<"artworks" | "exhibitions" | "museums" | "artists" | "playlists">("artworks");
  const [sortMode, setSortMode] = useState<"recent" | "oldest" | "newest">("recent");
  const [lightboxYoutubeId, setLightboxYoutubeId] = useState<string | null>(null);
  const [commentArtwork, setCommentArtwork] = useState<any | null>(null);
  const [username, setUsername] = useState<string>("");
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [unlikedItems, setUnlikedItems] = useState<Set<string>>(new Set());
  const [productArtwork, setProductArtwork] = useState<any>(null);
  const [galleryArtwork, setGalleryArtwork] = useState<any>(null);

  // Playlist States
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [playlistArtwork, setPlaylistArtwork] = useState<any>(null);
  const [activePlaylist, setActivePlaylist] = useState<any>(null);
  const [activePlaylistItems, setActivePlaylistItems] = useState<any[]>([]);

  // Lock body scroll when gallery lightbox is open
  useEffect(() => {
    if (galleryArtwork || showSlideshow) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [galleryArtwork, showSlideshow]);

  // Calculate Rank
  useEffect(() => {
    if (!user) return;
    const calculateScore = async () => {
      const db = getFirestore();
      let score = 0;

      // 1. Liked Items (1 point each)
      score += likedArtworks.length;
      score += likedExhibitions.length * 2; // Exhibitions worth more

      // 2. Community Posts (5 points each)
      try {
        const postsQuery = query(collection(db, "community"), where("authorId", "==", user.uid));
        const postsSnapshot = await getCountFromServer(postsQuery);
        score += postsSnapshot.data().count * 5;

      } catch (e) {
        console.warn("Could not fetch community stats for score", e);
      }

      setUserScore(score);

      // Determine Rank
      let currentRank = RANKS[0];
      let next = RANKS[1];

      for (let i = RANKS.length - 1; i >= 0; i--) {
        if (score >= RANKS[i].threshold) {
          currentRank = RANKS[i];
          next = RANKS[i + 1] || null;
          break;
        }
      }
      setUserRank(currentRank);
      setNextRank(next);
    };

    if (!loading) calculateScore();
  }, [user, loading, likedArtworks.length, likedExhibitions.length]);


  const handleUnlike = async (itemId: string, itemType: 'artwork' | 'exhibition' | 'museum' | 'artist') => {
    if (!user) return;
    const db = getFirestore();
    const collectionName = itemType === 'museum' ? 'liked_museums' : itemType === 'exhibition' ? 'liked_exhibitions' : itemType === 'artist' ? 'liked_artists' : 'liked_artworks';
    const ref = doc(db, `users/${user.uid}/${collectionName}/${itemId}`);
    try {
      setUnlikedItems(prev => new Set(prev).add(itemId));
      await deleteDoc(ref);
    } catch (err) {
      console.error('Error unliking:', err);
      setUnlikedItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
    }
  };
  const handleRelike = async (item: any, itemType: 'artwork' | 'exhibition' | 'museum' | 'artist') => {
    if (!user) return;
    const db = getFirestore();
    const itemId = itemType === 'museum' ? (item.museumId || item.id) : itemType === 'exhibition' ? (item.exhibitionId || item.id) : itemType === 'artist' ? (item.artist || item.id) : (item.artworkId || item.id);
    const collectionName = itemType === 'museum' ? 'liked_museums' : itemType === 'exhibition' ? 'liked_exhibitions' : itemType === 'artist' ? 'liked_artists' : 'liked_artworks';
    const ref = doc(db, `users/${user.uid}/${collectionName}/${itemId}`);
    try {
      setUnlikedItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
      await setDoc(ref, { ...item, likedAt: new Date() });
    } catch (err) {
      console.error('Error re-liking:', err);
    }
  };

  const fetchProfile = async () => {
    if (!user) return;
    const db = getFirestore();
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setProfileData(userDoc.data());
        if (userDoc.data().nickname) setUsername(userDoc.data().nickname);
      } else {
        // Fallback to legacy path or defaults
        const legacyDoc = await getDoc(doc(db, `users/${user.uid}/profile/info`));
        if (legacyDoc.exists()) {
          setUsername(legacyDoc.data().username);
          setProfileData({ ...legacyDoc.data(), nickname: legacyDoc.data().username });
        } else {
          setUsername(user.displayName || user.email?.split('@')[0] || 'User');
        }
      }
    } catch (e) {
      console.error("Error fetching profile", e);
    }
  };

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/");
      return;
    }

    const db = getFirestore();

    const fetchPlaylists = async () => {
      try {
        const playlistsQ = query(collection(db, `users/${user.uid}/playlists`), orderBy("createdAt", "desc"));
        const snap = await getDocs(playlistsQ);
        const loadedPlaylists = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

        // Preload items concurrently to prevent loading delay
        await Promise.all(loadedPlaylists.map(async (pl) => {
          const itemsSnap = await getDocs(collection(db, `users/${user.uid}/playlists/${pl.id}/items`));
          pl.items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }));

        setPlaylists(loadedPlaylists);
      } catch (e) {
        console.error("Error fetching playlists", e);
      }
    };

    (window as any).__refreshPlaylists = fetchPlaylists;

    const fetchData = async () => {
      try {
        const artworksSnap = await getDocs(collection(db, `users/${user.uid}/liked_artworks`));
        setLikedArtworks(artworksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const exhibitionsSnap = await getDocs(collection(db, `users/${user.uid}/liked_exhibitions`));
        setLikedExhibitions(exhibitionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const museumsSnap = await getDocs(collection(db, `users/${user.uid}/liked_museums`));
        setLikedMuseums(museumsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const artistsSnap = await getDocs(collection(db, `users/${user.uid}/liked_artists`));
        setLikedArtists(artistsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        await fetchPlaylists();
        await fetchProfile();
        setLoading(false);
      } catch (error) {
        console.error("Error fetching liked items", error);
        setLoading(false);
      }
    };

    fetchData();
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [user, navigate, authLoading]);


  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  }

  const resolveCollectionIdForMuseum = (art: any, museum?: any): string | null => {
    if (!museum) return null;
    const normalize = (value?: string) => normalizeToken(value) || '';
    const permanent = museum.permanentExhibitions || [];
    const artExhId = normalize(art.exhibitionId);

    const direct = permanent.find((pe: any) => normalize(pe?.id) === artExhId);
    if (direct?.id) return direct.id;

    if (artExhId) {
      const aliasMatch = permanent.find((pe: any) => getExhibitionTokens(pe).has(artExhId));
      if (aliasMatch?.id) return aliasMatch.id;
    }

    const artId = normalize(art.artworkId || art.id);
    const artImage = normalize(
      art.image ||
      art.imageUrl ||
      art.thumbnail?.url ||
      art.thumbnail?.src ||
      art.thumbnail?.imageUrl ||
      art.thumbnail?.iiifUrl
    );
    const artSource = normalize(
      art.sourceUrl ||
      art.detailUrl ||
      art.url ||
      art.link ||
      art.source
    );

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
        const base = normalize(String(collectionFile).replace('.json', ''));
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
    const normalize = (value?: string) => normalizeToken(value) || '';
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
    const artImage = normalize(
      art.image ||
      art.imageUrl ||
      art.thumbnail?.url ||
      art.thumbnail?.src ||
      art.thumbnail?.imageUrl ||
      art.thumbnail?.iiifUrl
    );
    const artSource = normalize(
      art.sourceUrl ||
      art.detailUrl ||
      art.url ||
      art.link ||
      art.source
    );

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
          const base = normalize(String(collectionFile).replace('.json', ''));
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
    // Fallback logic for legacy IDs
    const artId = art.artworkId || art.id || '';
    if (artId) {
      if (artId.startsWith('bruecke-')) return 'bruecke-collection';
    }
    return null;
  };

  const handleViewInMuseum = (art: any) => {
    let exhId = getExhibitionId(art);
    if (!exhId) {
      const match = findMuseumForArtwork(art, exhibitions);
      if (match) {
        exhId = resolveCollectionIdForMuseum(art, match) || match.permanentExhibitions?.[0]?.id || null;
      }
    }
    // Manual overrides
    if (!exhId) {
      const targetName = (art.museumName || art.museum || art.source || '').toLowerCase();
      if (targetName.includes('neue nationalgalerie')) exhId = 'smb-neue-nationalgalerie-collection';
      else if (targetName.includes('alte nationalgalerie')) exhId = 'smb-alte-nationalgalerie-collection';
      else if (targetName.includes('bode-museum') || targetName.includes('bode museum')) exhId = 'smb-bode-museum-collection';
      else if (targetName.includes('brücke-museum') || targetName.includes('brucke museum')) exhId = 'bruecke-museum-collection';
      else if (targetName.includes('picasso') && targetName.includes('barcelona')) exhId = 'picasso-bcn-collection';
    }

    if (exhId) {
      sessionStorage.setItem('pendingMuseumSearchQuery', JSON.stringify({
        artworkTitle: art.title || art.name,
        artworkId: art.artworkId || art.id
      }));
      setGalleryArtwork(null);
      navigate(`/collection/${exhId}`);
    } else {
      const match = findMuseumForArtwork(art, exhibitions);
      if (match) {
        setGalleryArtwork(null);
        if (match.permanentExhibitions && match.permanentExhibitions.length > 0) {
          navigate(`/collection/${match.permanentExhibitions[0].id}`);
        } else {
          navigate(`/?selectMuseum=${match.id}`);
        }
        return;
      }
      const mName = art.museumName || art.museum || art.source;
      if (mName) {
        alert(`${mName} 페이지를 찾을 수 없습니다.`);
      } else {
        alert('이 작품의 미술관 정보를 찾을 수 없습니다. (Museum Name Missing)');
      }
    }
  };

  return (
    <div style={{
      maxWidth: 1600,
      margin: '0 auto',
      padding: isMobile ? "0" : "40px",
      minHeight: '100vh',
      background: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      position: 'relative'
    }}>

      {/* Back Button */}
      {!isMobile && (
        <button
          onClick={handleBack}
          style={{
            position: 'absolute',
            top: 40,
            left: 40,
            background: 'transparent',
            border: 'none',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            transition: 'transform 0.2s',
            color: '#111'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateX(-4px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
          title="Back to Home"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      )}

      {/* Mobile Back Button */}
      {isMobile && (
        <button
          onClick={handleBack}
          style={{
            position: 'absolute',
            top: 20,
            left: 10,
            background: 'transparent',
            border: 'none',
            padding: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            color: '#111'
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
      )}

      {/* Slideshow Component */}
      {showSlideshow && (
        <Slideshow
          artworks={activePlaylist ? activePlaylistItems : likedArtworks}
          onClose={() => setShowSlideshow(false)}
        />
      )}

      {showEditModal && (
        <ProfileEditModal
          onClose={() => setShowEditModal(false)}
          onUpdate={() => fetchProfile()}
          initialData={{
            nickname: profileData.nickname || username || user?.displayName || '',
            birthDate: profileData.birthDate || '',
            photoURL: profileData.photoURL || user?.photoURL || ''
          }}
        />
      )}

      {/* Header Section */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        marginBottom: 40,
        gap: 20,
        padding: isMobile ? "20px" : "0",
        paddingTop: isMobile ? "70px" : "0" // Add padding top for mobile back button
      }}>
        {/* Profile Info */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, paddingLeft: isMobile ? 0 : 60 /* Offset for desktop Back button */ }}>
          <div
            style={{
              width: isMobile ? "80px" : "100px",
              height: isMobile ? "80px" : "100px",
              borderRadius: "50%",
              backgroundColor: "#f0f0f0",
              cursor: "pointer",
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }}
            onClick={() => navigate('/onboarding')}
          >
            {displayPhotoURL ? (
              <img
                src={displayPhotoURL}
                alt="Profile"
                onLoad={(e) => {
                  const { naturalWidth, naturalHeight } = e.currentTarget;
                  setProfileImageIsLandscape(naturalWidth >= naturalHeight);
                  setIsProfileImageLoaded(true);
                }}
                style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  width: profileImageIsLandscape ? 'auto' : '100%',
                  height: profileImageIsLandscape ? '100%' : 'auto',
                  minWidth: '100%', minHeight: '100%',
                  objectFit: 'cover',
                  transform: 'translate(-50%, -50%)',
                  opacity: isProfileImageLoaded ? 1 : 0,
                  transition: 'opacity 0.2s ease-in'
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 32 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
            )}
            <div style={{ position: 'absolute', bottom: 0, right: 0, background: 'white', padding: 6, borderRadius: '10px 0 0 0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </div>
          </div>

          <div>
            <h1 style={{ fontSize: isMobile ? "24px" : "32px", fontWeight: 700, margin: "0 0 4px 0", letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              {profileData.nickname || username || user?.displayName || 'Art Lover'}

              {/* Rank Icon */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f5f5f5',
                  borderRadius: '50%',
                  width: 32, height: 32,
                  cursor: 'help'
                }}
                onMouseEnter={() => setShowRankInfo(true)}
                onMouseLeave={() => setShowRankInfo(false)}
              >
                <span style={{ fontSize: 18, color: '#111' }}>{userRank.icon}</span>

                {/* Rank Info Tooltip */}
                {showRankInfo && (
                  <div style={{
                    position: 'absolute',
                    top: '120%',
                    left: '0',
                    background: 'white',
                    padding: '16px',
                    borderRadius: 12,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    width: 280,
                    pointerEvents: 'none',
                    border: '1px solid #eee'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#111', borderBottom: '1px solid #eee', paddingBottom: 8 }}>
                      Ranking System
                      {nextRank && (
                        <span style={{ float: 'right', fontWeight: 400, color: '#666' }}>Next: {nextRank.threshold}pts</span>
                      )}
                    </div>
                    {RANKS.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: r.name === userRank.name ? '#000' : '#999', fontWeight: r.name === userRank.name ? 600 : 400 }}>
                        <span style={{ fontSize: 16 }}>{r.icon}</span>
                        <div style={{ flex: 1 }}>{r.name}</div>
                        <div>{r.threshold}pt</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </h1>
            <div style={{ fontSize: "14px", color: "#666", marginBottom: 8 }}>{user?.email} • Score: {userScore}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, width: isMobile ? '100%' : 'auto' }}>
          <button
            onClick={() => setShowSlideshow(true)}
            style={{
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 100, // Pill shape
              padding: '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              transition: 'transform 0.2s, boxShadow 0.2s',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Play Slideshow
          </button>
        </div>
      </div>

      {/* Playlists Horizontal Section */}
      {!activePlaylist && (
        <div style={{ marginBottom: 40, padding: isMobile ? '0 10px' : '0' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0', color: '#111', display: 'flex', alignItems: 'center' }}>
            My Playlists <span style={{ color: '#aaa', fontSize: 14, fontWeight: 500, marginLeft: 8 }}>{playlists.length}</span>
          </h3>
          {playlists.length > 0 ? (
            <div
              style={{
                display: 'flex',
                gap: 16,
                overflowX: 'auto',
                paddingBottom: 10,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {playlists.map(pl => (
                <div
                  key={pl.id}
                  style={{ minWidth: 140, maxWidth: 140, cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                  onClick={() => {
                    setViewMode('artworks'); // Keep viewMode as artworks, but show playlist items
                    setActivePlaylist(pl);
                    setActivePlaylistItems(pl.items || []);
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                // The style prop was duplicated, removed the second one.
                >
                  <div style={{ width: 140, height: 140, borderRadius: 12, overflow: 'hidden', background: '#f0f0f0', marginBottom: 8, position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    {pl.coverImage ? (
                      <img 
                        src={getOptimizedImageUrl(pl.coverImage, 300)} 
                        alt={pl.name} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.dataset.originalTried !== "true") {
                            target.dataset.originalTried = "true";
                            let finalUrl = pl.coverImage;
                            if (finalUrl?.includes('pub-396fad1f96754c2f816f260faf970e63.r2.dev')) {
                              finalUrl = finalUrl.replace(/^https?:\/\/.*?\//, 'https://');
                            }
                            if (finalUrl) target.src = finalUrl;
                          } else if (target.dataset.triedJson !== "true" && pl.items && pl.items[0]) {
                            target.dataset.triedJson = "true";
                            const firstItem = pl.items[0];
                            const exhId = getFallbackExhibitionIdForJson(firstItem);
                            if (exhId) {
                               let file = exhId + ".json";
                               if (exhId === "tm-perm-1") file = "tate-modern-collection.json";
                               else if (exhId === "tate-britain-1") file = "tate-britain-artworks.json";
                               else if (exhId === "bm-perm-1") file = "british-museum-galleries.json";
                               
                               fetch(`/data/${file}`).then(res => res.json()).then(data => {
                                 const arr = Array.isArray(data) ? data : (data.artworks || data.objects || []);
                                 const idToFind = firstItem.artworkId || firstItem.id;
                                 const art = arr.find((a: any) => String(a.id) === String(idToFind) || String(a.artworkId) === String(idToFind));
                                 if (art && art.imageUrl) target.src = art.imageUrl;
                                 else target.style.opacity = '0';
                               }).catch(() => { target.style.opacity = '0'; });
                            } else {
                               target.style.opacity = '0';
                            }
                          } else {
                            target.style.opacity = '0';
                          }
                        }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{pl.items?.length || 0} items</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '24px 20px', background: '#f8f8f8', borderRadius: 12, color: '#888', fontSize: 14, border: '1px dashed #ddd' }}>
              No playlists yet. Create your first playlist by saving artworks!
            </div>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      {!activePlaylist && (
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #eee',
          marginBottom: 30,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          padding: isMobile ? '0 10px' : '0'
        }}>
          <TabButton
            active={viewMode === 'artworks'}
            onClick={() => { setViewMode('artworks'); setActivePlaylist(null); }}
            label="Artworks"
            count={likedArtworks.length}
          />
          <TabButton
            active={viewMode === 'exhibitions'}
            onClick={() => { setViewMode('exhibitions'); setActivePlaylist(null); }}
            label="Exhibitions"
            count={likedExhibitions.length}
          />
          <TabButton
            active={viewMode === 'museums'}
            onClick={() => { setViewMode('museums'); setActivePlaylist(null); }}
            label="Museums"
            count={likedMuseums.length}
          />
          <TabButton
            active={viewMode === 'artists'}
            onClick={() => { setViewMode('artists'); setActivePlaylist(null); }}
            label="Artists"
            count={likedArtists.length}
          />
        </div>
      )}

      {/* Controls & Grid */}
      <div style={{ display: 'flex', justifyContent: activePlaylist ? 'space-between' : 'flex-end', alignItems: 'center', marginBottom: 20, padding: isMobile ? '0 20px' : '0' }}>
        {activePlaylist && (
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <button onClick={() => setActivePlaylist(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            {activePlaylist.name}
          </h2>
        )}
        <SortToggle sortMode={sortMode} setSortMode={setSortMode} isMobile={isMobile} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fill, minmax(200px, 1fr))",
          gap: isMobile ? "2px" : "24px",
          width: "100%"
        }}
      >
        {(() => {
          const items = activePlaylist ? activePlaylistItems : viewMode === "artworks" ? likedArtworks : viewMode === "exhibitions" ? likedExhibitions : viewMode === "artists" ? likedArtists : likedMuseums;
          const sorted = [...items].sort((a, b) => {
            if (sortMode === 'recent') {
              const aTime = a.likedAt?.seconds || a.likedAt?.toMillis?.() || 0;
              const bTime = b.likedAt?.seconds || b.likedAt?.toMillis?.() || 0;
              return bTime - aTime;
            } else if (sortMode === 'oldest') {
              return (a.year || 0) - (b.year || 0);
            } else if (sortMode === 'newest') {
              return (b.year || 0) - (a.year || 0);
            }
            return 0;
          });

          if (sorted.length === 0) {
            return (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>Empty</div>
                <p>No {activePlaylist ? 'items in this playlist' : viewMode + 's'} saved yet.</p>
              </div>
            );
          }

          return sorted.map((rawItem, i) => {
            const item = {
               ...rawItem,
               image: rawItem.image || rawItem.i || '',
               title: rawItem.title || rawItem.name || rawItem.n || 'Untitled',
               artist: rawItem.artist || rawItem.a || '',
               museumName: rawItem.museumName || rawItem.m || '',
               exhibitionId: rawItem.exhibitionId || rawItem.e || ''
            };
            const isExhibition = viewMode === 'exhibitions';
            const isMuseum = viewMode === 'museums';
            const isArtist = viewMode === 'artists';
            const itemId = isMuseum ? (item.museumId || item.id) : isExhibition ? (item.exhibitionId || item.id) : isArtist ? (item.artist || item.id) : (item.artworkId || item.id);
            const itemType = isMuseum ? 'museum' : isExhibition ? 'exhibition' : isArtist ? 'artist' : 'artwork';

            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: "100%",
                  background: "#f8f8f8",
                  cursor: 'pointer',
                  borderRadius: isMobile ? 0 : 4,
                  overflow: 'hidden',
                  transition: 'transform 0.2s',
                }}
                className={!isMobile ? "hover-card" : ""}
                onMouseEnter={() => setHoveredItem(`${viewMode}-${i}`)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => {
                  if (isMuseum) {
                    const targetId = item.museumId || item.slug || item.id;
                    if (targetId) {
                      sessionStorage.setItem('pendingMuseum', JSON.stringify({ id: targetId, name: item.name || '', image: item.image || '' }));
                      navigate(`/?museum=${encodeURIComponent(targetId)}`);
                    }
                  } else if (isExhibition) {
                    const targetId = item.exhibitionId || item.id;
                    if (targetId) navigate(`/?exhibition=${encodeURIComponent(targetId)}`);
                  } else if (item.youtubeId) {
                    setLightboxYoutubeId(item.youtubeId);
                  } else if (item.image) {
                    setGalleryArtwork(item);
                  }
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  {item.youtubeId ? (
                    <img
                      src={`https://img.youtube.com/vi/${item.youtubeId}/maxresdefault.jpg`}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        if (e.currentTarget.src.includes('maxresdefault')) {
                          e.currentTarget.src = `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`;
                        } else if (item.image) {
                          e.currentTarget.src = getOptimizedImageUrl(item.image, 600);
                        }
                      }}
                    />
                  ) : item.image ? (
                    <img
                      src={getOptimizedImageUrl(item.image, 600)}
                      alt={item.title || item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      loading="lazy"
                      onError={(e) => {
                        const target = e.currentTarget;
                        
                        // State transition logic
                        if (!target.dataset.fallbackTried) {
                          target.dataset.fallbackTried = "true";
                          if (item.fallbackImages && item.fallbackImages.length > 0) {
                            target.src = item.fallbackImages[0];
                            return;
                          }
                        }

                        if (!target.dataset.originalTried) {
                          target.dataset.originalTried = "true";
                          let finalUrl = item.image; 
                          if (finalUrl) {
                            if (finalUrl.includes('pub-396fad1f96754c2f816f260faf970e63.r2.dev')) {
                              finalUrl = finalUrl.replace(/^https?:\/\/.*?\//, 'https://');
                            }
                            target.src = finalUrl;
                            return;
                          }
                        }

                        if (!target.dataset.triedJson) {
                          target.dataset.triedJson = "true";
                          let exhId = getFallbackExhibitionIdForJson(item);
                          if (exhId) {
                            let file = exhId + ".json";
                            // Basic redirects
                            if (exhId === "tm-perm-1") file = "tate-modern-collection.json";
                            else if (exhId === "tate-britain-1") file = "tate-britain-artworks.json";
                            else if (exhId === "tate-st-ives-1") file = "tate-st-ives-artworks.json";
                            else if (exhId === "tate-liverpool-1") file = "tate-liverpool-artworks.json";
                            else if (exhId === "bm-perm-1") file = "british-museum-galleries.json";
                            else if (exhId === "skagens-perm-1") file = "skagens-collection.json";
                            else if (exhId === "ngs-perm-1") file = "ngs-all.json";

                            fetch(`/data/${file}`)
                              .then(res => { if (!res.ok) throw new Error(); return res.json(); })
                              .then(data => {
                                const arr = Array.isArray(data) ? data : (data.artworks || data.objects || []);
                                const idToFind = item.artworkId || item.id;
                                const art = arr.find((a: any) => String(a.id) === String(idToFind) || String(a.artworkId) === String(idToFind));
                                if (art && art.imageUrl) {
                                  target.src = art.imageUrl;
                                } else if (art && art.fallbackImages && art.fallbackImages.length > 0) {
                                  target.src = art.fallbackImages[0];
                                } else {
                                  target.style.opacity = '0';
                                }
                              })
                              .catch(() => { target.style.opacity = '0'; });
                            return;
                          }
                        }
                        
                        target.style.opacity = '0';
                      }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>No Image</div>
                  )}
                </div>

                {/* Subtle Gradient Overlay for Text Visibility */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%)',
                  opacity: 0.8,
                  pointerEvents: 'none'
                }} />

                {/* Info Overlay */}
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: isMobile ? "6px" : "12px",
                  color: "#fff",
                  pointerEvents: 'none'
                }}>
                  <div style={{ fontWeight: 600, fontSize: isMobile ? 11 : 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title || item.name}
                  </div>
                  <div style={{ fontSize: isMobile ? 10 : 12, opacity: 0.9, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.artist || item.museumName || ''}
                  </div>
                </div>

                {/* Hover Actions (Desktop Only) */}
                {!isMobile && hoveredItem === `${viewMode}-${i}` && (
                  <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 10, zIndex: 20 }}>
                    {/* Playlist Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlaylistArtwork(item);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      title="Save to Playlist"
                    >
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /><line x1="12" x2="12" y1="7" y2="13" /><line x1="15" x2="9" y1="10" y2="10" /></svg>
                    </button>

                    {/* Product Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setProductArtwork(item);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      title="Purchase Product"
                    >
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <rect x="7" y="7" width="10" height="10" />
                      </svg>
                    </button>

                    {/* Comment Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCommentArtwork(item);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      title="Comments"
                    >
                      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </button>

                    {/* Heart Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const isUnliked = unlikedItems.has(itemId);
                        if (isUnliked) handleRelike(item, itemType);
                        else handleUnlike(itemId, itemType);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))'
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      title={unlikedItems.has(itemId) ? "Like again" : "Unlike"}
                    >
                      <svg width={20} height={20} viewBox="0 0 24 24" fill={unlikedItems.has(itemId) ? "none" : "#ff4d4d"} stroke={unlikedItems.has(itemId) ? "white" : "#ff4d4d"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Gallery Lightbox */}
      {galleryArtwork && (
        <ArtworkLightbox
          artwork={galleryArtwork}
          onClose={() => setGalleryArtwork(null)}
          isLiked={(() => {
            const id = galleryArtwork.artworkId || galleryArtwork.id;
            const inArr = likedArtworks.some(a => (a.artworkId || a.id) === id);
            const isUnliked = unlikedItems.has(id);
            return inArr && !isUnliked;
          })()}
          onToggleLike={(_e, artwork) => {
            const id = artwork.artworkId || artwork.id;
            const inArr = likedArtworks.some(a => (a.artworkId || a.id) === id);
            const isLiked = inArr && !unlikedItems.has(id);
            if (isLiked) handleUnlike(id, 'artwork');
            else handleRelike(artwork, 'artwork');
          }}
          onViewInMuseum={handleViewInMuseum}
          onPurchase={() => setProductArtwork(galleryArtwork)}
          onSaveToPlaylist={(artwork) => setPlaylistArtwork(artwork)}
          likedArtworksList={likedArtworks}
          onChangeArtwork={setGalleryArtwork}
        />
      )}

      {/* YouTube Video Lightbox Modal */}
      {(lightboxYoutubeId || isYoutubeClosing) && (
        <div
          onClick={() => {
            if (isYoutubeClosing) return;
            setClosingYoutubeId(lightboxYoutubeId);
            setIsYoutubeClosing(true);
            setLightboxYoutubeId(null);
            setTimeout(() => {
              setIsYoutubeClosing(false);
              setClosingYoutubeId(null);
            }, 200);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: 'pointer',
            animation: isYoutubeClosing ? 'fadeOut 0.2s ease-out forwards' : 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90vw',
              maxWidth: '1200px',
              aspectRatio: '16/9',
              animation: isYoutubeClosing ? 'zoomOut 0.2s ease-out forwards' : 'zoomIn 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${lightboxYoutubeId || closingYoutubeId}?autoplay=1&rel=0&modestbranding=1`}
              title="Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>
      )}

      {/* Product Modal */}
      {productArtwork && (
        <ProductModal
          artwork={{
            id: productArtwork.artworkId || productArtwork.id,
            name: productArtwork.title || productArtwork.name || 'Untitled',
            artist: productArtwork.artist || 'Unknown',
            image: productArtwork.image || '',
            year: productArtwork.year,
            roomId: '',
            exhibitionName: productArtwork.museumName || '',
            exhibitionTitle: ''
          }}
          onClose={() => setProductArtwork(null)}
        />
      )}

      {/* Playlist Modal */}
      {playlistArtwork && (
        <PlaylistModal
          isOpen={true}
          onClose={() => {
            setPlaylistArtwork(null);
            if ((window as any).__refreshPlaylists) {
              (window as any).__refreshPlaylists();
            }
          }}
          item={playlistArtwork}
          itemType={viewMode === 'exhibitions' ? 'exhibition' : viewMode === 'museums' ? 'museum' : viewMode === 'artists' ? 'artist' : 'artwork'}
        />
      )}

      {/* Comment Modal */}
      {commentArtwork && (
        <CommentModal
          isOpen={true}
          onClose={() => setCommentArtwork(null)}
          artworkId={commentArtwork.id || commentArtwork.artworkId}
        />
      )}

      {/* Global Navigation */}
      <div style={{ position: "fixed", top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10001 }}>
        <GlobalNav
          isAdmin={user?.email === 'kietzland@gmail.com'}
          isModalOpen={!!galleryArtwork}
          searchProps={{
            onOpenLightbox: (artwork, openLightbox = true) => {
              if (openLightbox) setGalleryArtwork(artwork);
            },
            museums: exhibitions.map(ex => ({
              id: ex.id,
              name: ex.name,
              country: (ex as any).country || '',
              region: (ex as any).region,
              latitude: (ex as any).latitude || 0,
              longitude: (ex as any).longitude || 0,
              representativeImage: (ex as any).representativeImage,
              permanentExhibitions: (ex as any).permanentExhibitions || [],
            })),
            onNavigateToMuseum: (museum, collectionId, artwork) => {
              if (collectionId) navigate(`/collection/${collectionId}`);
              else if (artwork?.exhibitionId) navigate(`/collection/${artwork.exhibitionId}`);
              else navigate(`/?selectMuseum=${museum.id}`);
            }
          }}
        />
      </div>

      <style>{`
          .hover-card:hover {
             transform: scale(1.02);
             z-index: 10;
             box-shadow: 0 10px 20px rgba(0,0,0,0.15);
          }
          .hover-btn:hover {
              background: #f5f5f5 !important;
              color: #000 !important;
          }
       `}</style>
    </div>
  );
};

// Subcomponents
const TabButton: React.FC<{ active: boolean; onClick: () => void; label: string; count: number }> = ({ active, onClick, label, count }) => (
  <button
    onClick={onClick}
    style={{
      background: 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid #111' : '2px solid transparent',
      padding: '12px 20px',
      cursor: 'pointer',
      fontSize: 16,
      fontWeight: active ? 600 : 400,
      color: active ? '#111' : '#888',
      marginRight: 10,
      whiteSpace: 'nowrap',
      transition: 'color 0.2s, border-bottom 0.2s',
      outline: 'none'
    }}
  >
    {label} <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 4, background: '#eee', padding: '2px 6px', borderRadius: 10 }}>{count}</span>
  </button>
);

const SortToggle: React.FC<{
  sortMode: "recent" | "oldest" | "newest";
  setSortMode: (mode: "recent" | "oldest" | "newest") => void;
  isMobile?: boolean; // keep type definition so other parts don't crash if they pass it
}> = ({ sortMode, setSortMode }) => {
  return (
    <div style={{ display: 'flex', gap: 10, }}>
      {(['recent', 'oldest', 'newest'] as const).map(mode => (
        <button
          key={mode}
          onClick={() => setSortMode(mode)}
          style={{
            background: sortMode === mode ? '#f0f0f0' : 'transparent',
            border: '1px solid ' + (sortMode === mode ? '#e0e0e0' : 'transparent'),
            borderRadius: 20,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: sortMode === mode ? 600 : 400,
            color: sortMode === mode ? '#111' : '#888',
            cursor: 'pointer',
            textTransform: 'capitalize',
            transition: 'all 0.2s'
          }}
        >
          {mode === 'recent' ? 'Latest' : mode}
        </button>
      ))}
    </div>
  );
};

export default MyPage;