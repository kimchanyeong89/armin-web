import { Suspense, lazy, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { signOut } from "firebase/auth";
import DrawingLoader, { TransitionBadge } from "./components/DrawingLoader";
import { exhibitions } from "./data/exhibitions";
import { OnboardingGuard } from "./components/OnboardingGuard";
import CommunityPanel from "./components/Community/CommunityPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AnimatePresence, motion } from "framer-motion";
import BottomPageNavigator, { MAIN_TABS, resolveMainTabIndex } from "./components/BottomPageNavigator";
import { LogOut, ShoppingCart, User } from "lucide-react";
import ProfileAvatar from "./components/ProfileAvatar";
import { createFirebaseWebPort } from "./adapters/firebaseWebAdapter";
import type { ProfileImageCrop } from "./types/Profile";
import { isMobileAppContainer } from "./utils/mobileAppAuth";
import { CartProvider, useCart } from "./contexts/CartContext";
import { auth } from "./firebase";
import { ensureSharedSearchWorkerLoaded } from "./utils/searchWorkerRuntime";

// Lazy load pages for code splitting
const HomePage = lazy(() => import("./pages/HomePage"));
const WorkPage = lazy(() => import("./pages/WorkPage"));
const ExhibitionPage = lazy(() => import("./pages/ExhibitionPage"));
const Login = lazy(() => import("./components/Login"));
const SignUp = lazy(() => import("./components/SignUp"));
const MyPage = lazy(() => import("./components/Mypage"));
const AdminImport = lazy(() => import("./pages/AdminImport"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminWeeklyPage = lazy(() => import("./pages/AdminWeeklyPage"));
const TateModernPermanentPage = lazy(() => import("./pages/TateModernPermanentPage"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage").then(module => ({ default: module.PaymentSuccessPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const LoginCallbackPage = lazy(() => import("./pages/LoginCallbackPage"));
const CommunityPage = lazy(() => import("./pages/community/CommunityPage"));
const WritePostPage = lazy(() => import("./pages/community/WritePostPage"));
const PostDetailPage = lazy(() => import("./pages/community/PostDetailPage"));
const ExhibitionsNearMePage = lazy(() => import("./pages/ExhibitionsNearMePage"));
const AICurationHubPage = lazy(() => import("./pages/AICurationHubPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CartPage = lazy(() => import("./pages/CartPage"));

// Drawing-concept loader — unified across all routes
const PageLoader = () => <DrawingLoader visible={true} />;

function isSwipeBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    "input, textarea, select, button, a, [role='button'], [contenteditable='true'], [data-no-swipe='true']",
  );
}

const routeSlideVariants = {
  initial: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? "26%" : "-26%",
    opacity: direction === 0 ? 1 : 0.88,
  }),
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      type: "tween",
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: (direction: number) => ({
    x: direction === 0 ? 0 : direction > 0 ? "-22%" : "22%",
    opacity: direction === 0 ? 1 : 0.88,
    transition: {
      type: "tween",
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

const MAP_PATH_STORAGE_KEY = "armin:last-map-path";
const firebaseWebPort = createFirebaseWebPort();

function RequireSignedIn({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  if (!user || user.isAnonymous) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { itemCount } = useCart();
  const languageMorphScopeRef = useRef<HTMLDivElement | null>(null);
  const prevLanguageRef = useRef(language);

  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem('homeTheme') === 'light';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Ensure first-time visitors start in dark mode unless they explicitly picked light.
    try {
      const stored = localStorage.getItem('homeTheme');
      if (stored !== 'light' && stored !== 'dark') {
        localStorage.setItem('homeTheme', 'dark');
        setIsLightTheme(false);
      }
    } catch {
      // ignore storage failures
    }

    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem('homeTheme') === 'light');
      } catch {
        setIsLightTheme(false);
      }
    };

    window.addEventListener('theme-changed', syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      window.removeEventListener('theme-changed', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  useEffect(() => {
    if (prevLanguageRef.current === language) return;
    prevLanguageRef.current = language;

    const scope = languageMorphScopeRef.current;
    if (!scope) return;

    scope.animate(
      [
        { filter: "blur(0px)", transform: "translateY(0px) scale(1)", letterSpacing: "0em" },
        { filter: "blur(0.8px)", transform: "translateY(-1px) scale(1.004)", letterSpacing: "0.01em" },
        { filter: "blur(0px)", transform: "translateY(0px) scale(1)", letterSpacing: "0em" },
      ],
      {
        duration: 420,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  }, [language]);

  const toggleGlobalTheme = () => {
    const nextLight = !isLightTheme;
    try {
      localStorage.setItem('homeTheme', nextLight ? 'light' : 'dark');
    } catch {
      // ignore storage failures
    }
    setIsLightTheme(nextLight);
    window.dispatchEvent(new CustomEvent('theme-changed'));
  };

  useEffect(() => {
    // Warm up primary tab pages so first tab switch feels instant.
    void import("./pages/community/CommunityPage");
    void import("./components/Mypage");
    void import("./pages/AICurationHubPage");
    void import("./pages/SearchPage");

    // Mobile shell: prewarm search worker at app launch so first query is faster.
    if (isMobileAppContainer()) {
      ensureSharedSearchWorkerLoaded();
    }
  }, []);

  // Route-transition badge
  const [transitioning, setTransitioning] = useState(false);
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      setTransitioning(true);
      const t = setTimeout(() => setTransitioning(false), 460);
      prevPath.current = location.pathname;
      return () => clearTimeout(t);
    }
    prevPath.current = location.pathname;
  }, [location.pathname]);

  const [isCommunityPanelOpen, setIsCommunityPanelOpen] = useState(false);
  const [isFloatingActionsOpen, setIsFloatingActionsOpen] = useState(false);
  const [mapMode, setMapMode] = useState<'default' | 'drawing' | 'interactive'>('default');
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profileImageCrop, setProfileImageCrop] = useState<ProfileImageCrop | null>(null);
  // True iff Firestore data.photoURL is set (user has uploaded a custom
  // photo). Used to decide whether the saved crop should be applied —
  // a stale crop must NOT be applied when we're rendering the OAuth
  // provider's avatar fallback.
  const [hasCustomPhotoSaved, setHasCustomPhotoSaved] = useState<boolean>(false);

  // Draggable profile button position (Y offset from top)
  const [profileDragY, setProfileDragY] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('armin:profileBtnY');
      if (saved !== null) {
        const v = Number(saved);
        if (Number.isFinite(v) && v >= 0) return v;
      }
    } catch { /* ignore */ }
    return -1; // -1 = use default CSS position
  });
  const profileDragRef = useRef<{ startY: number; startDragY: number } | null>(null);
  const profileIsDragging = useRef(false);
  const profileBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleMove = (clientY: number) => {
      if (!profileIsDragging.current || !profileDragRef.current) return;
      const dy = clientY - profileDragRef.current.startY;
      let newY = profileDragRef.current.startDragY + dy;
      newY = Math.max(0, Math.min(newY, (window.innerHeight || 800) - 60));
      setProfileDragY(newY);
    };
    const handleEnd = () => {
      if (!profileIsDragging.current) return;
      profileIsDragging.current = false;
      profileDragRef.current = null;
      // Save position
      setProfileDragY(prev => {
        try { localStorage.setItem('armin:profileBtnY', String(prev)); } catch { /* */ }
        return prev;
      });
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientY);
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) handleMove(e.touches[0].clientY); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', handleEnd);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setProfilePhotoUrl(null);
      setProfileImageCrop(null);
      setHasCustomPhotoSaved(false);
      return;
    }

    let mounted = true;

    const stopObserve = firebaseWebPort.profile.observeUserProfile?.(
      user.uid,
      (data) => {
        if (!mounted) return;
        setProfilePhotoUrl(data?.photoURL || user.photoURL || null);
        setProfileImageCrop(data?.profileImageCrop || null);
        setHasCustomPhotoSaved(!!data?.photoURL);
      },
      () => {
        if (!mounted) return;
        setProfilePhotoUrl(user.photoURL || null);
        setProfileImageCrop(null);
        setHasCustomPhotoSaved(false);
      },
    );

    if (!stopObserve) {
      void firebaseWebPort.profile
        .getUserProfile(user.uid)
        .then((data) => {
          if (!mounted) return;
          setProfilePhotoUrl(data?.photoURL || user.photoURL || null);
          setProfileImageCrop(data?.profileImageCrop || null);
          setHasCustomPhotoSaved(!!data?.photoURL);
        })
        .catch(() => {
          if (!mounted) return;
          setProfilePhotoUrl(user.photoURL || null);
          setProfileImageCrop(null);
          setHasCustomPhotoSaved(false);
        });
    }

    const forceRefresh = () => {
      // onSnapshot already keeps this synced; this event is a safety net.
      setProfilePhotoUrl((prev) => prev || user.photoURL || null);
    };
    window.addEventListener("profile-updated", forceRefresh);

    return () => {
      mounted = false;
      window.removeEventListener("profile-updated", forceRefresh);
      if (typeof stopObserve === "function") stopObserve();
    };
  }, [user]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('community-panel-visibility', { detail: { open: isCommunityPanelOpen } }));
  }, [isCommunityPanelOpen]);

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

  useEffect(() => {
    const handleAuthRequest = () => {
      if (authLoading) return;
      if (!isMobileAppContainer()) return;
      if (user && !user.isAnonymous) return;
      navigate('/login?mobileApp=1', { state: { from: `${location.pathname}${location.search}` } });
    };

    window.addEventListener('auth:request-login', handleAuthRequest);
    return () => window.removeEventListener('auth:request-login', handleAuthRequest);
  }, [authLoading, location.pathname, location.search, navigate, user]);

  useEffect(() => {
    setIsFloatingActionsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const activeTabIndex = resolveMainTabIndex(location.pathname);
  const isCartRoute = location.pathname === "/cart";
  const isBottomNavVisible = activeTabIndex !== null || isCartRoute;
  const isDesktopViewport = viewportWidth > 768;
  const isFloatingControlsVisible = isBottomNavVisible || isCartRoute || isDesktopViewport;

  const [slideDirection, setSlideDirection] = useState(0);
  const slideDirectionRef = useRef(0);
  const updateSlideDirection = (next: number) => {
    slideDirectionRef.current = next;
    setSlideDirection(next);
  };

  const resolveLastMapPath = () => {
    try {
      const savedPath = sessionStorage.getItem(MAP_PATH_STORAGE_KEY);
      if (!savedPath) return "/";
      const pathOnly = savedPath.split("?")[0] || "/";
      return resolveMainTabIndex(pathOnly) === 0 ? savedPath : "/";
    } catch {
      return "/";
    }
  };

  const prevTabIndex = useRef<number | null>(activeTabIndex);
  const lastNonNullTabIndexRef = useRef<number>(activeTabIndex ?? 0);

  useEffect(() => {
    if (activeTabIndex !== null) {
      lastNonNullTabIndexRef.current = activeTabIndex;
    }
  }, [activeTabIndex]);

  useEffect(() => {
    if (activeTabIndex !== 0) return;
    try {
      sessionStorage.setItem(MAP_PATH_STORAGE_KEY, `${location.pathname}${location.search}`);
    } catch {
      // ignore storage failures
    }
  }, [activeTabIndex, location.pathname, location.search]);

  useEffect(() => {
    if (activeTabIndex !== null && prevTabIndex.current !== null && activeTabIndex !== prevTabIndex.current) {
      updateSlideDirection(activeTabIndex > prevTabIndex.current ? 1 : -1);
    }
    prevTabIndex.current = activeTabIndex;
  }, [activeTabIndex]);

  // Horizontal-swipe-to-switch-tab gesture removed by user request:
  // it triggered far too often on incidental finger drags during normal
  // browsing (e.g. dragging the globe, scrolling lists with a slight
  // horizontal component) and silently navigated to the wrong tab.
  // Tab navigation now goes exclusively through the bottom nav bar's
  // tap targets, which is unambiguous.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (_e: ReactPointerEvent<HTMLDivElement>) => { /* no-op */ };
  const onPointerUp = (_e: ReactPointerEvent<HTMLDivElement>) => { /* no-op */ };
  // Reference kept so TS doesn't flag the unused ref binding above.
  void swipeStartRef;

  const handleBottomNavChange = (targetIndex: number) => {
    if (activeTabIndex !== null && targetIndex === activeTabIndex) return;
    const target = MAIN_TABS[targetIndex];
    if (!target) return;
    if (activeTabIndex !== null && targetIndex !== activeTabIndex) {
      updateSlideDirection(targetIndex > activeTabIndex ? 1 : -1);
    }
    if (target.id === 'community') setIsCommunityPanelOpen(false);
    if (target.id === "map") {
      navigate(resolveLastMapPath());
      return;
    }
    navigate(target.path);
  };

  const isAuthedUser = !!user && !user.isAnonymous;
  const profileInitial = (user?.displayName || user?.email || 'A').trim().slice(0, 1).toUpperCase();
  const effectiveProfilePhoto = profilePhotoUrl || user?.photoURL || null;
  // Only apply the saved crop when Firestore says the user actually has a
  // custom photo. If we're rendering the OAuth provider fallback, a stale
  // crop from an old custom upload would push that photo off-screen.
  const effectiveProfileCrop = hasCustomPhotoSaved ? profileImageCrop : null;
  const isMobileShell = isMobileAppContainer();
  const isDesktopQuickMenu = !isMobileShell && viewportWidth >= 1024;
  const floatingButtonSize = isMobileShell ? 40 : (isDesktopQuickMenu ? 54 : 46);
  const floatingRight = isMobileShell ? 14 : (isDesktopQuickMenu ? 24 : 18);
  const floatingButtonGap = isMobileShell ? 8 : (isDesktopQuickMenu ? 12 : 10);
  const floatingStep = floatingButtonSize + floatingButtonGap;
  const floatingTopBase = isMobileShell
    ? 'calc(env(safe-area-inset-top, 0px) + 10px)'
    : 'max(12px, calc(env(safe-area-inset-top, 0px) + 10px))';
  const floatingBottomBase = isDesktopQuickMenu
    ? 'max(20px, calc(env(safe-area-inset-bottom, 0px) + 18px))'
    : 'auto';
  // Profile button top: use drag position if pinned, otherwise default CSS cascade
  const profileBtnTop = (!isDesktopQuickMenu && profileDragY >= 0)
    ? profileDragY
    : undefined;
  const floatingProfileTopCSS = profileBtnTop !== undefined
    ? `${profileBtnTop}px`
    : `calc(${floatingTopBase} + ${floatingStep * 2}px)`;
  const floatingProfileTop = `calc(${floatingTopBase} + ${floatingStep * 2}px)`;

  // Action buttons: when profile is dragged, position relative to its pixel Y.
  // When not dragged, fall back to CSS calc expressions above the default profile position.
  const _draggedY = profileBtnTop; // pixel Y of profile, or undefined
  const floatingActionTop1 = _draggedY !== undefined
    ? `${Math.max(0, _draggedY - floatingStep)}px`             // MyPage: 1 step above profile
    : `calc(${floatingTopBase} + ${floatingStep}px)`;
  const floatingActionTop2 = _draggedY !== undefined
    ? `${Math.max(0, _draggedY - floatingStep * 2)}px`         // Logout: 2 steps above profile
    : floatingTopBase;
  const floatingActionTop3 = _draggedY !== undefined
    ? `${Math.min(typeof window !== 'undefined' ? window.innerHeight - floatingStep : 9999, _draggedY + floatingStep)}px`   // Cart: 1 step below
    : `calc(${floatingTopBase} + ${floatingStep * 3}px)`;
  const floatingActionTop4 = _draggedY !== undefined
    ? `${Math.min(typeof window !== 'undefined' ? window.innerHeight - floatingStep : 9999, _draggedY + floatingStep * 2)}px` // Language: 2 steps below
    : `calc(${floatingTopBase} + ${floatingStep * 4}px)`;
  const floatingActionTop5 = _draggedY !== undefined
    ? `${Math.min(typeof window !== 'undefined' ? window.innerHeight - floatingStep : 9999, _draggedY + floatingStep * 3)}px` // Theme: 3 steps below
    : `calc(${floatingTopBase} + ${floatingStep * 5}px)`;
  const floatingActionTop6 = _draggedY !== undefined
    ? `${Math.min(typeof window !== 'undefined' ? window.innerHeight - floatingStep : 9999, _draggedY + floatingStep * 4)}px` // Logout: 4 steps below
    : `calc(${floatingTopBase} + ${floatingStep * 6}px)`;
  const floatingActionBottom1 = `calc(${floatingBottomBase} + ${floatingStep}px)`;
  const floatingActionBottom2 = `calc(${floatingBottomBase} + ${floatingStep * 2}px)`;
  const floatingActionBottom3 = `calc(${floatingBottomBase} + ${floatingStep * 3}px)`;
  const floatingActionBottom4 = `calc(${floatingBottomBase} + ${floatingStep * 4}px)`;

  const handleProfileMainClick = async () => {
    if (!isAuthedUser) {
      setIsFloatingActionsOpen(false);
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    setIsFloatingActionsOpen((prev) => !prev);
  };

  const handleQuickLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore signout failure and continue navigation reset.
    } finally {
      setIsFloatingActionsOpen(false);
      navigate('/');
    }
  };

  const appShellBackground = isLightTheme ? '#f5f5f5' : '#050505';
  // Keep interactive globe mounted across /interactive <-> /interactive/:country/:city/:exhibition
  // transitions so map drill state/panel state doesn't reset when closing the modal.
  const isInteractiveRoute = location.pathname === '/interactive' || location.pathname.startsWith('/interactive/');
  const routeKey = isInteractiveRoute ? '/interactive' : `${location.pathname}${location.search}`;

  const LegacyArtistRedirect = () => {
    const { id } = useParams<{ id: string }>();
    const redirectParams = new URLSearchParams(location.search);
    if (!redirectParams.get("name") && id) {
      redirectParams.set("name", decodeURIComponent(id).replace(/[-_]+/g, " "));
    }
    const q = redirectParams.toString();
    const target = `/artist-gallery/${encodeURIComponent(id || "")}${q ? `?${q}` : ""}`;
    return <Navigate to={target} replace />;
  };

  return (
    <div
      style={{ position: 'relative', width: '100vw', height: '100dvh', minHeight: '100svh', overflow: 'hidden', background: appShellBackground }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <OnboardingGuard />
      <TransitionBadge show={transitioning} />

      <div ref={languageMorphScopeRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <AnimatePresence initial={false} mode="sync" custom={slideDirectionRef.current}>
          <motion.div
            key={routeKey}
            custom={slideDirectionRef.current}
            variants={routeSlideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', willChange: 'transform', background: appShellBackground }}
          >
            <Suspense fallback={<PageLoader />}>
              {/* Top-level ErrorBoundary so that a single thrown render in
                  any route can't blank the entire React tree (which on
                  React Native WebView shows up as iOS reloading the app
                  back to the Expo "Opening project..." menu). */}
              <ErrorBoundary label="Page">
              <Routes location={location}>
                <Route element={<HomePage exhibitions={exhibitions} isOverlayOpen={false} />}>
                  <Route path="/" element={null} />
                  <Route path="/interactive" element={null} />
                  <Route path="/interactive/:countrySlug/:citySlug/:exhibitionId" element={null} />
                  <Route path="/collection/:collectionId" element={null} />
                  <Route path="/artist-gallery/:artistName" element={null} />
                </Route>
                <Route path="/community" element={<CommunityPage />} />
                <Route path="/community/write" element={<WritePostPage />} />
                <Route path="/community/post/:id" element={<PostDetailPage />} />
                <Route path="/ai" element={<AICurationHubPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/mypage" element={<RequireSignedIn><MyPage /></RequireSignedIn>} />
                <Route path="/exhibitions" element={<ExhibitionsNearMePage exhibitions={exhibitions} />} />
                <Route path="/artist/:id" element={<LegacyArtistRedirect />} />
                <Route path="/work/:id" element={<WorkPage />} />
                <Route path="/exhibition/:id" element={<ExhibitionPage exhibitions={exhibitions} />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/login/callback" element={<LoginCallbackPage />} />
                <Route path="/tate-modern/permanent" element={<TateModernPermanentPage />} />
                <Route path="/payment/success" element={<PaymentSuccessPage />} />
                <Route path="/payment/fail" element={<PaymentSuccessPage />} />
                <Route path="/admin/import" element={<AdminImport />} />
                <Route path="/admin/weekly" element={<AdminWeeklyPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Routes>
              </ErrorBoundary>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      <CommunityPanel isOpen={isCommunityPanelOpen} onClose={() => setIsCommunityPanelOpen(false)} mapMode={mapMode} />

      {isFloatingControlsVisible && (
        <>
          <AnimatePresence>
            {isFloatingActionsOpen && (
              <>
                {isDesktopQuickMenu ? (
                  <motion.div
                    initial={{ opacity: 0, x: 14, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 12, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      position: 'fixed',
                      right: `calc(${floatingRight}px + ${floatingButtonSize}px + 6px)`,
                      bottom: `calc(${floatingBottomBase} + 6px)`,
                      zIndex: 250012,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px',
                      borderRadius: 999,
                      border: isLightTheme ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.20)',
                      background: isLightTheme ? 'rgba(255,255,255,0.94)' : 'rgba(18,18,18,0.92)',
                      boxShadow: isLightTheme
                        ? '0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.58)'
                        : '0 14px 28px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                    }}
                  >
                    <button
                      onClick={handleQuickLogout}
                      style={{
                        border: isLightTheme ? '1px solid rgba(180,30,30,0.18)' : '1px solid rgba(255,80,80,0.22)',
                        height: 36,
                        borderRadius: 999,
                        padding: '0 14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        background: isLightTheme ? 'rgba(200,30,30,0.07)' : 'rgba(255,60,60,0.10)',
                        color: isLightTheme ? '#b01c1c' : '#ff7070',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                      }}
                      title={t({ ko: '로그아웃', en: 'Logout' })}
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v6A1.5 1.5 0 0 0 2.5 11H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M8.5 4.5L11 6.5L8.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="11" y1="6.5" x2="5" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {t({ ko: 'LOGOUT', en: 'LOGOUT' })}
                    </button>
                  </motion.div>
                ) : null}

                <motion.button
                  initial={{ opacity: 0, y: -10, scale: 0.86 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.88 }}
                  transition={{ duration: 0.24, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => {
                    navigate('/cart');
                    setIsFloatingActionsOpen(false);
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    position: 'fixed',
                    right: floatingRight,
                    top: isDesktopQuickMenu ? 'auto' : floatingActionTop3,
                    bottom: isDesktopQuickMenu ? floatingActionBottom1 : 'auto',
                    zIndex: 250012,
                    width: floatingButtonSize,
                    height: floatingButtonSize,
                    padding: 0,
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    border: isLightTheme ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.22)',
                    background: isLightTheme ? '#ffffff' : 'rgba(22,22,22,0.88)',
                    color: isLightTheme ? '#111111' : '#ffffff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isLightTheme
                      ? '0 8px 22px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.55)'
                      : '0 12px 26px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  }}
                  title={t({ ko: '장바구니', en: 'Cart' })}
                >
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <ShoppingCart size={isMobileShell ? 18 : 20} strokeWidth={2.2} />
                    {itemCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -8,
                          right: -10,
                          minWidth: 18,
                          height: 18,
                          borderRadius: 999,
                          background: '#BFFF0A',
                          color: '#111',
                          fontSize: 10,
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 4px',
                        }}
                      >
                        {itemCount > 99 ? '99+' : itemCount}
                      </span>
                    )}
                  </span>
                </motion.button>

                <motion.button
                  initial={{ opacity: 0, y: -10, scale: 0.86 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.88 }}
                  transition={{ duration: 0.24, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => {
                    toggleLanguage();
                    setIsFloatingActionsOpen(false);
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    position: 'fixed',
                    right: floatingRight,
                    top: isDesktopQuickMenu ? 'auto' : floatingActionTop4,
                    bottom: isDesktopQuickMenu ? floatingActionBottom2 : 'auto',
                    zIndex: 250012,
                    width: floatingButtonSize,
                    height: floatingButtonSize,
                    padding: 0,
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    border: isLightTheme ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.22)',
                    background: language === 'ko' ? '#BFFF0A' : (isLightTheme ? '#ffffff' : 'rgba(22,22,22,0.88)'),
                    color: language === 'ko' ? '#000' : (isLightTheme ? '#111' : '#fff'),
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    boxShadow: isLightTheme
                      ? '0 8px 22px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.55)'
                      : '0 12px 26px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                  title={t({ ko: '언어 변경', en: 'Switch language' })}
                >
                  {language === 'ko' ? 'KR' : 'EN'}
                </motion.button>

                <motion.button
                  initial={{ opacity: 0, y: -10, scale: 0.86 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.88 }}
                  transition={{ duration: 0.24, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => {
                    toggleGlobalTheme();
                    setIsFloatingActionsOpen(false);
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    position: 'fixed',
                    right: floatingRight,
                    top: isDesktopQuickMenu ? 'auto' : floatingActionTop5,
                    bottom: isDesktopQuickMenu ? floatingActionBottom3 : 'auto',
                    zIndex: 250012,
                    width: floatingButtonSize,
                    height: floatingButtonSize,
                    padding: 0,
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    border: isLightTheme ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.22)',
                    background: isLightTheme ? '#ffffff' : 'rgba(22,22,22,0.88)',
                    color: isLightTheme ? '#111111' : '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: isLightTheme
                      ? '0 8px 22px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.55)'
                      : '0 12px 26px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  }}
                  title={isLightTheme ? t({ ko: '다크 모드로 전환', en: 'Switch to dark mode' }) : t({ ko: '라이트 모드로 전환', en: 'Switch to light mode' })}
                >
                  <span style={{ position: 'relative', width: 20, height: 20, display: 'block' }}>
                    <svg
                      width={20} height={20} viewBox="0 0 20 20"
                      style={{
                        position: 'absolute', inset: 0,
                        opacity: isLightTheme ? 1 : 0,
                        transform: isLightTheme ? 'rotate(0deg) scale(1)' : 'rotate(60deg) scale(0.6)',
                        transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      <circle cx={10} cy={10} r={3.6} fill="#BFFF0A" />
                      {[0, 45, 90, 135, 180, 225, 270, 315].map((ang, i) => {
                        const r = Math.PI / 180;
                        const a = ang * r;
                        const half = 0.38;
                        const ox = 10;
                        const oy = 10;
                        const ir = 5.2;
                        const or = 8.6;
                        return (
                          <polygon
                            key={i}
                            fill="#BFFF0A"
                            points={[
                              `${ox + ir * Math.sin(a - half)},${oy - ir * Math.cos(a - half)}`,
                              `${ox + or * Math.sin(a)},${oy - or * Math.cos(a)}`,
                              `${ox + ir * Math.sin(a + half)},${oy - ir * Math.cos(a + half)}`,
                            ].join(' ')}
                          />
                        );
                      })}
                    </svg>
                    <svg
                      width={20} height={20} viewBox="0 0 20 20" fill="none"
                      style={{
                        position: 'absolute', inset: 0,
                        opacity: isLightTheme ? 0 : 1,
                        transform: isLightTheme ? 'rotate(-60deg) scale(0.6)' : 'rotate(0deg) scale(1)',
                        transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.4s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    >
                      <path d="M15.5 10.5A6.5 6.5 0 0 1 9 4a6.5 6.5 0 1 0 6.5 6.5z" fill="#CCFF00" />
                    </svg>
                  </span>
                </motion.button>

                {/* ── LOGOUT — bottom of mobile stack (desktop uses pill) ── */}
                {!isDesktopQuickMenu && <motion.button
                  initial={{ opacity: 0, y: -10, scale: 0.86 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.88 }}
                  transition={{ duration: 0.24, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  onClick={handleQuickLogout}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    position: 'fixed',
                    right: floatingRight,
                    top: isDesktopQuickMenu ? 'auto' : floatingActionTop6,
                    bottom: isDesktopQuickMenu ? floatingActionBottom4 : 'auto',
                    zIndex: 250012,
                    width: floatingButtonSize,
                    height: floatingButtonSize,
                    padding: 0,
                    boxSizing: 'border-box',
                    borderRadius: '50%',
                    border: isLightTheme ? '1px solid rgba(180,30,30,0.28)' : '1px solid rgba(255,80,80,0.28)',
                    background: isLightTheme ? 'rgba(200,30,30,0.08)' : 'rgba(30,10,10,0.88)',
                    color: isLightTheme ? '#b01c1c' : '#ff8080',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isLightTheme
                      ? '0 8px 22px rgba(180,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.55)'
                      : '0 12px 26px rgba(120,0,0,0.32), inset 0 1px 0 rgba(255,100,100,0.10)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  }}
                  title={t({ ko: '로그아웃', en: 'Logout' })}
                >
                  {/* Exit/door SVG icon */}
                  <svg width={isMobileShell ? 17 : 19} height={isMobileShell ? 17 : 19} viewBox="0 0 18 18" fill="none">
                    <path d="M6.5 3H3.5A1.5 1.5 0 0 0 2 4.5v9A1.5 1.5 0 0 0 3.5 15H6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M11.5 5.5L15 9L11.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="15" y1="9" x2="7" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </motion.button>}
              </>
            )}
          </AnimatePresence>

          <motion.button
            ref={profileBtnRef}
            initial={{ opacity: 0, y: 8 }}
            onClick={handleProfileMainClick}
            animate={{
              opacity: 1,
              y: 0,
              scale: isFloatingActionsOpen ? 1.04 : 1,
              boxShadow: isFloatingActionsOpen
                ? (isLightTheme
                  ? '0 10px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.6)'
                  : '0 14px 30px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.12)')
                : (isLightTheme
                  ? '0 8px 22px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.55)'
                  : '0 12px 26px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08)'),
            }}
            transition={{ duration: 0.24, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => {
              // Start drag on non-interactive area (e.g., drag with 2+ fingers not needed – just pointer hold)
              profileDragRef.current = { startY: e.clientY, startDragY: profileDragY >= 0 ? profileDragY : (profileBtnRef.current?.getBoundingClientRect().top ?? 100) };
              profileIsDragging.current = true;
              e.preventDefault();
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (!t) return;
              profileDragRef.current = { startY: t.clientY, startDragY: profileDragY >= 0 ? profileDragY : (profileBtnRef.current?.getBoundingClientRect().top ?? 100) };
              profileIsDragging.current = true;
            }}
            style={{
              position: 'fixed',
              right: floatingRight,
              top: isDesktopQuickMenu ? 'auto' : floatingProfileTopCSS,
              bottom: isDesktopQuickMenu ? floatingBottomBase : 'auto',
              zIndex: 250012,
              width: floatingButtonSize,
              height: floatingButtonSize,
              padding: 0,
              boxSizing: 'border-box',
              borderRadius: '50%',
              border: isLightTheme ? '1px solid rgba(0,0,0,0.18)' : '1px solid rgba(255,255,255,0.22)',
              background: isLightTheme ? '#ffffff' : 'rgba(22,22,22,0.88)',
              color: isLightTheme ? '#111111' : '#ffffff',
              cursor: profileIsDragging.current ? 'grabbing' : 'grab',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
            title={isAuthedUser ? t({ ko: '빠른 메뉴 열기', en: 'Toggle quick actions' }) : t({ ko: '로그인', en: 'Login' })}
          >
            {isAuthedUser && effectiveProfilePhoto ? (
              <ProfileAvatar
                src={effectiveProfilePhoto}
                crop={effectiveProfileCrop}
                size={floatingButtonSize}
                alt="Profile"
                fallback={null}
                background={isLightTheme ? '#e9e9e9' : 'rgba(255,255,255,0.15)'}
              />
            ) : isAuthedUser ? (
              profileInitial
            ) : (
              <User size={24} strokeWidth={3} />
            )}
          </motion.button>

        </>
      )}

      {isBottomNavVisible && (
        <BottomPageNavigator
          activeIndex={activeTabIndex ?? lastNonNullTabIndexRef.current}
          onChange={handleBottomNavChange}
          lightMode={isLightTheme}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <CartProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </CartProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;