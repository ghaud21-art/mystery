import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toPng } from "html-to-image";
import { useAuth } from "../../context/AuthContext.jsx";
import { displayName } from "../../lib/profileDisplay.js";
import { caseGetResult, caseRetryJudge } from "../../lib/caseApi.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton, ScrollBox } from "../../components/ui.jsx";
import OXGrid from "../../components/case/OXGrid.jsx";
import ShareCard from "../../components/case/ShareCard.jsx";

export default function CaseResult() {
  const { seasonId } = useParams();
  const { profile } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [saving, setSaving] = useState(false);
  const shareRef = useRef(null);

  async function load() {
    try {
      setResult(await caseGetResult({ seasonId }));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  useEffect(() => {
    if (result?.status !== "judging") return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.status]);

  async function handleRetry() {
    setRetrying(true);
    setError("");
    try {
      await caseRetryJudge({ seasonId });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRetrying(false);
    }
  }

  async function handleSaveImage() {
    setSaving(true);
    try {
      await document.fonts.ready;
      const node = shareRef.current;
      const dataUrl = await toPng(node, { pixelRatio: 2, width: 540, height: 540, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `사건이도착했습니다_${seasonId}_결과.png`;
      a.click();
    } finally {
      setSaving(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/case/${seasonId}`);
  }

  if (error) return <div style={{ padding: 20, color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  if (!result) return <div style={{ textAlign: "center", marginTop: 60, color: "var(--text-sub)" }}>불러오는 중…</div>;

  if (result.status === "none") {
    return (
      <div className="fade-in">
        <Card><EmptyState>아직 완료한 결과가 없어요.</EmptyState></Card>
      </div>
    );
  }
  if (result.status === "judging") {
    return (
      <div className="fade-in" style={{ textAlign: "center", marginTop: 60 }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>한결의 기억을 맞춰보는 중…</div>
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>잠시만 기다려주세요. 이 화면을 나가도 판정은 계속 진행돼요.</div>
      </div>
    );
  }
  if (result.status === "failed") {
    return (
      <div className="fade-in">
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13.5, color: "var(--danger)" }}>판정 중 문제가 발생했어요.</div>
          <PrimaryButton onClick={handleRetry} disabled={retrying}>{retrying ? "재시도 중…" : "다시 시도"}</PrimaryButton>
        </Card>
      </div>
    );
  }

  const modeBadge = result.mode === "night" ? "밤샘 수사" : "실시간 수사 완주";

  return (
    <div className="fade-in">
      <PageHeader eyebrow="CASE CLOSED" title={result.tier?.name || "수사 완료"} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "var(--text-sub)" }}>기억 복원률</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: "var(--accent)" }}>{result.percent}%</div>
          <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginTop: 4 }}>{result.tier?.blurb}</div>
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>일차별 정오</div>
          <OXGrid grid={result.grid} showFinalLabel={result.finalChoiceScored !== false} />
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>한결의 마지막 편지</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.85, whiteSpace: "pre-wrap", fontFamily: "'Noto Serif KR', serif" }}>
            {result.finalLetter}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>체크포인트 도달 내역</div>
          <ScrollBox maxHeight={280}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(result.checkpointsResult || []).map((c) => (
                <div key={c.id} style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, background: "var(--bg-sub)" }}>
                  <span style={{ color: c.reached ? "var(--success)" : "var(--text-sub)", fontWeight: 700 }}>
                    {c.reached ? "✓" : "✕"} {c.description}
                  </span>
                  {c.evidence && <div style={{ marginTop: 3, color: "var(--text-sub)" }}>&ldquo;{c.evidence}&rdquo;</div>}
                </div>
              ))}
            </div>
          </ScrollBox>
        </Card>

        <Card>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>진상 전체 해설</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--text-sub)" }}>
            {result.truthExplanation}
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div style={{ position: "fixed", left: -9999, top: 0 }}>
            <ShareCard
              ref={shareRef}
              seriesName="사건이 도착했습니다"
              seasonName={result.seasonTitle}
              nickname={displayName(profile)}
              tierName={result.tier?.name}
              percent={result.percent}
              grid={result.grid}
              modeBadge={modeBadge}
              url="머더미스터리.com"
            />
          </div>
          <PrimaryButton style={{ width: "100%" }} onClick={handleSaveImage} disabled={saving}>
            {saving ? "저장 중…" : "이미지로 저장"}
          </PrimaryButton>
          <OutlineButton style={{ width: "100%" }} onClick={handleCopyLink}>시즌 추천 링크 복사</OutlineButton>
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <Link to="/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 사건 목록으로</Link>
      </div>
    </div>
  );
}
