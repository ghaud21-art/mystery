import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toPng } from "html-to-image";
import { useAuth } from "../context/AuthContext.jsx";
import { SURVEY, TYPE_KEYS, TYPE_META } from "../lib/personality.js";
import { analyzeStyle, canUseAI, KAKAO_CONTACT_URL } from "../lib/ai.js";
import { AILimitNotice, Badge, Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function StyleResult() {
  const { profile, setProfile } = useAuth();
  const cardRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  async function handleAnalyze() {
    setAnalyzeError("");
    setAnalyzing(true);
    try {
      const analysis = await analyzeStyle(profile, {});
      setProfile((p) => ({ ...p, styleAnalysis: analysis }));
    } catch (err) {
      setAnalyzeError(err.message || "분석에 실패했어요.");
    } finally {
      setAnalyzing(false);
    }
  }

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

  async function renderCardPng() {
    const node = cardRef.current;
    // 웹폰트가 로딩되기 전에 캡처하면 대체 폰트로 글자 폭이 달라져
    // 카드 안 텍스트가 겹쳐 보이는 문제가 있어 폰트 로딩을 먼저 기다림.
    await document.fonts.ready;
    const rect = node.getBoundingClientRect();
    return toPng(node, {
      pixelRatio: 2,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      cacheBust: true,
    });
  }

  async function saveImage() {
    setBusy("saving");
    try {
      const dataUrl = await renderCardPng();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `머더미스터리_성향카드_${profile.style}.png`;
      a.click();
    } finally {
      setBusy("");
    }
  }

  async function shareCard() {
    setBusy("sharing");
    try {
      const dataUrl = await renderCardPng();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "murder-mystery-style.png", { type: "image/png" });
      const shareText = `나는 ${main.title}! 머더미스터리에서 내 추리 성향을 확인해보세요 → https://머더미스터리.com`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "나의 추리 성향", text: shareText });
      } else if (navigator.share) {
        await navigator.share({ title: "나의 추리 성향", text: shareText });
      } else {
        await saveImage();
      }
    } catch {
      // 사용자가 공유를 취소한 경우 등은 조용히 무시
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fade-in">
      <PageHeader title="나의 추리 성향" />
      <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "minmax(280px,400px) 1fr", gap: 24 }}>
        <div ref={cardRef} style={{ background: "linear-gradient(165deg,var(--bg-sub),var(--card))", border: "1px solid var(--accent)", borderRadius: 16, padding: 6 }}>
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
            <div style={{ marginTop: 16, fontSize: 27, fontWeight: 700, whiteSpace: "nowrap" }}>{main.title}</div>
            <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--text-sub)", textAlign: "center" }}>{main.desc}</div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ display: "inline-flex", gap: 4, padding: "4px 12px", borderRadius: 999, border: `1px solid var(--type-${main.cssVar})`, color: `var(--type-${main.cssVar})`, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                주 · {profile.style} {main.icon}
              </span>
              {sub && (
                <span style={{ display: "inline-flex", gap: 4, padding: "4px 12px", borderRadius: 999, border: `1px solid var(--type-${sub.cssVar})`, color: `var(--type-${sub.cssVar})`, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
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

          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-sub)" }}>AI 강점·약점 분석</div>
            <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
              객관식 결과와 <Link to="/friends" style={{ textDecoration: "underline" }}>친구 궁합 메모</Link>를 함께 분석해요.
              나중에 궁합 매칭에도 참고돼요.
            </div>

            {profile.styleAnalysis && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)" }}>강점</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{profile.styleAnalysis.strengths}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)" }}>약점</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{profile.styleAnalysis.weaknesses}</div>
                </div>
              </div>
            )}

            {!canUseAI(profile) ? (
              <AILimitNotice kakaoUrl={KAKAO_CONTACT_URL} />
            ) : (
              <OutlineButton onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? "분석 중…" : profile.styleAnalysis ? "다시 분석하기" : "AI로 분석하기"}
              </OutlineButton>
            )}
            {analyzeError && <div style={{ fontSize: 11.5, color: "var(--danger)" }}>{analyzeError}</div>}
          </Card>

          <div style={{ display: "flex", gap: 12 }}>
            <OutlineButton style={{ flex: 1 }} disabled={!!busy} onClick={shareCard}>
              {busy === "sharing" ? "준비 중…" : "공유하기"}
            </OutlineButton>
            <OutlineButton style={{ flex: 1 }} disabled={!!busy} onClick={saveImage}>
              {busy === "saving" ? "저장 중…" : "이미지 저장"}
            </OutlineButton>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
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
