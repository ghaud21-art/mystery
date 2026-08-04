import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { SURVEY, TYPE_KEYS, TYPE_META } from "../lib/personality.js";
import { Badge, Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function StyleResult() {
  const { profile } = useAuth();

  if (!profile?.style) {
    return (
      <div className="fade-in">
        <PageHeader title="나의 추리 성향" />
        <Card>
          <EmptyState>
            아직 성향 테스트를 하지 않았어요.
            <div style={{ marginTop: 14 }}>
              <Link to="/style-test">
                <PrimaryButton>테스트 시작하기</PrimaryButton>
              </Link>
            </div>
          </EmptyState>
        </Card>
      </div>
    );
  }

  const main = TYPE_META[profile.style];
  const sub = profile.style2 ? TYPE_META[profile.style2] : null;
  const scores = profile.scores || {};

  return (
    <div className="fade-in">
      <PageHeader title="나의 추리 성향" />
      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px,400px) 1fr", gap: 24 }}>
        <div style={{ background: "linear-gradient(165deg,var(--bg-sub),var(--card))", border: "1px solid var(--accent)", borderRadius: 16, padding: 6 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 11, padding: "28px 22px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ font: "500 10px ui-monospace,monospace", letterSpacing: 3, color: "var(--text-sub)" }}>
              DETECTIVE PROFILE
            </div>
            <div
              style={{
                marginTop: 18, width: 90, height: 90, borderRadius: "50%",
                border: `1.5px solid var(--type-${main.cssVar})`,
                background: "var(--accent-dim)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40,
              }}
            >
              {main.icon}
            </div>
            <div style={{ marginTop: 16, fontSize: 27, fontWeight: 700 }}>{main.title}</div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-sub)", textAlign: "center" }}>{main.desc}</div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ display: "inline-flex", gap: 4, padding: "4px 12px", borderRadius: 999, border: `1px solid var(--type-${main.cssVar})`, color: `var(--type-${main.cssVar})`, fontSize: 12, fontWeight: 600 }}>
                주 · {profile.style} {main.icon}
              </span>
              {sub && (
                <span style={{ display: "inline-flex", gap: 4, padding: "4px 12px", borderRadius: 999, border: `1px solid var(--type-${sub.cssVar})`, color: `var(--type-${sub.cssVar})`, fontSize: 12, fontWeight: 600 }}>
                  보조 · {profile.style2} {sub.icon}
                </span>
              )}
            </div>
            <div style={{ width: "100%", height: 1, background: "var(--border)", margin: "18px 0 12px" }} />
            <div style={{ fontSize: 12.5, color: "var(--text-sub)", fontStyle: "italic" }}>&ldquo;{main.quote}&rdquo;</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-sub)" }}>유형별 점수</div>
            {TYPE_KEYS.map((key) => {
              const meta = TYPE_META[key];
              const pct = Math.round(((scores[key] || 0) / SURVEY.length) * 100);
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 60, fontSize: 12, color: "var(--text-sub)" }}>
                    {key.replace("형", "")} {meta.icon}
                  </span>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--bg-sub)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: `var(--type-${meta.cssVar})` }} />
                  </div>
                  <span style={{ width: 32, textAlign: "right", font: "600 12px ui-monospace,monospace", color: `var(--type-${meta.cssVar})` }}>
                    {pct}
                  </span>
                </div>
              );
            })}
          </Card>

          <div style={{ display: "flex", gap: 12 }}>
            <OutlineButton style={{ flex: 1 }}>카드 공유하기</OutlineButton>
            <Link to="/friends" style={{ flex: 1 }}>
              <OutlineButton style={{ width: "100%" }}>친구 궁합 보기</OutlineButton>
            </Link>
          </div>
          <Link to="/style-test">
            <Badge tone="neutral">테스트 다시 하기</Badge>
          </Link>
        </div>
      </div>
    </div>
  );
}
