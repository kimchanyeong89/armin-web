// src/components/Navbar.tsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SearchBar from "./SearchBar";
import LoginSelectionModal from "./LoginSelectionModal";

// Luxury dark palette — matches artist gallery overlay
const NAV_BG = "rgba(8, 8, 7, 0.88)";
const NAV_TEXT = "#f0ede6";
const NAV_ACCENT = "#c9a55a";
const NAV_BORDER = "rgba(201, 165, 90, 0.15)";

const navItemStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontSize: '52.8px',
  fontWeight: 700,
  letterSpacing: '0.5px',
  color: NAV_TEXT,
  lineHeight: 1,
  userSelect: 'none',
  transition: 'color 0.2s',
};

const Navbar: React.FC = () => {
  const { user } = useAuth();
  const [navOn, setNavOn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);



  const handleLogin = () => {
    // Save current URL to localStorage
    const currentPath = location.pathname + location.search;
    localStorage.setItem("redirectAfterLogin", currentPath);
    setShowLoginModal(true);
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const handleMypage = () => {
    if (!user) {
      handleLogin();
    } else {
      navigate("/mypage");
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchSubmit = () => {
    if (location.pathname === '/' || location.pathname.startsWith('/collection/')) {
      // If on map (Home), trigger generic search via event to open GlobalSearchBar
      window.dispatchEvent(new CustomEvent('global-search-trigger', { detail: { query: searchQuery } }));
    } else {
      // Otherwise navigate home with query param
      navigate(`/?q=${encodeURIComponent(searchQuery)}`);
    }
  };




  // Listen for header toggle from HomePage to drive animations
  useEffect(() => {
    const onToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail as { on: boolean } | undefined;
      if (detail && typeof detail.on === 'boolean') setNavOn(detail.on);
      else {
        // fallback: read CSS var if detail missing
        const v = getComputedStyle(document.documentElement).getPropertyValue('--navbar-translateY');
        setNavOn(v.includes('0')); // translateY(0) => on
      }
    };
    window.addEventListener('header-toggle', onToggle as EventListener);
    // initialize from current CSS var
    const v = getComputedStyle(document.documentElement).getPropertyValue('--navbar-translateY');
    setNavOn(v.includes('0'));
    return () => window.removeEventListener('header-toggle', onToggle as EventListener);
  }, []);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string }>).detail;
      if (!detail || typeof detail.query === 'undefined') return;
      setSearchQuery(detail.query ?? '');
    };
    window.addEventListener('navbar:prefill-search', handlePrefill as EventListener);
    return () => window.removeEventListener('navbar:prefill-search', handlePrefill as EventListener);
  }, []);

  if (location.pathname === '/onboarding' || location.pathname === '/login/callback') return null;

  const slideTransition = 'transform 1200ms ease-in-out, opacity 1200ms ease-in-out';
  const slideStyle = (on: boolean): React.CSSProperties => ({
    transform: `translateY(${on ? '0' : '-140%'})`,
    opacity: on ? 1 : 0,
    transition: slideTransition,
    transitionDelay: '280ms',
    pointerEvents: on ? 'auto' : 'none',
  });

  return (
    <>
      {showLoginModal && <LoginSelectionModal onClose={() => setShowLoginModal(false)} />}
      <div id="global-navbar"
        style={{
          position: "fixed",
          inset: 0,
          background: "transparent",
          zIndex: 5000,
          pointerEvents: "none"
        }}
      >
        {/* Dark backdrop bar — slides down with nav */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 90,
          background: NAV_BG,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${NAV_BORDER}`,
          ...slideStyle(navOn),
          pointerEvents: 'none',
        }} />

        {/* Left group: Logo + Site name */}
        <div style={{ position: 'fixed', top: 18, left: 240, display: "flex", alignItems: "center", ...slideStyle(navOn) }}>
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              color: NAV_TEXT,
            }}
            onMouseEnter={() => setHoveredItem('logo')}
            onMouseLeave={() => setHoveredItem(null)}
          >
            <img
              src="/images/armin-logo.png"
              alt="Armin Logo"
              style={{
                width: "48px",
                marginRight: "24px",
                filter: hoveredItem === 'logo' ? 'brightness(1.2) sepia(0.4) saturate(3) hue-rotate(5deg)' : 'none',
                transition: 'filter 0.2s',
              }}
            />
            <span style={{
              fontWeight: "bold",
              fontSize: "52.8px",
              lineHeight: 1,
              color: hoveredItem === 'logo' ? NAV_ACCENT : NAV_TEXT,
              transition: 'color 0.2s',
            }}>Armin</span>
          </Link>
        </div>

        {/* Middle: Search + MYPAGE + COMMUNITY */}
        <div style={{ position: 'fixed', top: 18, left: 560, ...slideStyle(navOn) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: "220px" }}>
              <SearchBar sizeScale={0.8} searchQuery={searchQuery} onSearchChange={handleSearchChange} onSearchSubmit={handleSearchSubmit} />
            </div>
            {/* MYPAGE */}
            <span
              onClick={handleMypage}
              onMouseEnter={() => setHoveredItem('mypage')}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                ...navItemStyle,
                color: hoveredItem === 'mypage' ? NAV_ACCENT : NAV_TEXT,
              }}
            >
              MYPAGE
            </span>
            {/* COMMUNITY */}
            <span
              onClick={() => {
                window.dispatchEvent(new CustomEvent('toggle-community-panel'));
              }}
              onMouseEnter={() => setHoveredItem('community')}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                ...navItemStyle,
                color: hoveredItem === 'community' ? NAV_ACCENT : NAV_TEXT,
              }}
            >
              COMMUNITY
            </span>
          </div>
        </div>

        {/* Right group: Login/Logout + Contact */}
        <div style={{ position: 'fixed', top: 18, right: 32, display: "flex", gap: "24px", alignItems: "center", ...slideStyle(navOn) }}>
          {user ? (
            <span
              onMouseEnter={() => setHoveredItem('auth')}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                ...navItemStyle,
                color: hoveredItem === 'auth' ? NAV_ACCENT : NAV_TEXT,
              }}
              onClick={handleLogout}
            >
              Logout
            </span>
          ) : (
            <span
              onMouseEnter={() => setHoveredItem('auth')}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                ...navItemStyle,
                color: hoveredItem === 'auth' ? NAV_ACCENT : NAV_TEXT,
              }}
              onClick={handleLogin}
            >
              Login
            </span>
          )}
          <Link
            to="/contact"
            onMouseEnter={() => setHoveredItem('contact')}
            onMouseLeave={() => setHoveredItem(null)}
            style={{
              textDecoration: "none",
              fontSize: "52.8px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.5px',
              color: hoveredItem === 'contact' ? NAV_ACCENT : NAV_TEXT,
              transition: 'color 0.2s',
            }}
          >
            Contact
          </Link>
        </div>
      </div>
    </>
  );
};

export default Navbar;
