import { useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { TYPE_META } from "../lib/personality.js";
import { AVATAR_EMOJIS, displayAvatar, displayName } from "../lib/profileDisplay.js";
import { Card, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Profile() {
  const { profile, setProfile, signOut } = useAuth();
  const main = profile?.style ? TYPE_META[profile.style] : null;

  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(profile?.nickname || profile?.name || "");
  const [avatarEmoji, setAvatarEmoji] = useState(profile?.avatarEmoji || "");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setNickname(profile?.nickname || profile?.name || "");
    setAvatarEmoji(profile?.avatarEmoji || "");
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const patch = { nickname: nickname.trim() || null, avatarEmoji: avatarEmoji || null };
    await updateDoc(doc(db, "users", profile.id), patch);
    setProfile((p) => ({ ...p, ...patch }));
    setSaving(false);
    setEditing(false);
  }

  const avatar = displayAvatar(profile);

  return (
    <div className="fade-in" style={{ maxWidth: 480 }}>
      <PageHeader title="프로필" />
      <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!editing ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", overflow: "hidden",
                border: "1.5px solid var(--accent)", background: "var(--accent-dim)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
              }}>
                {avatar || (profile?.photoURL
                  ? <img src={profile.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : (main?.icon ?? "🕵️"))}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{displayName(profile)}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{profile?.email}</div>
              </div>
              <OutlineButton style={{ marginLeft: "auto", height: 34, padding: "0 12px", fontSize: 12 }} onClick={startEdit}>
                편집
              </OutlineButton>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 6 }}>추리 성향</div>
              {main ? (
                <Link to="/style-result" style={{ display: "block" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{main.icon} {main.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--accent)", marginTop: 2 }}>결과 다시 보기 →</div>
                </Link>
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
              {profile?.isAdmin && (
                <Link to="/admin" style={{ flex: 1 }}>
                  <OutlineButton style={{ width: "100%" }}>관리자 페이지</OutlineButton>
                </Link>
              )}
              <OutlineButton style={{ flex: 1, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={signOut}>
                로그아웃
              </OutlineButton>
            </div>
          </>
        ) : (
          <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>닉네임</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                placeholder="화면에 표시될 이름"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>아바타</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
                {AVATAR_EMOJIS.map((em) => (
                  <button
                    type="button"
                    key={em}
                    onClick={() => setAvatarEmoji(em)}
                    style={{
                      aspectRatio: "1", borderRadius: 10, fontSize: 20,
                      border: `1.5px solid ${avatarEmoji === em ? "var(--accent)" : "var(--border)"}`,
                      background: avatarEmoji === em ? "var(--accent-dim)" : "var(--bg)",
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <PrimaryButton type="submit" disabled={saving} style={{ flex: 1 }}>{saving ? "저장 중…" : "저장"}</PrimaryButton>
              <OutlineButton type="button" style={{ flex: 1 }} onClick={() => setEditing(false)}>취소</OutlineButton>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
