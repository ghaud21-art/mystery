import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { uploadGameMedia } from "../../lib/gameMedia.js";
import {
  caseGameAdminList, caseGameAdminGet, caseGameAdminImport, caseGameAdminPublish,
  caseGameAdminDelete, caseGameAdminResetMyRun, caseGameAdminStats,
} from "../../lib/caseApi.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../../components/ui.jsx";

const MEDIA_KEYS = ["video", "poster", "image", "audio", "thumbnail"];

// 시나리오 안에서 파일명으로 참조된 영상/이미지/음성을 전부 모음 (http 주소는 제외)
function collectMediaNames(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => collectMediaNames(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (MEDIA_KEYS.includes(k) && typeof v === "string" && v && !/^https?:\/\//.test(v)) out.add(v);
      else collectMediaNames(v, out);
    }
  }
  return out;
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box",
};

export default function AdminCaseGames() {
  const [games, setGames] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [showImport, setShowImport] = useState(false);
  const [importId, setImportId] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importing, setImporting] = useState(false);

  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null); // { scenario, mediaUrls }
  const [stats, setStats] = useState(null);
  const [uploadLog, setUploadLog] = useState({});

  async function load() {
    try {
      setGames((await caseGameAdminList()).games || []);
    } catch (err) {
      setError(err.message);
      setGames([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleImport(e) {
    e.preventDefault();
    setImporting(true);
    setStatus("");
    try {
      const res = await caseGameAdminImport({ gameId: importId.trim(), scenario: JSON.parse(importJson) });
      setStatus(`저장했어요. ${res.warnings?.length ? "참고: " + res.warnings.join(" / ") : "구조 검증을 통과했어요."}${res.activeCount ? ` (플레이 중인 사람 ${res.activeCount}명)` : ""}`);
      setImportJson("");
      await load();
      if (openId === importId.trim()) await openGame(openId);
    } catch (err) {
      setStatus(err.message || "가져오기에 실패했어요. JSON 형식을 확인해주세요.");
    } finally {
      setImporting(false);
    }
  }

  function readJsonFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file.text().then(setImportJson);
  }

  async function openGame(id) {
    setOpenId(id);
    setDetail(null);
    setStats(null);
    setUploadLog({});
    try {
      const [d, s] = await Promise.all([caseGameAdminGet({ gameId: id }), caseGameAdminStats({ gameId: id })]);
      setDetail(d);
      setStats(s);
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePublish(g) {
    try {
      await caseGameAdminPublish({ gameId: g.gameId, published: !g.published });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeGame(g) {
    if (!window.confirm(`"${g.title}"을(를) 삭제할까요?\n시나리오와 플레이어들의 진행 기록이 모두 지워지고 되돌릴 수 없어요. (업로드한 영상 파일은 Storage에 남아요)`)) return;
    try {
      await caseGameAdminDelete({ gameId: g.gameId });
      if (openId === g.gameId) { setOpenId(null); setDetail(null); }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetMine(id) {
    try {
      await caseGameAdminResetMyRun({ gameId: id });
      setStatus("내 테스트 진행을 초기화했어요. '플레이해보기'로 처음부터 다시 시작할 수 있어요.");
    } catch (err) {
      setError(err.message);
    }
  }

  // 파일명이 시나리오가 참조하는 이름과 같은 파일만 올려서 자동으로 연결함.
  async function uploadFiles(files) {
    const wanted = collectMediaNames(detail.scenario);
    for (const file of files) {
      if (!wanted.has(file.name)) { setUploadLog((l) => ({ ...l, [file.name]: "시나리오가 쓰지 않는 파일명이라 건너뜀" })); continue; }
      setUploadLog((l) => ({ ...l, [file.name]: "올리는 중…" }));
      try {
        const url = await uploadGameMedia(openId, file.name, file);
        setDetail((d) => ({ ...d, mediaUrls: { ...d.mediaUrls, [file.name]: url } }));
        setUploadLog((l) => ({ ...l, [file.name]: "완료" }));
      } catch (err) {
        setUploadLog((l) => ({ ...l, [file.name]: `실패: ${err.code || err.message}` }));
      }
    }
    await load();
  }

  const names = detail ? [...collectMediaNames(detail.scenario)].sort() : [];
  const missing = detail ? names.filter((n) => !detail.mediaUrls?.[n]) : [];

  return (
    <div className="fade-in">
      <Link to="/admin/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 편지 게임 시즌 관리</Link>
      <PageHeader
        eyebrow="ADMIN"
        title="놓친 장면 관리"
        action={<OutlineButton onClick={() => setShowImport((v) => !v)}>{showImport ? "닫기" : "JSON 가져오기"}</OutlineButton>}
      />
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
      {status && <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 12 }}>{status}</div>}

      {showImport && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <strong style={{ fontSize: 12.5 }}>시나리오 JSON 가져오기 (같은 id로 다시 가져오면 내용만 바뀌고 공개 여부·영상 연결은 유지돼요)</strong>
            <input required placeholder="게임 id (영소문자/숫자/하이픈, 예: lighthouse-01)" value={importId} onChange={(e) => setImportId(e.target.value)} style={inputStyle} />
            <input type="file" accept=".json,application/json" onChange={readJsonFile} style={{ fontSize: 12 }} />
            <textarea required rows={8} placeholder="시나리오 JSON을 붙여넣거나 위에서 파일을 고르세요" value={importJson}
              onChange={(e) => setImportJson(e.target.value)} style={{ ...inputStyle, fontFamily: "ui-monospace,monospace", resize: "vertical" }} />
            <PrimaryButton type="submit" disabled={importing}>{importing ? "검증하고 저장하는 중…" : "검증 후 저장"}</PrimaryButton>
          </form>
        </Card>
      )}

      {games === null ? (
        <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>
      ) : games.length === 0 ? (
        <Card><EmptyState>아직 가져온 게임이 없어요. "JSON 가져오기"로 시작하세요.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {games.map((g) => (
            <Card key={g.gameId}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{g.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{g.gameId} · {g.published ? "공개" : "비공개"}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link to={`/case/game/${g.gameId}`}><OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }}>플레이해보기</OutlineButton></Link>
                  <Link to={`/admin/case-games/${g.gameId}/edit`}><OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }}>플레이형 편집</OutlineButton></Link>
                  <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => resetMine(g.gameId)}>내 진행 초기화</OutlineButton>
                  <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => (openId === g.gameId ? setOpenId(null) : openGame(g.gameId))}>
                    {openId === g.gameId ? "관리 닫기" : "영상·현황"}
                  </OutlineButton>
                  <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => togglePublish(g)}>{g.published ? "비공개로" : "공개하기"}</OutlineButton>
                  <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 12, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={() => removeGame(g)}>삭제</OutlineButton>
                </div>
              </div>

              {openId === g.gameId && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
                  {!detail ? <span style={{ fontSize: 13, color: "var(--text-sub)" }}>불러오는 중…</span> : (
                    <>
                      <div>
                        <strong style={{ fontSize: 13 }}>영상·이미지 업로드</strong>
                        <div style={{ fontSize: 11.5, color: "var(--text-sub)", margin: "4px 0 8px", lineHeight: 1.7 }}>
                          시나리오가 쓰는 파일 {names.length}개 중 {missing.length}개가 아직 연결 안 됐어요. 파일명이 시나리오에 적힌 이름과 같은 파일을 여러 개 한 번에 골라 올리면 자동으로 연결돼요.
                          (영상 파일은 한 개당 100MB 이하)
                        </div>
                        <input type="file" multiple accept="video/*,image/*,audio/*" onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; uploadFiles(f); }} style={{ fontSize: 12 }} />
                        {Object.keys(uploadLog).length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.7 }}>
                            {Object.entries(uploadLog).map(([n, s]) => <div key={n}>{n} — {s}</div>)}
                          </div>
                        )}
                        {missing.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text-sub)", lineHeight: 1.7 }}>
                            <strong>아직 없는 파일:</strong> {missing.join(", ")}
                          </div>
                        )}
                      </div>
                      {stats && (
                        <div>
                          <strong style={{ fontSize: 13 }}>현황</strong>
                          <div style={{ fontSize: 12.5, marginTop: 4 }}>시작 {stats.started}명 · 완주 {stats.completed}명</div>
                          <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 4, lineHeight: 1.7 }}>
                            결말: {stats.endings.map((e) => `${e.title} ${e.count}`).join(" · ")}
                            <br />장소 방문: {stats.locations.map((l) => `${l.name} ${l.visits}`).join(" · ")}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
