import { Suspense, lazy, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { signOut } from "firebase/auth";
import DrawingLoader, { TransitionBadge } from "./components/DrawingLoader";
import CinematicIntro from "./components/CinematicIntro";
import { exhibitions } from "./data/exhibitions";
import { OnboardingGuard } from "./components/OnboardingGuard";
import CommunityPanel from "./components/Community/CommunityPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AnimatePresence, motion } from "framer-motion";
import BottomPageNavigator, { MAIN_TABS, resolveMainTabIndex } from "./components/BottomPageNavigator";
import LanguageToggle from "./components/LanguageToggle";
// LogOut is unused here and was already unused before this change; left in place.
import { LogOut } from "lucide-react";
import { SHOW_SALES_UI } from "./config/features";
import ProfileAvatar from "./components/ProfileAvatar";
import QuickIcon from "./components/QuickIcon";
import "./quickMenu.css";
import { createFirebaseWebPort } from "./adapters/firebaseWebAdapter";
import type { ProfileImageCrop } from "./types/Profile";
import { isMobileAppContainer } from "./utils/mobileAppAuth";
import { CartProvider, useCart } from "./contexts/CartContext";
import { auth } from "./firebase";
import { ensureSharedSearchWorkerLoaded } from "./utils/searchWorkerRuntime";
import { resolveMobileChromeTweak } from "./components/mobileChromeTweaks";
import MobileChromeTweakSwitcher from "./components/MobileChromeTweakSwitcher";

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
const AdminWeeklyPreviewPage = lazy(() => import("./pages/AdminWeeklyPreviewPage"));
const TateModernPermanentPage = lazy(() => import("./pages/TateModernPermanentPage"));
const PaymentSuccessPage = lazy(() => import("./pages/PaymentSuccessPage").then(module => ({ default: module.PaymentSuccessPage })));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const LoginCallbackPage = lazy(() => import("./pages/LoginCallbackPage"));
/* the redesigned community (src/pages/community/atlas); the previous pages
   still sit beside it in src/pages/community — point these back to undo */
const CommunityPage = lazy(() => import("./pages/community/atlas/AtlasFeedPage"));
const WritePostPage = lazy(() => import("./pages/community/atlas/AtlasWritePage"));
const PostDetailPage = lazy(() => import("./pages/community/atlas/AtlasPostPage"));
const SharedPlaylistPage = lazy(() => import("./pages/community/atlas/AtlasPlaylistPage"));
const ExhibitionsNearMePage = lazy(() => import("./pages/ExhibitionsNearMePage"));
const AICurationHubPage = lazy(() => import("./pages/AICurationHubPage"));
const GlobalSearchBar = lazy(() => import("./components/GlobalSearchBar"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const PolicyPage = lazy(() => import("./pages/PolicyPage"));

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

// Intro now plays only for SIGNED-OUT visitors (gated by `introAllowed` in AppContent).
// REVIEW_MODE=true → a signed-out visitor sees it on every home load; set false for first-visit-only.
// Always HIDDEN inside the iOS/native app (the React-Native WebView).
const INTRO_REVIEW_MODE: boolean = true;
// Paused for now (2026-09-12): nobody sees the intro unless `?intro=1` asks for it.
// Set back to true to restore the behaviour above.
const INTRO_ENABLED: boolean = false;
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
  const mobileChromeTweak = resolveMobileChromeTweak(new URLSearchParams(location.search).get("tweak"));
  const { user, loading: authLoading } = useAuth();
  const { language, t } = useLanguage();
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

  // First-visit cinematic intro overlay (plays once over the home globe).
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      // Only START on the home globe (the intro then drives the router itself).
      const path = window.location.pathname;
      if (path !== '/' && !path.startsWith('/interactive')) return false;
      // ?intro=1 force-replays the intro (works everywhere, even in the app); ?intro=0 skips it.
      const introParam = new URLSearchParams(window.location.search).get('intro');
      if (introParam === '1') return true;
      if (introParam === '0') return false;
      if (!INTRO_ENABLED) return false;
      // Hidden inside the iOS/native app for now; the WEB still shows it (for review).
      if (isMobileAppContainer()) return false;
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
      if (INTRO_REVIEW_MODE) return true;
      return localStorage.getItem('armin:intro-seen') !== 'true';
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
    void import("./pages/community/atlas/AtlasFeedPage");
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
  // Which edge the floating button stack is pinned to once a drag ends.
  // Determined at release time by which edge the finger is closer to —
  // the CSS `left` transition turns the snap into a magnetic glide.
  const [profileDragSide, setProfileDragSide] = useState<'left' | 'right'>(() => {
    try {
      const saved = localStorage.getItem('armin:profileBtnSide');
      if (saved === 'left' || saved === 'right') return saved;
    } catch { /* ignore */ }
    return 'right';
  });
  // Live X coordinate of the button's left edge while the user is
  // actively dragging. When non-null, the button follows the finger
  // freely instead of being clamped to an edge. Cleared on release so
  // the side-edge style + CSS transition produce the snap animation.
  const [profileLiveX, setProfileLiveX] = useState<number | null>(null);
  const profileDragRef = useRef<{ startX: number; startY: number; startDragX: number; startDragY: number } | null>(null);
  const profileIsDragging = useRef(false);
  // Dragging the button used to fire its click on release, so nudging it a few
  // pixels opened the menu. Set once the pointer travels past a few px and read
  // (then cleared) by the click handler.
  const profileMovedRef = useRef(false);
  const profileBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!profileIsDragging.current || !profileDragRef.current) return;
      const W = window.innerWidth || 800;
      const H = window.innerHeight || 800;
      const btnSize = profileBtnRef.current?.offsetWidth || 46;
      const dy = clientY - profileDragRef.current.startY;
      const dxRaw = clientX - profileDragRef.current.startX;
      if (Math.hypot(dxRaw, dy) > 4) profileMovedRef.current = true;
      let newY = profileDragRef.current.startDragY + dy;
      newY = Math.max(0, Math.min(newY, H - btnSize));
      setProfileDragY(newY);
      const dx = clientX - profileDragRef.current.startX;
      let newX = profileDragRef.current.startDragX + dx;
      newX = Math.max(0, Math.min(newX, W - btnSize));
      setProfileLiveX(newX);
    };
    const handleEnd = () => {
      if (!profileIsDragging.current) return;
      profileIsDragging.current = false;
      profileDragRef.current = null;
      // Persist Y. Resolve side by which edge is closer at release; clearing
      // liveX swaps the rendered `left` from finger-position to side-edge,
      // and the CSS transition tweens the magnetic snap.
      setProfileDragY(prev => {
        try { localStorage.setItem('armin:profileBtnY', String(prev)); } catch { /* */ }
        return prev;
      });
      setProfileLiveX(currentX => {
        if (currentX === null) return null;
        const W = window.innerWidth || 800;
        const btnSize = profileBtnRef.current?.offsetWidth || 46;
        const centerX = currentX + btnSize / 2;
        const newSide: 'left' | 'right' = centerX < W / 2 ? 'left' : 'right';
        setProfileDragSide(newSide);
        try { localStorage.setItem('armin:profileBtnSide', newSide); } catch { /* */ }
        return null;
      });
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY); };
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

  /* 작가 화면을 다른 페이지 위에 열면(state.backgroundLocation) 주소만 작가 화면이 되고,
     페이지·탭·전환 키는 아래 페이지를 따른다 — 아래 페이지가 떨어지지 않아 닫으면 보던 자리 그대로다 */
  const backgroundLocation = (location.state as { backgroundLocation?: typeof location } | null)?.backgroundLocation;
  const galleryOverPage = !!backgroundLocation && location.pathname.startsWith('/artist-gallery/');
  const pageLocation = galleryOverPage && backgroundLocation ? backgroundLocation : location;
  const pageLocationRef = useRef(pageLocation);
  pageLocationRef.current = pageLocation;

  /* 작가 화면을 품지 않은 페이지(AI 탭·마이페이지·전시 화면)에서 온 요청은 여기서 받는다.
     지도·검색처럼 작가 화면을 품은 곳은 먼저 그 자리에서 열고 detail.handled 로 알려 준다 */
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as { artist?: string; handled?: boolean } | undefined;
      const artist = String(detail?.artist || '').trim();
      if (!artist) return;
      queueMicrotask(() => {
        if (e.defaultPrevented || detail?.handled) return;
        const slug = artist.replace(/[()]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').toLowerCase();
        navigate(`/artist-gallery/${encodeURIComponent(slug)}?name=${encodeURIComponent(artist)}`, {
          state: { backgroundLocation: pageLocationRef.current },
        });
      });
    };
    window.addEventListener('open-artist-gallery', open);
    return () => window.removeEventListener('open-artist-gallery', open);
  }, [navigate]);

  const activeTabIndex = resolveMainTabIndex(pageLocation.pathname);
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
  // Intro plays only for SIGNED-OUT visitors, and only once auth has resolved (no flash for logged-in users).
  // `?intro=1` is a hard override that force-plays it for anyone (review / demo / sharing).
  const introForced = (() => { try { return new URLSearchParams(window.location.search).get('intro') === '1'; } catch { return false; } })();
  const introAllowed = showIntro && (introForced || (!authLoading && !isAuthedUser));

  // Tabs the cinematic intro cross-fades through. `kind` selects a built design-mockup
  // (rendered in CinematicIntro's TabMock) — no screenshots, so nothing crops or overlaps.
  const introTourSteps = [
    { kind: 'community' as const, title: '커뮤니티 — 감상을 나누는 사람들', body: '같은 작품을 본 사람들과 리뷰·뉴스·토론·인터뷰를 나눕니다.' },
    { kind: 'ai' as const, title: 'AI 추천 — 취향을 읽는 큐레이션', body: '마음에 든 작품 몇 개만 고르면, AI가 76만 점에서 당신의 취향을 찾아냅니다.' },
    { kind: 'weekly' as const, title: '주간 큐레이션 — 매주 새로 거는 전시', body: '에디터가 매주 한 편씩, 작가와 작품을 깊이 있게 엮어 소개합니다.' },
    { kind: 'profile' as const, title: '마이페이지 — 나만의 컬렉션', body: '좋아한 작품·전시·작가를 모으고, 플레이리스트와 슬라이드쇼로 다시 감상합니다.' },
    { kind: 'search' as const, title: '검색 — 자연어 AI 검색', body: '자연어로 물으면 분위기로 찾아주고, 작가를 누르면 작가 페이지로 이어집니다.' },
    { kind: 'artist' as const, title: '작가 페이지 — 작가의 모든 것', body: '검색에서 작가를 누르면, 소개·작품 통계·전 작품이 한 페이지에 펼쳐집니다.' },
  ];
  const profileInitial = (user?.displayName || user?.email || 'A').trim().slice(0, 1).toUpperCase();
  const effectiveProfilePhoto = profilePhotoUrl || user?.photoURL || null;
  // Only apply the saved crop when Firestore says the user actually has a
  // custom photo. If we're rendering the OAuth provider fallback, a stale
  // crop from an old custom upload would push that photo off-screen.
  const effectiveProfileCrop = hasCustomPhotoSaved ? profileImageCrop : null;
  const isMobileShell = isMobileAppContainer();
  const isDesktopQuickMenu = !isMobileShell && viewportWidth >= 1024;
  const floatingButtonSize = isMobileShell ? 40 : (isDesktopQuickMenu ? 54 : 46);
  // Floating quick menu — circles, as before, but in the map tab's language:
  // a hairline on a flat ground rather than blurred glass, gold only where it
  // means something, and hairline marks instead of lucide's heavier icons.
  // Hover, the open ring and the opening stagger live in quickMenu.css.
  const quickHair = isLightTheme ? 'rgba(0,0,0,0.16)' : 'rgba(244,241,234,0.18)';
  // Only geometry is set inline. The colours travel as custom properties so
  // quickMenu.css owns the states - an inline `border` would outrank any
  // :hover rule no matter how specific, and the gold edge would never show.
  const quickChip: React.CSSProperties = {
    width: floatingButtonSize,
    height: floatingButtonSize,
    padding: 0,
    boxSizing: 'border-box',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    ['--chip-hair' as string]: quickHair,
    ['--chip-ground' as string]: isLightTheme ? '#faf9f6' : '#0d0d0d',
    ['--chip-ink' as string]: isLightTheme ? '#141414' : 'rgba(244,241,234,0.92)',
  };
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

  // Horizontal anchor for the floating button stack. Desktop quick-menu
  // mode keeps a fixed right anchor (bottom-right corner cluster). On
  // mobile/tablet the stack uses `left`: while dragging it follows the
  // finger (profileLiveX), and on release it snaps to the chosen edge
  // with a CSS-tweened transition for the magnetic glide.
  const floatingHorizontalStyle: React.CSSProperties = isDesktopQuickMenu
    ? { right: floatingRight, left: 'auto' }
    : profileLiveX !== null
      ? { left: profileLiveX, right: 'auto' }
      : profileDragSide === 'left'
        ? { left: floatingRight, right: 'auto' }
        : { left: Math.max(0, viewportWidth - floatingButtonSize - floatingRight), right: 'auto' };
  const floatingHorizontalTransition = (isDesktopQuickMenu || profileLiveX !== null)
    ? undefined
    : 'left 0.36s cubic-bezier(0.22, 1, 0.36, 1)';

  const handleProfileMainClick = async () => {
    // A drag that ends over the button still fires a click; ignore that one.
    if (profileMovedRef.current) {
      profileMovedRef.current = false;
      return;
    }
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
  const isInteractiveRoute = pageLocation.pathname === '/interactive' || pageLocation.pathname.startsWith('/interactive/');
  const routeKey = isInteractiveRoute ? '/interactive' : `${pageLocation.pathname}${pageLocation.search}`;

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

      {introAllowed && (
        <CinematicIntro
          onDone={() => {
            try { localStorage.setItem('armin:intro-seen', 'true'); } catch { /* ignore */ }
            setShowIntro(false);
          }}
          tourSteps={introTourSteps}
        />
      )}

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
              <Routes location={pageLocation}>
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
                <Route path="/community/playlist/:id" element={<SharedPlaylistPage />} />
                <Route path="/ai" element={<AICurationHubPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/privacy" element={<PolicyPage doc="privacy" />} />
                <Route path="/terms" element={<PolicyPage doc="terms" />} />
                <Route path="/support" element={<PolicyPage doc="support" />} />
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
                <Route path="/admin/weekly/preview" element={<AdminWeeklyPreviewPage />} />
                <Route path="/admin/weekly" element={<AdminWeeklyPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Routes>
              </ErrorBoundary>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 다른 페이지 위에 연 작가 화면 — 검색창은 숨기고 작가 화면만 띄운다 */}
      {galleryOverPage && (
        <Suspense fallback={null}>
          <GlobalSearchBar galleryOnly />
        </Suspense>
      )}

      <CommunityPanel isOpen={isCommunityPanelOpen} onClose={() => setIsCommunityPanelOpen(false)} mapMode={mapMode} />

      {isFloatingControlsVisible && !introAllowed && (
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
                      padding: 6,
                      borderRadius: 2,
                      border: `1px solid ${quickHair}`,
                      background: isLightTheme ? '#faf9f6' : '#0d0d0d',
                      boxShadow: isLightTheme ? '0 4px 14px rgba(0,0,0,0.10)' : '0 6px 18px rgba(0,0,0,0.45)',
                    }}
                  >
                    <button
                      onClick={handleQuickLogout}
                      style={{
                        border: `1px solid ${isLightTheme ? 'rgba(176,28,28,0.30)' : 'rgba(232,96,96,0.30)'}`,
                        height: 36,
                        borderRadius: 2,
                        padding: '0 14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        background: 'none',
                        color: isLightTheme ? '#b01c1c' : '#e86060',
                        fontFamily: "'Space Mono', ui-monospace, monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                      }}
                      title={t({ ko: '로그아웃', en: 'Logout' })}
                    >
                      <QuickIcon name="logout" size={14} />
                      {t({ ko: 'LOGOUT', en: 'LOGOUT' })}
                    </button>
                  </motion.div>
                ) : null}

                {/* The actions, derived from one list. They used to be three
                    hand-placed buttons pinned to slots 3/4/5, which left the
                    first slot visibly empty whenever the cart was hidden by
                    SHOW_SALES_UI. Now the slot is the index in this list, so a
                    hidden action leaves no gap. Each carries a Space Mono
                    label: at 20px a hairline mark alone is a guess. */}
                {([
                  ...(SHOW_SALES_UI ? [{
                    key: 'cart', icon: 'cart' as const,
                    label: t({ ko: '장바구니', en: 'CART' }),
                    title: t({ ko: '장바구니', en: 'Cart' }),
                    danger: false,
                    onPick: () => { navigate('/cart'); setIsFloatingActionsOpen(false); },
                    badge: itemCount > 0 ? (itemCount > 99 ? '99+' : String(itemCount)) : null,
                  }] : []),
                  {
                    key: 'theme', icon: 'theme' as const,
                    label: isLightTheme ? t({ ko: '라이트', en: 'LIGHT' }) : t({ ko: '다크', en: 'DARK' }),
                    title: isLightTheme ? t({ ko: '다크 모드로 전환', en: 'Switch to dark mode' }) : t({ ko: '라이트 모드로 전환', en: 'Switch to light mode' }),
                    danger: false,
                    onPick: () => { toggleGlobalTheme(); setIsFloatingActionsOpen(false); },
                    badge: null,
                  },
                  ...(!isDesktopQuickMenu ? [{
                    key: 'logout', icon: 'logout' as const,
                    label: t({ ko: '로그아웃', en: 'LOGOUT' }),
                    title: t({ ko: '로그아웃', en: 'Logout' }),
                    danger: true,
                    onPick: handleQuickLogout,
                    badge: null,
                  }] : []),
                ]).map((action, i) => {
                  const step = i + 1;
                  const stackedTop = _draggedY !== undefined
                    ? `${Math.min(typeof window !== 'undefined' ? window.innerHeight - floatingStep : 9999, _draggedY + floatingStep * step)}px`
                    : `calc(${floatingTopBase} + ${floatingStep * (step + 2)}px)`;
                  return (
                    <motion.button
                      key={action.key}
                      initial={{ opacity: 0, scale: 0.2 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.2 }}
                      transition={{ type: 'spring', stiffness: 460, damping: 24, delay: 0.04 * step }}
                      onClick={action.onPick}
                      whileTap={{ scale: 0.94 }}
                      className={`quick-chip quick-chip--action${action.danger ? ' quick-chip--danger' : ''}`}
                      data-side={isDesktopQuickMenu ? 'right' : profileDragSide}
                      style={{
                        position: 'fixed',
                        ...floatingHorizontalStyle,
                        transition: floatingHorizontalTransition,
                        top: isDesktopQuickMenu ? 'auto' : stackedTop,
                        bottom: isDesktopQuickMenu ? `calc(${floatingBottomBase} + ${floatingStep * step}px)` : 'auto',
                        zIndex: 250012,
                        ...quickChip,
                        ['--quick-delay' as string]: `${0.04 * step}s`,
                        ...(action.danger ? {
                          ['--chip-hair' as string]: isLightTheme ? 'rgba(176,28,28,0.34)' : 'rgba(232,96,96,0.34)',
                          ['--chip-ink' as string]: isLightTheme ? '#b01c1c' : '#e86060',
                        } : {}),
                      }}
                      title={action.title}
                    >
                      <span className="quick-chip__label">{action.label}</span>
                      <QuickIcon name={action.icon} size={isMobileShell ? 18 : 20} />
                      {action.badge && <span className="quick-chip__badge">{action.badge}</span>}
                    </motion.button>
                  );
                })}
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
              scale: isFloatingActionsOpen ? 1.03 : 1,
            }}
            transition={{ duration: 0.24, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => {
              const rect = profileBtnRef.current?.getBoundingClientRect();
              profileDragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startDragX: rect?.left ?? 0,
                startDragY: profileDragY >= 0 ? profileDragY : (rect?.top ?? 100),
              };
              profileIsDragging.current = true;
              profileMovedRef.current = false;
              e.preventDefault();
            }}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (!t) return;
              const rect = profileBtnRef.current?.getBoundingClientRect();
              profileDragRef.current = {
                startX: t.clientX,
                startY: t.clientY,
                startDragX: rect?.left ?? 0,
                startDragY: profileDragY >= 0 ? profileDragY : (rect?.top ?? 100),
              };
              profileIsDragging.current = true;
              profileMovedRef.current = false;
            }}
            className={`quick-chip quick-chip--avatar${isFloatingActionsOpen ? ' quick-chip--open' : ''}`}
            style={{
              position: 'fixed',
              ...floatingHorizontalStyle,
              transition: floatingHorizontalTransition,
              top: isDesktopQuickMenu ? 'auto' : floatingProfileTopCSS,
              bottom: isDesktopQuickMenu ? floatingBottomBase : 'auto',
              zIndex: 250012,
              ...quickChip,
              cursor: profileIsDragging.current ? 'grabbing' : 'grab',
              fontFamily: "'Space Mono', ui-monospace, monospace",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
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
                radius={2}
                alt="Profile"
                fallback={null}
                background={isLightTheme ? '#e9e9e9' : 'rgba(255,255,255,0.15)'}
              />
            ) : isAuthedUser ? (
              profileInitial
            ) : (
              <QuickIcon name="user" size={isMobileShell ? 20 : 22} />
            )}
          </motion.button>

        </>
      )}

      {isBottomNavVisible && !introAllowed && (
        <BottomPageNavigator
          activeIndex={activeTabIndex ?? lastNonNullTabIndexRef.current}
          onChange={handleBottomNavChange}
          lightMode={isLightTheme}
          mobileChromeTweak={mobileChromeTweak}
        />
      )}

      {isInteractiveRoute && mobileChromeTweak && (
        <MobileChromeTweakSwitcher value={mobileChromeTweak} />
      )}

      {/* Floating language switch — reachable on every route, top right. Sits
          below the profile cluster (z 250012) and full-screen overlays so it
          never covers their close buttons, yet above page content. */}
      <div
        className="app-language-toggle"
        style={{
          position: 'fixed',
          top: 'max(12px, calc(env(safe-area-inset-top, 0px) + 10px))',
          right: 14,
          zIndex: 199900,
        }}
      >
        <LanguageToggle light={isLightTheme} />
      </div>
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
