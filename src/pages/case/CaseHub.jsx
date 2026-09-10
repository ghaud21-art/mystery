import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { caseListSeasons } from "../../lib/caseApi.js";
import { Card, EmptyState, PageHeader } from "../../components/ui.jsx";

export default function CaseHub() {
  const [seasons, setSeasons] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await caseListSeasons();
        setSeasons(res.seasons || []);
      } catch (err) {
        setError(err.message);
        setSeasons([]);
      }
    })();
  }, []);

  return (
    <div className="fade-in">
      <PageHeader eyebrow="CASE FILES" title="사건이 도착했습니다" />
      <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 16 }}>
        매일 도착하는 수사 보고서를 읽고 추리하는 서간형 추리 게임 시리즈예요.
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {seasons === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : seasons.length === 0 ? (
        <Card><EmptyState>아직 공개된 시즌이 없어요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {seasons.map((s) => (
            <Link key={s.seasonId} to={`/case/${s.seasonId}`}>
              <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 4 }}>
                    {s.landingCopy?.catchphrase || `${s.totalDays}일간의 수사기록`}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" }}>
                  {s.myState?.completed ? "결과 보기" : s.myState?.started ? "수사 계속하기" : "수사 시작하기"} →
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
