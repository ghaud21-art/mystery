import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { caseGetSeasonPublic, caseStart } from "../../lib/caseApi.js";
import { Card, PrimaryButton } from "../../components/ui.jsx";

// 로그인 없이도(공유 링크로 들어온 사람도) 랜딩 카피는 볼 수 있게 ProtectedRoute 밖에 배치됨.
export default function CaseLanding() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useAuth();
  const [season, setSeason] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setSeason(await caseGetSeasonPublic({ seasonId }));
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [seasonId]);

  async function handleStart() {
    setStarting(true);
    try {
      await caseStart({ seasonId });
      navigate(`/case/${seasonId}/play`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  }

  if (error) {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px" }}>
        <Card><div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div></Card>
      </div>
    );
  }
  if (!season) {
    return <div style={{ textAlign: "center", marginTop: 80, color: "var(--text-sub)" }}>불러오는 중…</div>;
  }

  const copy = season.landingCopy || {};

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px 80px", fontFamily: "'Noto Serif KR', serif" }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: "var(--case-accent)", fontWeight: 700, marginBottom: 8 }}>
        사건이 도착했습니다
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 18 }}>{season.title}</h1>

      {copy.catchphrase && (
        <div style={{ fontSize: 14, color: "var(--text-sub)", marginBottom: 18, whiteSpace: "pre-line", lineHeight: 1.7 }}>
          {copy.catchphrase}
        </div>
      )}
      {copy.intro && (
        <div style={{ fontSize: 13.5, lineHeight: 1.9, marginBottom: 24, whiteSpace: "pre-line" }}>{copy.intro}</div>
      )}

      {copy.rules && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>수사 규칙</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-line", color: "var(--text-sub)" }}>{copy.rules}</div>
        </Card>
      )}

      {!user ? (
        <PrimaryButton style={{ width: "100%" }} onClick={signInWithGoogle}>
          로그인하고 수사를 시작한다
        </PrimaryButton>
      ) : (
        <>
          <PrimaryButton style={{ width: "100%" }} onClick={handleStart} disabled={starting}>
            {starting ? "시작하는 중…" : copy.startButtonLabel || "수사를 시작한다"}
          </PrimaryButton>
          <div style={{ fontSize: 11, color: "var(--text-sub)", textAlign: "center", marginTop: 8 }}>
            이 선택은 되돌릴 수 없습니다. {season.totalDays}일간의 수사가 지금 시작됩니다.
          </div>
        </>
      )}
    </div>
  );
}
