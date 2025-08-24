// src/components/Navbar.tsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SearchBar from "./SearchBar";

const Navbar: React.FC = () => {
  const { user } = useAuth();
  const [navOn, setNavOn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Save current URL to localStorage
      const currentPath = location.pathname + location.search;
      localStorage.setItem("redirectAfterLogin", currentPath);
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("Login failed: " + (error as any).message);
    }
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
    navigate(`/search?query=${encodeURIComponent(searchQuery)}`);
  };

  useEffect(() => {
    console.log("Current user:", user);
  }, [user]);

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

  return (
    <div id="global-navbar"
      style={{
        position: "fixed",
        inset: 0,
        background: "transparent",
        zIndex: 5000,
        pointerEvents: "none"
      }}
    >
  {/* Left group: Logo + Site name (moved further right, slides down) */}
  <div style={{ position: 'fixed', top: 18, left: 240, display: "flex", alignItems: "center", transform: `translateY(${navOn ? '0' : '-140%'})`, opacity: navOn ? 1 : 0, transition: 'transform 1200ms ease-in-out, opacity 1200ms ease-in-out', transitionDelay: '280ms', pointerEvents: navOn ? 'auto' : 'none' }}>
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            color: "black"
          }}
        >
          <img
            src="/images/armin-logo.png"
            alt="Armin Logo"
            style={{ width: "48px", marginRight: "24px" }}
          />
          <span style={{ fontWeight: "bold", fontSize: "52.8px", lineHeight: 1 }}>Armin</span>
        </Link>
      </div>

  {/* Middle: Search + MYPAGE (left-anchored) */}
  <div style={{ position: 'fixed', top: 18, left: 560, transform: `translateY(${navOn ? '0' : '-140%'})`, opacity: navOn ? 1 : 0, transition: 'transform 1200ms ease-in-out, opacity 1200ms ease-in-out', transitionDelay: '280ms', pointerEvents: navOn ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: "220px" }}>
            <SearchBar sizeScale={0.8} searchQuery={searchQuery} onSearchChange={handleSearchChange} onSearchSubmit={handleSearchSubmit} />
          </div>
          {/* MYPAGE placed next to the search bar, size matches the title text */}
          <span
            onClick={handleMypage}
            style={{
              cursor: 'pointer',
              fontSize: '52.8px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              color: 'black',
              lineHeight: 1,
              userSelect: 'none'
            }}
          >
            MYPAGE
          </span>
        </div>
      </div>
  {/* Right group: Login/Logout + Contact (Contact at far right) */}
  <div style={{ position: 'fixed', top: 18, right: 32, display: "flex", gap: "24px", alignItems: "center", transform: `translateY(${navOn ? '0' : '-160%'})`, opacity: navOn ? 1 : 0, transition: 'transform 1200ms ease-in-out, opacity 1200ms ease-in-out', transitionDelay: '280ms', pointerEvents: navOn ? 'auto' : 'none' }}>
          {user ? (
            <span
              style={{ color: "black", cursor: "pointer", fontSize: "52.8px", fontWeight: 700, lineHeight: 1, letterSpacing: '0.5px' }}
              onClick={handleLogout}
            >
              Logout
            </span>
          ) : (
            <span
              style={{ color: "black", cursor: "pointer", fontSize: "52.8px", fontWeight: 700, lineHeight: 1, letterSpacing: '0.5px' }}
              onClick={handleLogin}
            >
              Login
            </span>
          )}
          <Link to="/contact" style={{ color: "black", textDecoration: "none", fontSize: "52.8px", fontWeight: 700, lineHeight: 1, letterSpacing: '0.5px' }}>
            Contact
          </Link>
        </div>
  </div>
  );
};

export default Navbar;