import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

const SignUp: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("회원가입 완료! 로그인 해주세요.");
      navigate("/login"); // 회원가입 후 로그인 페이지로 이동
    } catch (error) {
      alert("회원가입 실패: " + (error as any).message);
    }
  };

  return (
    <div>
      <h2>회원가입</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        /><br/>
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        /><br/>
        <button type="submit">회원가입</button>
      </form>
    </div>
  );
};

export default SignUp;