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
        생각을 깨울 때 하기 좋은 추리 게임 시리즈입니다.
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {seasons === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : seasons.length === 0 ? (
        <Card><EmptyState>아직 공개된 시즌이 없어요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {seasons.map((s) => {
            const to = s.myState?.completed
              ? `/case/${s.seasonId}/result`
              : s.myState?.started
              ? `/case/${s.seasonId}/play`
              : `/case/${s.seasonId}`;
            return (
            <Link key={s.seasonId} to={to}>
              <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    {s.title}
                    {!s.published && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-sub)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>
                        미공개 (관리자만 보임)
                      </span>
                    )}
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
      )}
    </div>
  );
}
