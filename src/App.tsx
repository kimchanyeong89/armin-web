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
import { AnimatePresence, motion } from "framer-motion";
import BottomPageNavigator, { MAIN_TABS, resolveMainTabIndex } from "./components/BottomPageNavigator";
import { LogOut, ShoppingCart, User } from "lucide-react";
import ProfileAvatar from "./components/ProfileAvatar";
import { createFirebaseWebPort } from "./adapters/firebaseWebAdapter";
import type { ProfileImageCrop } from "./types/Profile";
import { isMobileAppContainer } from "./utils/mobileAppAuth";
import { CartProvider, useCart } from "./contexts/CartContext";
import { auth } from "./firebase";

// Lazy load pages for code splitting
const HomePage = lazy(() => import("./pages/HomePage"));
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

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setProfilePhotoUrl(null);
      setProfileImageCrop(null);
      return;
    }

    let mounted = true;

    const stopObserve = firebaseWebPort.profile.observeUserProfile?.(
      user.uid,
      (data) => {
        if (!mounted) return;
        setProfilePhotoUrl(data?.photoURL || user.photoURL || null);
        setProfileImageCrop(data?.profileImageCrop || null);
      },
      () => {
        if (!mounted) return;
        setProfilePhotoUrl(user.photoURL || null);
        setProfileImageCrop(null);
      },
    );

    if (!stopObserve) {
      void firebaseWebPort.profile
        .getUserProfile(user.uid)
        .then((data) => {
          if (!mounted) return;
          setProfilePhotoUrl(data?.photoURL || user.photoURL || null);
          setProfileImageCrop(data?.profileImageCrop || null);
        })
        .catch(() => {
          if (!mounted) return;
          setProfilePhotoUrl(user.photoURL || null);
          setProfileImageCrop(null);
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

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTabIndex === null) return;
    if (isSwipeBlockedTarget(e.target)) return;
    if (activeTabIndex === 0 && e.clientY < window.innerHeight - 170) return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTabIndex === null) return;
    if (!swipeStartRef.current) return;

    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    if (Math.abs(dx) < 72) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.72) return;

    if (dx < 0 && activeTabIndex < MAIN_TABS.length - 1) {
      updateSlideDirection(1);
      navigate(MAIN_TABS[activeTabIndex + 1].path);
      return;
    }

    if (dx > 0 && activeTabIndex > 0) {
      updateSlideDirection(-1);
      const prevTab = MAIN_TABS[activeTabIndex - 1];
      if (prevTab?.id === "map") {
        navigate(resolveLastMapPath());
      } else if (prevTab) {
        navigate(prevTab.path);
      }
    }
  };

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
  const floatingProfileTop = `calc(${floatingTopBase} + ${floatingStep * 2}px)`;
  const floatingActionTop1 = `calc(${floatingTopBase} + ${floatingStep}px)`;
  const floatingActionTop2 = floatingTopBase;
  const floatingActionTop3 = `calc(${floatingTopBase} + ${floatingStep * 3}px)`;
  const floatingActionTop4 = `calc(${floatingTopBase} + ${floatingStep * 4}px)`;
  const floatingActionTop5 = `calc(${floatingTopBase} + ${floatingStep * 5}px)`;
  const floatingActionBottom1 = `calc(${floatingBottomBase} + ${floatingStep}px)`;
  const floatingActionBottom2 = `calc(${floatingBottomBase} + ${floatingStep * 2}px)`;
  const floatingActionBottom3 = `calc(${floatingBottomBase} + ${floatingStep * 3}px)`;

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
                <Route path="/admin" element={<AdminPage />} />
              </Routes>
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
                      onClick={() => {
                        navigate('/mypage');
                        setIsFloatingActionsOpen(false);
                      }}
                      style={{
                        border: 'none',
                        height: 36,
                        borderRadius: 999,
                        padding: '0 14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        background: isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                        color: isLightTheme ? '#111111' : '#ffffff',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                      }}
                      title={t({ ko: '마이페이지', en: 'My Page' })}
                    >
                      <User size={14} strokeWidth={2.2} />
                      {t({ ko: 'MY PAGE', en: 'MY PAGE' })}
                    </button>

                    <button
                      onClick={handleQuickLogout}
                      style={{
                        border: 'none',
                        height: 36,
                        borderRadius: 999,
                        padding: '0 14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        background: isLightTheme ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                        color: isLightTheme ? '#111111' : '#ffffff',
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                      }}
                      title={t({ ko: '로그아웃', en: 'Logout' })}
                    >
                      <LogOut size={14} strokeWidth={2.2} />
                      {t({ ko: 'LOGOUT', en: 'LOGOUT' })}
                    </button>
                  </motion.div>
                ) : (
                  <>
                    <motion.button
                      initial={{ opacity: 0, y: -10, scale: 0.86 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.88 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      onClick={() => {
                        navigate('/mypage');
                        setIsFloatingActionsOpen(false);
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      style={{
                        position: 'fixed',
                        right: floatingRight,
                        top: floatingActionTop1,
                        bottom: 'auto',
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
                      title={t({ ko: '마이페이지', en: 'My Page' })}
                    >
                      <User size={isMobileShell ? 18 : 20} strokeWidth={2.2} />
                    </motion.button>

                    <motion.button
                      initial={{ opacity: 0, y: -10, scale: 0.86 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.88 }}
                      transition={{ duration: 0.24, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
                      onClick={handleQuickLogout}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      style={{
                        position: 'fixed',
                        right: floatingRight,
                        top: floatingActionTop2,
                        bottom: 'auto',
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
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                        boxShadow: isLightTheme
                          ? '0 8px 22px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.55)'
                          : '0 12px 26px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                      }}
                      title={t({ ko: '로그아웃', en: 'Logout' })}
                    >
                      OUT
                    </motion.button>
                  </>
                )}

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
              </>
            )}
          </AnimatePresence>

          <motion.button
            initial={{ opacity: 0, y: 8 }}
            onClick={handleProfileMainClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.94 }}
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
            style={{
              position: 'fixed',
              right: floatingRight,
              top: isDesktopQuickMenu ? 'auto' : floatingProfileTop,
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
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
            title={isAuthedUser ? t({ ko: '빠른 메뉴 열기', en: 'Toggle quick actions' }) : t({ ko: '로그인', en: 'Login' })}
          >
            {isAuthedUser && effectiveProfilePhoto ? (
              <ProfileAvatar
                src={effectiveProfilePhoto}
                crop={profileImageCrop}
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