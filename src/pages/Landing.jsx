import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/landing.css";

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="landing-mark">M</div>
        <div className="landing-eyebrow">EST. 2026 · CASE FILES OPEN</div>
        <h1 className="landing-title">
          머더미스터리<span className="accent">.com</span>
        </h1>
        <p className="landing-tagline">
          추리게임을 사랑하는 사람들의 사건 기록소
        </p>
      </div>

      <div className="landing-panel">
        <div className="landing-panel-title">시작하기</div>
        <button className="google-btn" onClick={signInWithGoogle}>
          <GoogleG />
          Google로 시작하기
        </button>
        <p className="landing-terms">
          로그인 시 <span>이용약관</span>과 <span>개인정보처리방침</span>에 동의하게 됩니다
        </p>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.6 2.8c2.2-2 3.8-5 3.8-8.5z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.6-2.8c-1 .7-2.4 1.2-4.3 1.2-3.3 0-6-2.2-7-5.1l-3.7 2.8C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5 14.4c-.3-.8-.4-1.6-.4-2.4s.1-1.6.4-2.4L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2L5 14.4z" />
      <path fill="#EA4335" d="M12 4.6c1.8 0 3.1.8 3.8 1.5l2.8-2.8C16.9 1.3 14.2 0 12 0 7.3 0 3.3 2.7 1.3 6.8L5 9.6c1-2.9 3.7-5 7-5z" />
    </svg>
  );
}
