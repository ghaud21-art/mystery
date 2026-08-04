import { displayAvatar } from "../lib/profileDisplay.js";

// 우선순위: 직접 업로드한 사진 > 선택한 이모지 > 구글 프로필 사진 > 기본 아이콘
export default function Avatar({ profile, size = 40, style }) {
  const emoji = displayAvatar(profile);
  const photo = profile?.avatarPhotoURL || (!emoji ? profile?.photoURL : null);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: "var(--accent-dim)",
        border: "1px solid var(--accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.45),
        flex: "none",
        ...style,
      }}
    >
      {photo ? (
        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        emoji || "🕵️"
      )}
    </div>
  );
}
