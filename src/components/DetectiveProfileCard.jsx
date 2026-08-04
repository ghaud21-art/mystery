import { TYPE_META } from "../lib/personality.js";

// 성향 결과/추천 카드 이미지 저장에 함께 쓰이는 "추리 성향" 카드.
export default function DetectiveProfileCard({ profile }) {
  const main = profile?.style ? TYPE_META[profile.style] : null;
  const sub = profile?.style2 ? TYPE_META[profile.style2] : null;
  if (!main) return null;

  return (
    <div style={{ background: "linear-gradient(165deg,var(--bg-sub),var(--card))", border: "1px solid var(--accent)", borderRadius: 14, padding: 4 }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "18px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ font: "500 10px ui-monospace,monospace", letterSpacing: 3, color: "var(--text-sub)" }}>
          DETECTIVE PROFILE
        </div>
        <div
          style={{
            marginTop: 12, width: 76, height: 76, borderRadius: "50%",
            border: `1.5px solid var(--type-${main.cssVar})`,
            background: "var(--accent-dim)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
          }}
        >
          {main.icon}
        </div>
        <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, whiteSpace: "nowrap" }}>{main.title}</div>
        <div style={{ marginTop: 3, fontSize: 12, color: "var(--text-sub)", textAlign: "center" }}>{main.desc}</div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ display: "inline-flex", gap: 4, padding: "3px 11px", borderRadius: 999, border: `1px solid var(--type-${main.cssVar})`, color: `var(--type-${main.cssVar})`, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
            주 · {profile.style} {main.icon}
          </span>
          {sub && (
            <span style={{ display: "inline-flex", gap: 4, padding: "3px 11px", borderRadius: 999, border: `1px solid var(--type-${sub.cssVar})`, color: `var(--type-${sub.cssVar})`, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
              보조 · {profile.style2} {sub.icon}
            </span>
          )}
        </div>
        <div style={{ width: "100%", height: 1, background: "var(--border)", margin: "12px 0 10px" }} />
        <div style={{ fontSize: 12, color: "var(--text-sub)", fontStyle: "italic" }}>&ldquo;{main.quote}&rdquo;</div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, width: "100%" }}>
          <span style={{
            flex: 1, textAlign: "center", padding: "6px 8px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
            background: "color-mix(in srgb, var(--success) 14%, transparent)", color: "var(--success)",
          }}>
            💪 {main.strength}
          </span>
          <span style={{
            flex: 1, textAlign: "center", padding: "6px 8px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
            background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)",
          }}>
            ⚠️ {main.weakness}
          </span>
        </div>
      </div>
    </div>
  );
}
