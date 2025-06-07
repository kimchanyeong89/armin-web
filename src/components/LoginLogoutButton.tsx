// src/components/LoginLogoutButton.tsx
import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

const LoginLogoutButton: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <div>
      {user ? (
        <button onClick={handleLogout}>로그아웃</button>
      ) : (
        <button onClick={handleLogin}>로그인</button>
      )}
    </div>
  );
};

export default LoginLogoutButton;