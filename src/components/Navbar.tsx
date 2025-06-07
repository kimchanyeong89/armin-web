// src/components/Navbar.tsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { signOut, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase";
import { Link, useNavigate, useLocation } from "react-router-dom";
import SearchBar from "./SearchBar";

const Navbar: React.FC = () => {
  const { user } = useAuth();
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
      alert("로그인 실패: " + (error as any).message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleSearchSubmit = () => {
    navigate(`/search?query=${encodeURIComponent(searchQuery)}`);
  };

  useEffect(() => {
    console.log("현재 사용자:", user);
  }, [user]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 20px",
        backgroundColor: "#fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
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
            style={{ width: "35px", marginRight: "10px" }}
          />
          <span style={{ fontWeight: "bold", fontSize: "22px" }}>Armin</span>
        </Link>

        <div style={{ marginLeft: "20px", width: "65%", maxWidth: "450px" }}>
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSearchSubmit={handleSearchSubmit}
          />
        </div>

        <div style={{ display: "flex", gap: "20px", alignItems: "center", marginLeft: "20px" }}>
          {user ? (
            <span
              style={{ color: "black", cursor: "pointer", marginLeft: "10px" }}
              onClick={handleLogout}
            >
              Logout
            </span>
          ) : (
            <span
              style={{ color: "black", cursor: "pointer", marginLeft: "10px" }}
              onClick={handleLogin}
            >
              Login
            </span>
          )}
          <Link to="/mypage" style={{ color: "black", textDecoration: "none" }}>
            Mypage
          </Link>
          <Link to="/contact" style={{ color: "black", textDecoration: "none" }}>
            Contact
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Navbar;