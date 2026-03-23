import { Suspense, lazy, useState, useEffect, useRef } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatedOverlay } from "./components/AnimatedOverlay";
import DrawingLoader, { TransitionBadge } from "./components/DrawingLoader";
import { exhibitions } from "./data/exhibitions";
import Navbar from "./components/Navbar";
import { OnboardingGuard } from "./components/OnboardingGuard";
import { useNavigate } from "react-router-dom";
import CommunityPanel from "./components/Community/CommunityPanel";

// Lazy load pages for code splitting
const HomePage = lazy(() => import("./pages/HomePage"));
const ArtistPage = lazy(() => import("./pages/ArtistPage"));
const WorkPage = lazy(() => import("./pages/WorkPage"));
const ExhibitionPage = lazy(() => import("./pages/ExhibitionPage"));
const Login = lazy(() => import("./components/Login"));
const SignUp = lazy(() => import("./components/SignUp"));
const MyPage = lazy(() => import("./components/Mypage"));
const AdminImport = lazy(() => import("./pages/AdminImport"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const TateModernPermanentPage = lazy(() => import("./pages/TateModernPermanentPage"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage").then(module => ({ default: module.PaymentSuccessPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const LoginCallbackPage = lazy(() => import("./pages/LoginCallbackPage"));
const CommunityPage = lazy(() => import("./pages/community/CommunityPage"));
const WritePostPage = lazy(() => import("./pages/community/WritePostPage"));
const PostDetailPage = lazy(() => import("./pages/community/PostDetailPage"));

// Drawing-concept loader — unified across all routes
const PageLoader = () => <DrawingLoader visible={true} />;

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Route-transition loader ─────────────────────────────────────
  // Shows DrawingLoader for ~600ms whenever the main pathname changes
  // (excludes overlay routes: /mypage, /community, /admin)
  const [transitioning, setTransitioning] = useState(false);
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    const OVERLAY_PREFIXES = ['/mypage', '/community', '/admin'];
    const wasOverlay = OVERLAY_PREFIXES.some(p => prevPath.current.startsWith(p));
    const isOverlayNow = OVERLAY_PREFIXES.some(p => location.pathname.startsWith(p));
    if (prevPath.current !== location.pathname && !wasOverlay && !isOverlayNow) {
      setTransitioning(true);
      const t = setTimeout(() => setTransitioning(false), 650);
      prevPath.current = location.pathname;
      return () => clearTimeout(t);
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  const [isCommunityPanelOpen, setIsCommunityPanelOpen] = useState(false);
  const [mapMode, setMapMode] = useState<'default' | 'drawing' | 'interactive'>('default');

  useEffect(() => {
    const handleMapMode = (e: Event) => {
      const mode = (e as CustomEvent).detail as 'default' | 'drawing' | 'interactive';
      setMapMode(mode);
    };
    window.addEventListener('map-mode-changed', handleMapMode);
    return () => window.removeEventListener('map-mode-changed', handleMapMode);
  }, []);

  useEffect(() => {
    const handleToggle = () => setIsCommunityPanelOpen(prev => !prev);
    const handleOpenPanel = () => setIsCommunityPanelOpen(true);
    const handleClosePanel = () => setIsCommunityPanelOpen(false);

    window.addEventListener('toggle-community-panel', handleToggle);
    window.addEventListener('open-community-panel', handleOpenPanel);
    window.addEventListener('close-community-panel', handleClosePanel);
    return () => {
      window.removeEventListener('toggle-community-panel', handleToggle);
      window.removeEventListener('open-community-panel', handleOpenPanel);
      window.removeEventListener('close-community-panel', handleClosePanel);
    };
  }, [navigate]);

  const isMyPage = location.pathname.startsWith('/mypage');
  const isCommunity = location.pathname.startsWith('/community');
  const isAdmin = location.pathname.startsWith('/admin');
  const isArtistPage = location.pathname.startsWith('/artist/');

  // Freeze location for overlays so they don't render empty when closing
  const [frozenMyPageLoc, setFrozenMyPageLoc] = useState(location);
  const [frozenCommunityLoc, setFrozenCommunityLoc] = useState(location);
  const [frozenAdminLoc, setFrozenAdminLoc] = useState(location);

  useEffect(() => { if (isMyPage) setFrozenMyPageLoc(location); }, [isMyPage, location]);
  useEffect(() => { if (isCommunity) setFrozenCommunityLoc(location); }, [isCommunity, location]);
  useEffect(() => { if (isAdmin) setFrozenAdminLoc(location); }, [isAdmin, location]);

  const isOverlayOpen = isMyPage || isCommunity || isAdmin;
  const [frozenBaseLoc, setFrozenBaseLoc] = useState(location);

  useEffect(() => {
    if (!isOverlayOpen) {
      setFrozenBaseLoc(location);
    }
  }, [isOverlayOpen, location]);

  let baseTransform = 'translate(0, 0)';
  if (isMyPage) baseTransform = 'translateX(-30vw)'; // Push slightly left
  else if (isCommunity) baseTransform = 'translateY(-30vh)'; // Push slightly up
  else if (isAdmin) baseTransform = 'translateY(30vh)'; // Push slightly down

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden', background: '#000' }}>
      <OnboardingGuard />
      <Navbar />

      {/* Route-transition badge — floats above page, fades in/out smoothly */}
      <TransitionBadge show={transitioning} />

      {/* Main Base Layer */}
      <div style={{
        width: '100%', height: '100%',
        overflowY: isArtistPage ? 'auto' : undefined,
        transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: baseTransform,
        willChange: 'transform'
      }}>
        <Suspense fallback={<PageLoader />}>
          <Routes location={isOverlayOpen ? frozenBaseLoc : location}>
            <Route element={<HomePage exhibitions={exhibitions} isOverlayOpen={isOverlayOpen} />}>
              <Route path="/" element={null} />
              <Route path="/collection/:collectionId" element={null} />
              <Route path="/artist-gallery/:artistName" element={null} />
            </Route>
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/work/:id" element={<WorkPage />} />
            <Route path="/exhibition/:id" element={<ExhibitionPage exhibitions={exhibitions} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/login/callback" element={<LoginCallbackPage />} />
            <Route path="/tate-modern/permanent" element={<TateModernPermanentPage />} />
            <Route path="/payment/success" element={<PaymentSuccessPage />} />
            <Route path="/payment/fail" element={<PaymentSuccessPage />} />
          </Routes>
        </Suspense>
      </div>

      {/* Overlays */}
      <AnimatedOverlay
        isActive={isMyPage}
        transformActive="translateX(0)"
        transformHidden="translateX(100vw)"
        zIndex={100000}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={isMyPage ? location : frozenMyPageLoc}>
            <Route path="/mypage" element={<MyPage />} />
          </Routes>
        </Suspense>
      </AnimatedOverlay>

      <AnimatedOverlay
        isActive={isCommunity}
        transformActive="translateY(0)"
        transformHidden="translateY(100vh)"
        zIndex={100000}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={isCommunity ? location : frozenCommunityLoc}>
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/community/write" element={<WritePostPage />} />
            <Route path="/community/post/:id" element={<PostDetailPage />} />
          </Routes>
        </Suspense>
      </AnimatedOverlay>

      <AnimatedOverlay
        isActive={isAdmin}
        transformActive="translateY(0)"
        transformHidden="translateY(-100vh)"
        zIndex={100000}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={isAdmin ? location : frozenAdminLoc}>
            <Route path="/admin/import" element={<AdminImport />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
      </AnimatedOverlay>

      {/* Persistent Community Panel */}
      <CommunityPanel isOpen={isCommunityPanelOpen} onClose={() => setIsCommunityPanelOpen(false)} mapMode={mapMode === 'interactive' ? 'drawing' : mapMode} />

      {/* Global Community Toggle Button (Hidden when Community page or panel is open) */}
      {!isCommunity && !isCommunityPanelOpen && (
        mapMode === 'drawing' ? (
          /* Drawing Map community button - brutalist sketch style */
          <button
            onClick={() => setIsCommunityPanelOpen(true)}
            style={{
              position: 'fixed',
              bottom: '28px',
              right: '28px',
              width: 'auto',
              height: 'auto',
              padding: '10px 16px',
              background: '#CCFF00',
              color: '#111111',
              border: '2.5px solid #111111',
              borderRadius: 0,
              boxShadow: '3px 3px 0 #111111',
              cursor: 'pointer',
              zIndex: 200001,
              fontFamily: "'Space Mono', 'Courier New', monospace",
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              outline: 'none',
              transition: 'box-shadow 0.1s, transform 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '1px 1px 0 #111111'; e.currentTarget.style.transform = 'translate(2px,2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '3px 3px 0 #111111'; e.currentTarget.style.transform = 'none'; }}
            title="커뮤니티 열기"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            COMMUNITY
          </button>
        ) : mapMode === 'interactive' ? (
          /* Interactive Map community button - elegant text style */
          <button
            onClick={() => setIsCommunityPanelOpen(true)}
            style={{
              position: 'fixed',
              bottom: '34px',
              right: '34px',
              cursor: 'pointer',
              zIndex: 200001,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              outline: 'none',
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              transition: 'color 0.2s',
              mixBlendMode: 'difference'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
            title="커뮤니티 열기"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Community
          </button>
        ) : (
          /* Default community button - clean minimal */
          <button
            onClick={() => setIsCommunityPanelOpen(true)}
            style={{
              position: 'fixed',
              bottom: '28px',
              right: '28px',
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'rgba(17,17,17,0.9)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              zIndex: 200001,
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s, background 0.2s',
              outline: 'none',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.background = 'rgba(40,40,40,0.95)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(17,17,17,0.9)'; }}
            title="커뮤니티 열기"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;