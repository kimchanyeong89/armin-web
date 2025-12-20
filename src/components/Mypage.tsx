import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getFirestore, collection, getDoc, doc, setDoc, deleteDoc, getDocs } from "firebase/firestore";

const MyPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const [likedExhibitions, setLikedExhibitions] = useState<any[]>([]);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // visitedCount는 현재 숨김 처리 - 나중에 필요시 복원
  // const [visitedCount, setVisitedCount] = useState<number>(0);

  const [viewMode, setViewMode] = useState<"artworks" | "exhibitions">("artworks");
  const [sortMode, setSortMode] = useState<"recent" | "oldest" | "newest">("recent");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxYoutubeId, setLightboxYoutubeId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [unlikedItems, setUnlikedItems] = useState<Set<string>>(new Set());

  // Handle unlike for artworks and exhibitions - mark as unliked but don't remove from UI immediately
  const handleUnlike = async (itemId: string, isExhibition: boolean) => {
    if (!user) return;
    const db = getFirestore();
    const collectionName = isExhibition ? 'liked_exhibitions' : 'liked_artworks';
    const ref = doc(db, `users/${user.uid}/${collectionName}/${itemId}`);
    try {
      // Mark as unliked in UI (shows empty heart)
      setUnlikedItems(prev => new Set(prev).add(itemId));
      await deleteDoc(ref);
    } catch (err) {
      console.error('Error unliking:', err);
      // Revert on error
      setUnlikedItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
    }
  };

  // Handle re-like for items that were unliked
  const handleRelike = async (item: any, isExhibition: boolean) => {
    if (!user) return;
    const db = getFirestore();
    const itemId = isExhibition ? (item.exhibitionId || item.id) : (item.artworkId || item.id);
    const collectionName = isExhibition ? 'liked_exhibitions' : 'liked_artworks';
    const ref = doc(db, `users/${user.uid}/${collectionName}/${itemId}`);
    try {
      // Remove from unliked set
      setUnlikedItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
      // Re-save to Firestore
      await setDoc(ref, { ...item, likedAt: new Date() });
    } catch (err) {
      console.error('Error re-liking:', err);
    }
  };

  useEffect(() => {
    if (authLoading) return; // Wait for auth to settle
    if (!user) {
      navigate("/");
      return;
    }

    const db = getFirestore();

    // Fetch liked artworks once (not real-time) so unliked items stay visible until page reload
    const fetchData = async () => {
      try {
        const artworksSnap = await getDocs(collection(db, `users/${user.uid}/liked_artworks`));
        setLikedArtworks(artworksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const exhibitionsSnap = await getDocs(collection(db, `users/${user.uid}/liked_exhibitions`));
        setLikedExhibitions(exhibitionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        setLoading(false);
      } catch (error) {
        console.error("Error fetching liked items", error);
        setLoading(false);
      }
    };

    fetchData();

    // Safety fallback
    const timer = setTimeout(() => setLoading(false), 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [user, navigate, authLoading]);

  // Fetch or prompt for username
  useEffect(() => {
    if (!user) return;
    const db = getFirestore();
    const userDocRef = doc(db, `users/${user.uid}/profile/info`);
    getDoc(userDocRef).then((snap) => {
      if (snap.exists() && snap.data().username) {
        setUsername(snap.data().username);
      } else {
        // Use Google display name as default, or prompt
        const defaultName = user.displayName || user.email?.split('@')[0] || '';
        if (defaultName) {
          setUsername(defaultName);
        } else {
          setShowUsernamePrompt(true);
        }
      }
    });
  }, [user]);

  const saveUsername = async () => {
    if (!user || !usernameInput.trim()) return;
    const db = getFirestore();
    const userDocRef = doc(db, `users/${user.uid}/profile/info`);
    await setDoc(userDocRef, { username: usernameInput.trim() }, { merge: true });
    setUsername(usernameInput.trim());
    setShowUsernamePrompt(false);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  // 프로필 이미지 크기와 중앙 정렬 수정
  return (
    <div style={{ padding: isMobile ? "10px 2px" : "20px 3px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
      {/* Back Button */}
      <div
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          cursor: 'pointer',
          padding: '8px 12px',
          zIndex: 10,
          background: 'rgba(255,255,255,0.8)',
          borderRadius: '50%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          transition: 'background 0.2s',
          fontSize: 28,
          lineHeight: 1
        }}
        title="Go Back"
        className="hover-bg-gray"
      >
        ←
      </div>

      {/* Username Prompt Modal */}
      {showUsernamePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 280 }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>Choose your username</div>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Enter username"
              style={{ width: '100%', padding: 8, fontSize: 14, border: '1px solid #ccc', borderRadius: 4, marginBottom: 12 }}
            />
            <button
              onClick={saveUsername}
              style={{ width: '100%', padding: 10, background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Profile section */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
        <div
          style={{
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            backgroundColor: "#ccc",
            marginRight: "20px",
            cursor: "pointer",
            backgroundImage: user?.photoURL ? `url(${user.photoURL})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
          onClick={() => alert("Profile photo upload coming soon")}
        />
        <div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{username || user?.displayName || 'User'}</div>
          <div style={{ fontSize: "14px", color: "#555" }}>{user?.email || ""}</div>
        </div>
      </div>

      {/* Counters */}
      <div style={{ display: "flex", justifyContent: "space-around", margin: "20px 0", textAlign: "center", width: "100%" }}>
        <div>
          <div>Museums</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>0</div>
        </div>
        <div>
          <div>Exhibitions</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>{likedExhibitions.length}</div>
        </div>
        <div>
          <div>Artworks</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>{likedArtworks.length}</div>
        </div>
      </div>

      {/* 작품/전시 전환 버튼과 정렬 버튼 함께 배치 (정렬을 살짝 내림) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: isMobile ? "8px" : "20px",
          marginBottom: "20px",
          marginTop: "28px",
          width: "100%",
          paddingLeft: isMobile ? "0" : "40px",
          paddingRight: isMobile ? "0" : "40px"
        }}
      >
        <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} artworksCount={likedArtworks.length} exhibitionsCount={likedExhibitions.length} isMobile={isMobile} />
        <SortToggle sortMode={sortMode} setSortMode={setSortMode} isMobile={isMobile} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "2px",
          width: "100%"
        }}
      >
        {(() => {
          const items = viewMode === "artworks" ? likedArtworks : likedExhibitions;
          const sorted = [...items].sort((a, b) => {
            if (sortMode === 'recent') {
              // Sort by likedAt timestamp (most recent first)
              const aTime = a.likedAt?.seconds || a.likedAt?.toMillis?.() || 0;
              const bTime = b.likedAt?.seconds || b.likedAt?.toMillis?.() || 0;
              return bTime - aTime;
            } else if (sortMode === 'oldest') {
              // Sort by artwork year (oldest first)
              return (a.year || 0) - (b.year || 0);
            } else if (sortMode === 'newest') {
              // Sort by artwork year (newest first)
              return (b.year || 0) - (a.year || 0);
            }
            return 0;
          });
          return sorted.map((item, i) => {
            const isExhibition = viewMode === 'exhibitions';
            const itemId = isExhibition ? (item.exhibitionId || item.id) : (item.artworkId || item.id);
            const isHovered = hoveredItem === `${viewMode}-${i}`;
            return (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: "100%", // Aspect ratio square-ish
                  background: "#f0f0f0",
                  overflow: "hidden",
                  cursor: 'pointer'
                }}
                onMouseEnter={() => setHoveredItem(`${viewMode}-${i}`)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => {
                  if (isExhibition) {
                    // Save exhibition data to sessionStorage for HomePage to read
                    const targetId = item.exhibitionId || item.id;
                    if (targetId) {
                      // Store the exhibition item data for direct modal opening
                      sessionStorage.setItem('pendingExhibition', JSON.stringify({
                        id: targetId,
                        name: item.name || item.title || '',
                        image: item.image || '',
                        museumName: item.museumName || '',
                        // Include any other relevant fields
                      }));
                      navigate(`/?exhibition=${encodeURIComponent(targetId)}`);
                    }
                  } else if (item.youtubeId) {
                    // YouTube 영상인 경우 영상 라이트박스 열기
                    setLightboxYoutubeId(item.youtubeId);
                  } else if (item.image) {
                    setLightboxImage(item.image);
                  }
                }}
              >
                {/* YouTube 영상이면 썸네일 + 재생 아이콘 표시, 아니면 일반 이미지 */}
                {item.youtubeId ? (
                  <>
                    <img
                      src={`https://img.youtube.com/vi/${item.youtubeId}/maxresdefault.jpg`}
                      alt={item.title || item.name}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { 
                        // maxresdefault가 없으면 hqdefault로 폴백
                        if (e.currentTarget.src.includes('maxresdefault')) {
                          e.currentTarget.src = `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`;
                        } else if (item.image) {
                          e.currentTarget.src = item.image;
                        }
                      }}
                    />
                    {/* 재생 아이콘 오버레이 */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 40,
                      height: 40,
                      background: 'rgba(0,0,0,0.7)',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none'
                    }}>
                      <div style={{
                        width: 0,
                        height: 0,
                        borderLeft: '14px solid #fff',
                        borderTop: '8px solid transparent',
                        borderBottom: '8px solid transparent',
                        marginLeft: 3
                      }} />
                    </div>
                  </>
                ) : item.image ? (
                  <img
                    src={item.image}
                    alt={item.title || item.name}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    No Image
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "8px" }}>
                  {isExhibition ? (
                    <>
                      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>
                        {item.museumName || ''}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name || item.title}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.title || item.name}{item.year ? ` (${item.year})` : ''}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.8 }}>{item.artist}</div>
                    </>
                  )}
                </div>

                {/* Heart icon - always visible on mobile, hover on desktop */}
                {(() => {
                  const isUnliked = unlikedItems.has(itemId);
                  return (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "8px",
                        right: "8px",
                        opacity: isMobile ? 1 : (isHovered ? 1 : 0),
                        transition: "opacity 0.2s",
                        zIndex: 10
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isUnliked) {
                          handleRelike(item, isExhibition);
                        } else {
                          handleUnlike(itemId, isExhibition);
                        }
                      }}
                      title={isUnliked ? "Like again" : "Unlike"}
                    >
                      <svg
                        width={18}
                        height={18}
                        viewBox="0 0 24 24"
                        fill={isUnliked ? "none" : "#e11d48"}
                        stroke={isUnliked ? "#fff" : "#e11d48"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', cursor: 'pointer' }}
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                      </svg>
                    </div>
                  );
                })()}
              </div>
            );
          });
        })()}
      </div>

      {/* Lightbox Modal with smooth animation */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: 'zoom-out',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <img
            src={lightboxImage}
            alt="Full size"
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              objectFit: 'contain',
              borderRadius: '4px',
              animation: 'zoomIn 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              transformOrigin: 'center center'
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              color: '#fff',
              fontSize: 32,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            onClick={(e) => { e.stopPropagation(); setLightboxImage(null); }}
          >
            ✕
          </div>
        </div>
      )}

      {/* YouTube Video Lightbox Modal */}
      {lightboxYoutubeId && (
        <div
          onClick={() => setLightboxYoutubeId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            cursor: 'pointer',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '90vw',
              maxWidth: '1200px',
              aspectRatio: '16/9',
              animation: 'zoomIn 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${lightboxYoutubeId}?autoplay=1&rel=0&modestbranding=1`}
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
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              color: '#fff',
              fontSize: 32,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            onClick={(e) => { e.stopPropagation(); setLightboxYoutubeId(null); }}
          >
            ✕
          </div>
        </div>
      )}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes zoomIn {
            from { transform: scale(0.85); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};

export default MyPage;
// SortToggle - 탭 형태로 정렬 옵션을 나란히 표시 (모바일 지원)
const SortToggle: React.FC<{
  sortMode: "recent" | "oldest" | "newest";
  setSortMode: (mode: "recent" | "oldest" | "newest") => void;
  isMobile?: boolean;
}> = ({ sortMode, setSortMode, isMobile = false }) => {
  const options: { mode: "recent" | "oldest" | "newest"; label: string }[] = [
    { mode: "recent", label: "Added" },
    { mode: "oldest", label: "Oldest" },
    { mode: "newest", label: "Newest" },
  ];
  return (
    <div style={{
      display: "flex",
      borderRadius: isMobile ? "6px" : "8px",
      overflow: "hidden",
      border: "1px solid #e0e0e0",
      background: "#f5f5f5"
    }}>
      {options.map((opt) => (
        <button
          key={opt.mode}
          onClick={() => setSortMode(opt.mode)}
          style={{
            padding: isMobile ? "6px 16px" : "10px 20px",
            border: "none",
            cursor: "pointer",
            fontSize: isMobile ? "11px" : "14px",
            fontWeight: sortMode === opt.mode ? "600" : "400",
            background: sortMode === opt.mode ? "#111" : "transparent",
            color: sortMode === opt.mode ? "#fff" : "#666",
            transition: "all 0.2s ease",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
// ViewModeToggle - 탭 형태로 Artworks와 Exhibitions 표시 (모바일: 세로 배치)
const ViewModeToggle: React.FC<{
  viewMode: "artworks" | "exhibitions";
  setViewMode: (mode: "artworks" | "exhibitions") => void;
  artworksCount: number;
  exhibitionsCount: number;
  isMobile?: boolean;
}> = ({ viewMode, setViewMode, artworksCount, exhibitionsCount, isMobile = false }) => {
  return (
    <div style={{
      display: "flex",
      flexDirection: "row",
      borderRadius: isMobile ? "6px" : "8px",
      overflow: "hidden",
      border: "1px solid #e0e0e0",
      background: "#f5f5f5"
    }}>
      <button
        onClick={() => setViewMode("artworks")}
        style={{
          padding: isMobile ? "6px 12px" : "10px 20px",
          border: "none",
          cursor: "pointer",
          fontSize: isMobile ? "11px" : "14px",
          fontWeight: viewMode === "artworks" ? "600" : "400",
          background: viewMode === "artworks" ? "#111" : "transparent",
          color: viewMode === "artworks" ? "#fff" : "#666",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px"
        }}
      >
        Artworks
        <span style={{
          background: viewMode === "artworks" ? "rgba(255,255,255,0.2)" : "#ddd",
          padding: isMobile ? "1px 5px" : "2px 8px",
          borderRadius: "12px",
          fontSize: isMobile ? "10px" : "12px"
        }}>
          {artworksCount}
        </span>
      </button>
      <button
        onClick={() => setViewMode("exhibitions")}
        style={{
          padding: isMobile ? "6px 12px" : "10px 20px",
          border: "none",
          cursor: "pointer",
          fontSize: isMobile ? "11px" : "14px",
          fontWeight: viewMode === "exhibitions" ? "600" : "400",
          background: viewMode === "exhibitions" ? "#111" : "transparent",
          color: viewMode === "exhibitions" ? "#fff" : "#666",
          transition: "all 0.2s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px"
        }}
      >
        Exhibitions
        <span style={{
          background: viewMode === "exhibitions" ? "rgba(255,255,255,0.2)" : "#ddd",
          padding: isMobile ? "1px 5px" : "2px 8px",
          borderRadius: "12px",
          fontSize: isMobile ? "10px" : "12px"
        }}>
          {exhibitionsCount}
        </span>
      </button>
    </div>
  );
};