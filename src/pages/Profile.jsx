import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, getDocs, orderBy, query, updateDoc, where } from "firebase/firestore";
import { toPng } from "html-to-image";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { TYPE_META } from "../lib/personality.js";
import { AVATAR_EMOJIS, displayName } from "../lib/profileDisplay.js";
import { resizeImageToDataUrl } from "../lib/image.js";
import Avatar from "../components/Avatar.jsx";
import { Card, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function Profile() {
  const { profile, setProfile, signOut } = useAuth();
  const main = profile?.style ? TYPE_META[profile.style] : null;

  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(profile?.nickname || profile?.name || "");
  const [avatarEmoji, setAvatarEmoji] = useState(profile?.avatarEmoji || "");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  async function handlePhotoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await updateDoc(doc(db, "users", profile.id), { avatarPhotoURL: dataUrl });
      setProfile((p) => ({ ...p, avatarPhotoURL: dataUrl }));
    } catch (err) {
      setUploadError(err.message || "사진 업로드에 실패했어요.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function removePhoto() {
    await updateDoc(doc(db, "users", profile.id), { avatarPhotoURL: null });
    setProfile((p) => ({ ...p, avatarPhotoURL: null }));
  }

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

  return (
    <div className="fade-in" style={{ maxWidth: 480 }}>
      <PageHeader title="프로필" />
      <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!editing ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar profile={profile} size={56} style={{ fontSize: 26 }} />
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{main.icon} {main.title}</div>
                  <Link to="/style-result" style={{ fontSize: 11.5, color: "var(--accent)", whiteSpace: "nowrap" }}>
                    결과 다시 보기 →
                  </Link>
                </div>
              ) : (
                <Link to="/style-test"><PrimaryButton>테스트 시작하기</PrimaryButton></Link>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {main && (
                <Link to="/style-test" style={{ flex: "1 1 130px" }}>
                  <OutlineButton style={{ width: "100%", whiteSpace: "nowrap", padding: "0 10px" }}>테스트 다시 하기</OutlineButton>
                </Link>
              )}
              {profile?.isAdmin && (
                <Link to="/admin" style={{ flex: "1 1 130px" }}>
                  <OutlineButton style={{ width: "100%", whiteSpace: "nowrap", padding: "0 10px" }}>관리자 페이지</OutlineButton>
                </Link>
              )}
              <OutlineButton
                style={{ flex: "1 1 130px", whiteSpace: "nowrap", padding: "0 10px", borderColor: "var(--danger)", color: "var(--danger)" }}
                onClick={signOut}
              >
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
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>프로필 사진</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar profile={profile} size={48} />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoSelected}
                  style={{ display: "none" }}
                />
                <OutlineButton
                  type="button"
                  style={{ height: 36, padding: "0 14px", fontSize: 12.5 }}
                  disabled={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingPhoto ? "업로드 중…" : "사진 올리기"}
                </OutlineButton>
                {profile?.avatarPhotoURL && (
                  <OutlineButton
                    type="button"
                    style={{ height: 36, padding: "0 14px", fontSize: 12.5, borderColor: "var(--danger)", color: "var(--danger)" }}
                    onClick={removePhoto}
                  >
                    제거
                  </OutlineButton>
                )}
              </div>
              {uploadError && <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 6 }}>{uploadError}</div>}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", display: "block", marginBottom: 6 }}>
                아바타 (사진이 없을 때 표시돼요)
              </label>
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

      {!editing && <RecommendationCard profile={profile} main={main} />}
    </div>
  );
}

function RecommendationCard({ profile, main }) {
  const cardRef = useRef(null);
  const [records, setRecords] = useState(null);
  const [customText, setCustomText] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "records"), where("userId", "==", profile.id), orderBy("date", "desc"))
      );
      setRecords(snap.docs.map((d) => d.data()));
    })();
  }, [profile.id]);

  const favorites = (records || []).filter((r) => r.favorite && r.scenarioName);
  const otherCount = (records || []).length - favorites.length;

  async function saveImage() {
    setBusy("saving");
    try {
      await document.fonts.ready;
      const rect = cardRef.current.getBoundingClientRect();
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2, width: Math.ceil(rect.width), height: Math.ceil(rect.height), cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `머더미스터리_추천카드_${displayName(profile)}.png`;
      a.click();
    } finally {
      setBusy("");
    }
  }

  return (
    <Card style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>추천 카드</div>
      <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
        닉네임·추리 성향·플레이 목록을 담은 카드예요. 문구를 더 적고 이미지로 저장해보세요.
      </div>
      <textarea
        placeholder="카드에 추가로 넣을 한마디 (선택)"
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        rows={2}
        style={{
          padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
          background: "var(--bg)", color: "var(--text)", fontSize: 13, resize: "vertical",
        }}
      />

      <div
        ref={cardRef}
        style={{
          background: "linear-gradient(165deg,var(--bg-sub),var(--card))", border: "1px solid var(--accent)",
          borderRadius: 16, padding: "24px 22px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}
      >
        <Avatar profile={profile} size={64} style={{ fontSize: 28 }} />
        <div style={{ fontSize: 18, fontWeight: 700, whiteSpace: "nowrap" }}>{displayName(profile)}</div>
        {main && (
          <span style={{
            display: "inline-flex", gap: 4, padding: "4px 12px", borderRadius: 999,
            border: `1px solid var(--type-${main.cssVar})`, color: `var(--type-${main.cssVar})`,
            fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            {main.icon} {main.title}
          </span>
        )}
        {customText && (
          <div style={{ fontSize: 12.5, color: "var(--text-sub)", fontStyle: "italic", textAlign: "center" }}>
            &ldquo;{customText}&rdquo;
          </div>
        )}
        <div style={{ width: "100%", height: 1, background: "var(--border)" }} />
        <div style={{ width: "100%" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: 1, marginBottom: 8 }}>
            PLAYED · {records?.length ?? 0}편
          </div>
          {records === null ? (
            <div style={{ fontSize: 12, color: "var(--text-sub)" }}>불러오는 중…</div>
          ) : records.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-sub)" }}>아직 플레이 기록이 없어요.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {favorites.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                  아직 ⭐인생머미로 표시한 기록이 없어요 (플레이 기록에서 체크할 수 있어요)
                </div>
              ) : (
                favorites.map((r, i) => (
                  <div key={i} style={{ fontSize: 12.5 }}>⭐ {r.scenarioName}</div>
                ))
              )}
              {otherCount > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>그 외 {otherCount}편</div>
              )}
            </div>
          )}
        </div>
      </div>

      <PrimaryButton onClick={saveImage} disabled={!!busy}>
        {busy === "saving" ? "저장 중…" : "이미지로 저장"}
      </PrimaryButton>
    </Card>
  );
}
