import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { caseAdminListSeasons, caseAdminCreateSeason, caseAdminImportSeason, caseAdminDeleteSeason } from "../../lib/caseApi.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../../components/ui.jsx";

export default function AdminCaseSeasons() {
  const [seasons, setSeasons] = useState(null);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [creating, setCreating] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importSeasonId, setImportSeasonId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");

  const [deletingId, setDeletingId] = useState(null);

  async function load() {
    try {
      const res = await caseAdminListSeasons();
      setSeasons(res.seasons || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await caseAdminCreateSeason({ seasonId: newId.trim(), title: newTitle.trim(), cloneFrom: cloneFrom.trim() || undefined });
      setShowCreate(false);
      setNewId(""); setNewTitle(""); setCloneFrom("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  // JSON 붙여넣기로 콘텐츠를 한 번에 시딩하는 경로. git을 거치지 않고 브라우저→Firestore로
  // 바로 올라가므로, 정답/진상 콘텐츠가 커밋 이력에 남을 일이 없음.
  // 기대 형식: { "season": {...}, "days": { "1": {...}, "2": {...}, ... } }
  async function handleImport(e) {
    e.preventDefault();
    setImporting(true);
    setImportStatus("");
    try {
      const parsed = JSON.parse(importJson);
      const res = await caseAdminImportSeason({ seasonId: importSeasonId.trim(), season: parsed.season, days: parsed.days });
      setImportStatus(`가져오기 완료! ${res.dayCount}개 일차 저장됨.`);
      setImportJson("");
      await load();
    } catch (err) {
      setImportStatus(err.message || "가져오기에 실패했어요. JSON 형식을 확인해주세요.");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(s) {
    if (!window.confirm(`"${s.title}" 시즌을 정말 삭제할까요?\n이 시즌의 콘텐츠뿐 아니라, 지금까지 플레이어들의 진행상황·제출·결과도 전부 함께 삭제돼요. 되돌릴 수 없어요.`)) return;
    setDeletingId(s.seasonId);
    try {
      await caseAdminDeleteSeason({ seasonId: s.seasonId });
      setSeasons((list) => (list || []).filter((x) => x.seasonId !== s.seasonId));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="ADMIN"
        title="사건 콘텐츠 관리"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <OutlineButton onClick={() => setShowImport((v) => !v)}>{showImport ? "닫기" : "JSON 가져오기"}</OutlineButton>
            <PrimaryButton onClick={() => setShowCreate((v) => !v)}>{showCreate ? "닫기" : "+ 새 시즌"}</PrimaryButton>
          </div>
        }
      />

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {showImport && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>시즌 JSON 가져오기 (시딩)</div>
            <input required placeholder="시즌 id (예: season1)" value={importSeasonId}
              onChange={(e) => setImportSeasonId(e.target.value)} style={inputStyle} />
            <textarea
              required
              placeholder='{"season": {...}, "days": {"1": {...}, ...}}'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={10}
              style={{ ...inputStyle, fontFamily: "ui-monospace,monospace", resize: "vertical" }}
            />
            <PrimaryButton type="submit" disabled={importing}>{importing ? "가져오는 중…" : "가져오기"}</PrimaryButton>
            {importStatus && <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{importStatus}</div>}
          </form>
        </Card>
      )}

      {showCreate && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>새 시즌 만들기</div>
            <input required placeholder="시즌 id (영소문자/숫자/하이픈)" value={newId}
              onChange={(e) => setNewId(e.target.value)} style={inputStyle} />
            <input required placeholder="제목" value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)} style={inputStyle} />
            <input placeholder="복제할 기존 시즌 id (선택)" value={cloneFrom}
              onChange={(e) => setCloneFrom(e.target.value)} style={inputStyle} />
            <PrimaryButton type="submit" disabled={creating}>{creating ? "만드는 중…" : "만들기"}</PrimaryButton>
          </form>
        </Card>
      )}

      {seasons === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : seasons.length === 0 ? (
        <Card><EmptyState>아직 시즌이 없어요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {seasons.map((s) => (
            <Card key={s.seasonId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                  {s.seasonId} · {s.published ? "공개" : "비공개"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/admin/case/${s.seasonId}/stats`}><OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }}>현황</OutlineButton></Link>
                <Link to={`/admin/case/${s.seasonId}`}><OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }}>편집</OutlineButton></Link>
                <OutlineButton
                  style={{ height: 32, padding: "0 12px", fontSize: 12, borderColor: "var(--danger)", color: "var(--danger)" }}
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.seasonId}
                >
                  {deletingId === s.seasonId ? "삭제 중…" : "삭제"}
                </OutlineButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box",
};
