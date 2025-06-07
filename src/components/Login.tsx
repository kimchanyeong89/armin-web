import React from "react";
import { auth } from "../firebase";
import { GoogleAuthProvider, signInWithRedirect } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const db = getFirestore();

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error(error);
      alert("로그인 실패: " + (error as any).message);
    }
  };

  return (
    <div>
      <h2>로그인</h2>
      <button onClick={handleGoogleLogin}>구글 계정으로 로그인</button>
    </div>
  );
};

export default Login;