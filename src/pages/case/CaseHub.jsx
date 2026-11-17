import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { caseListSeasons, caseGamesList } from "../../lib/caseApi.js";
import { Card, EmptyState, PageHeader } from "../../components/ui.jsx";

// 사건 탭의 게임 종류. 편지 게임은 기존 시즌 시스템(caseSeasons), 나머지는 caseGames의 type으로 구분한다.
const SERIES = [
  { key: "letter", label: "편지 게임", desc: "매일 도착하는 수사 보고서를 읽고 추리하는 서간형 게임" },
  { key: "missed", label: "놓친 장면", desc: "며칠 안에 몇 곳만 조사하고, 영상 속 단서와 거짓 진술로 사건을 풀어요" },
  { key: "tanmun", label: "탐문 수사", desc: "예/아니오로만 답하는 기록관에게 질문해서 진상에 다가가요" },
];

const badge = (text) => (
  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-sub)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>{text}</span>
);

export default function CaseHub() {
  const [series, setSeries] = useState(() => {
    try { return sessionStorage.getItem("caseSeries") || "letter"; } catch { return "letter"; }
  });
  const [seasons, setSeasons] = useState(null);
  const [games, setGames] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, g] = await Promise.allSettled([caseListSeasons(), caseGamesList()]);
        setSeasons(s.status === "fulfilled" ? s.value.seasons || [] : []);
        setGames(g.status === "fulfilled" ? g.value.games || [] : []);
        const failed = [s, g].find((x) => x.status === "rejected");
        if (failed) setError(failed.reason?.message || "일부 목록을 불러오지 못했어요.");
      } catch (err) {
        setError(err.message);
        setSeasons([]);
        setGames([]);
      }
    })();
  }, []);

  function choose(key) {
    setSeries(key);
    try { sessionStorage.setItem("caseSeries", key); } catch { /* ignore */ }
  }

  const current = SERIES.find((s) => s.key === series);
  const loading = seasons === null || games === null;
  const gamesOfType = (games || []).filter((g) => g.type === series);

  return (
    <div className="fade-in">
      <PageHeader eyebrow="CASE FILES" title="사건이 도착했습니다" />
      <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 16 }}>
        생각을 깨울 때 하기 좋은 추리 게임 시리즈입니다.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {SERIES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => choose(s.key)}
            style={{
              height: 38, padding: "0 16px", borderRadius: 999, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${series === s.key ? "var(--accent)" : "var(--border)"}`,
              background: series === s.key ? "var(--accent-dim)" : "transparent",
              color: series === s.key ? "var(--accent)" : "var(--text-sub)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-sub)", marginBottom: 16 }}>{current.desc}</div>

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : series === "letter" ? (
        seasons.length === 0 ? (
          <Card><EmptyState>아직 공개된 시즌이 없어요.</EmptyState></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {seasons.map((s) => {
              const to = s.myState?.completed ? `/case/${s.seasonId}/result` : s.myState?.started ? `/case/${s.seasonId}/play` : `/case/${s.seasonId}`;
              return (
                <Link key={s.seasonId} to={to}>
                  <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                        {s.title}
                        {!s.published && badge("미공개 (관리자만 보임)")}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 4 }}>
                        {s.landingCopy?.catchphrase || `${s.totalDays}일간의 수사기록`}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" }}>
                      {s.myState?.completed ? "결과 보기" : s.myState?.started ? "수사 계속하기" : "수사 시작하기"} →
                    </span>
                  </Card>
                </Link>
              );
            })}
          </div>
        )
      ) : gamesOfType.length === 0 ? (
        <Card><EmptyState>{series === "tanmun" ? "탐문 수사 시리즈를 준비 중이에요." : "아직 공개된 이야기가 없어요."}</EmptyState></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {gamesOfType.map((g) => (
            <Link key={g.gameId} to={`/case/game/${g.gameId}`}>
              <Card style={{ padding: 0, overflow: "hidden", height: "100%" }}>
                {g.thumbnailUrl && <img src={g.thumbnailUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }} />}
                <div style={{ padding: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {g.title}
                    {!g.published && badge("미공개 (관리자만 보임)")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 6, lineHeight: 1.6 }}>{g.subtitle}</div>
                  <div style={{ fontSize: 11, color: "var(--text-sub)", marginTop: 8 }}>
                    {g.levels?.length ? g.levels.map((l) => `${l.label} ${l.minutes}`).join(" · ") : ""}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginTop: 10 }}>
                    {g.myState?.completed ? "다시 보기" : g.myState?.started ? "이어서 조사하기" : "조사 시작하기"} →
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
