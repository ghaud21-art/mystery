import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { TYPE_META } from "../lib/personality.js";
import { Card, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Profile() {
  const { profile, signOut } = useAuth();
  const main = profile?.style ? TYPE_META[profile.style] : null;

  return (
    <div className="fade-in" style={{ maxWidth: 480 }}>
      <PageHeader title="프로필" />
      <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", overflow: "hidden",
            border: "1.5px solid var(--accent)", background: "var(--accent-dim)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
          }}>
            {profile?.photoURL ? <img src={profile.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (main?.icon ?? "🕵️")}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{profile?.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{profile?.email}</div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 6 }}>추리 성향</div>
          {main ? (
            <div style={{ fontSize: 14, fontWeight: 600 }}>{main.icon} {main.title}</div>
          ) : (
            <Link to="/style-test"><PrimaryButton>테스트 시작하기</PrimaryButton></Link>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {main && (
            <Link to="/style-test" style={{ flex: 1 }}>
              <OutlineButton style={{ width: "100%" }}>테스트 다시 하기</OutlineButton>
            </Link>
          )}
          <OutlineButton style={{ flex: 1, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={signOut}>
            로그아웃
          </OutlineButton>
        </div>
      </Card>
    </div>
  );
}
