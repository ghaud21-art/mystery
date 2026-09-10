import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { caseAdminGetStats } from "../../lib/caseApi.js";
import { Card, PageHeader } from "../../components/ui.jsx";

export default function AdminCaseStats() {
  const { seasonId } = useParams();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setStats(await caseAdminGetStats({ seasonId }));
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [seasonId]);

  return (
    <div className="fade-in">
      <Link to="/admin/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 시즌 목록</Link>
      <PageHeader eyebrow="ADMIN" title="시즌 현황" />

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
      {!stats ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Card style={{ flex: "1 1 140px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-sub)" }}>시작한 인원</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{stats.startedCount}</div>
            </Card>
            <Card style={{ flex: "1 1 140px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-sub)" }}>완료한 인원</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{stats.completedCount}</div>
            </Card>
            <Card style={{ flex: "1 1 140px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-sub)" }}>만점</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{stats.maxScore}</div>
            </Card>
          </div>

          <Card>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>일차별 제출/정답률 (목표 45~60%)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {stats.perDay.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-sub)" }}>아직 제출이 없어요.</div>
              ) : (
                stats.perDay.map((d) => (
                  <div key={d.day} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{d.day}일차</span>
                    <span>{d.submitted}건 제출 · 정답률 {d.correctRate}%</span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>등급 분포</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {stats.tierDistribution.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-sub)" }}>아직 완료자가 없어요.</div>
              ) : (
                stats.tierDistribution.map((t) => (
                  <div key={t.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span>{t.name}</span>
                    <span>{t.count}명</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
