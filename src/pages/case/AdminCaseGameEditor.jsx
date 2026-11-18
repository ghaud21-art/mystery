import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { caseGameAdminGet, caseGameAdminPatch } from "../../lib/caseApi.js";
import { Card, OutlineButton, PageHeader, PrimaryButton } from "../../components/ui.jsx";

const DEFAULT_TW = 1.5;
const DIFF = { easy: "쉬움", normal: "보통", hard: "어려움", fake: "가짜" };
const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 플레이어 쪽과 같은 판정(functions/case/missedRules.js의 activeRects/inRect를 그대로 옮김)
const isTimed = (s) => s.at?.length > 0;
const rectsAt = (s, t) => (isTimed(s) ? s.at.filter((a) => Math.abs(t - a.t) <= (a.tw ?? DEFAULT_TW)) : s.x != null ? [s] : []);
const inRect = (r, fx, fy) => fx >= r.x && fx <= r.x + (r.w ?? 0.12) && fy >= r.y && fy <= r.y + (r.h ?? 0.12);

const inputStyle = {
  padding: "8px 10px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 12.5, width: "100%", boxSizing: "border-box",
};

// 위치 정보를 단서/혼란 지점 공통의 "지점" 모양으로 맞춤
function spotMode(s) {
  if (isTimed(s)) return "timed";
  if (s.x != null) return "fixed";
  return "none";
}

export default function AdminCaseGameEditor() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [locId, setLocId] = useState(null);
  // spots: { [id]: { kind, label, title?, text?, textNoSkew?, x,y,w,h, at } } — 편집 중인 복사본과 서버 원본
  const [spots, setSpots] = useState({});
  const [orig, setOrig] = useState({});
  const [selId, setSelId] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [curT, setCurT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drag, setDrag] = useState(null); // {x0,y0,x1,y1}
  const [saving, setSaving] = useState(false);
  const videoRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    caseGameAdminGet({ gameId }).then((g) => {
      setGame(g);
      const all = {};
      for (const l of g.scenario.locations) {
        for (const c of l.clues ?? []) {
          all[c.id] = { kind: "clue", locId: l.id, difficulty: c.difficulty, label: c.hotspot?.label ?? c.title, title: c.title ?? "", text: c.text ?? "", textNoSkew: c.textNoSkew ?? "", x: c.hotspot?.x ?? null, y: c.hotspot?.y ?? null, w: c.hotspot?.w ?? null, h: c.hotspot?.h ?? null, at: c.hotspot?.at ? c.hotspot.at.map((a) => ({ ...a })) : [] };
        }
        for (const [i, d] of (l.decoyHotspots ?? []).entries()) {
          const id = d.id ?? `${l.id}_d${i}`;
          all[id] = { kind: "decoy", locId: l.id, label: d.label ?? "", text: d.text ?? "", x: d.x ?? null, y: d.y ?? null, w: d.w ?? null, h: d.h ?? null, at: [] };
        }
      }
      setSpots(all);
      setOrig(JSON.parse(JSON.stringify(all)));
      setLocId(g.scenario.locations[0]?.id ?? null);
    }).catch((e) => setError(e.message));
  }, [gameId]);

  const dirtyIds = useMemo(() => Object.keys(spots).filter((id) => !eq(spots[id], orig[id])), [spots, orig]);

  useEffect(() => {
    const warn = (e) => { if (dirtyIds.length) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds.length]);

  const loc = game?.scenario.locations.find((l) => l.id === locId);
  const locSpots = useMemo(() => Object.entries(spots).filter(([, s]) => s.locId === locId), [spots, locId]);
  const videoName = loc?.video;
  const videoSrc = videoName ? (/^https?:\/\//.test(videoName) ? videoName : game?.mediaUrls?.[videoName]) : null;
  const sel = selId ? spots[selId] : null;

  function selectLoc(id) {
    if (id === locId) return;
    setLocId(id); setSelId(null); setCurT(0); setPlaying(false); setTestMsg("");
  }
  const patchSpot = (id, f) => setSpots((s) => ({ ...s, [id]: { ...s[id], ...(typeof f === "function" ? f(s[id]) : f) } }));
  const seek = (t) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.min(Math.max(0, t), dur || v.duration || 0); setCurT(v.currentTime); };

  function pos(e) {
    const r = stageRef.current.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  }
  function onDown(e) {
    if (!videoSrc) return;
    videoRef.current?.pause();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pos(e);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function onMove(e) { if (drag) { const p = pos(e); setDrag((d) => ({ ...d, x1: p.x, y1: p.y })); } }
  function onUp(e) {
    if (!drag) return;
    const p = pos(e);
    const d = { ...drag, x1: p.x, y1: p.y };
    setDrag(null);
    const rect = { x: round(Math.min(d.x0, d.x1)), y: round(Math.min(d.y0, d.y1)), w: round(Math.abs(d.x1 - d.x0)), h: round(Math.abs(d.y1 - d.y0)) };
    const t = videoRef.current?.currentTime ?? curT;
    if (testMode) {
      // 플레이처럼: 누른 자리에 무엇이 있는지만 알려 줌
      const hit = locSpots.find(([, s]) => rectsAt(s, t).some((r) => inRect(r, p.x, p.y)));
      setTestMsg(hit ? (hit[1].kind === "clue" ? `✔ 단서 발견: ${hit[1].title || hit[1].label} (${hit[0]})` : `· 혼란 지점: ${hit[1].label}`) : "그곳에서는 아무것도 찾지 못했다.");
      return;
    }
    if (rect.w < 0.01 || rect.h < 0.01) {
      // 점 클릭 → 그 자리에 있는 지점 선택
      const hit = locSpots.find(([, s]) => rectsAt(s, t).some((r) => inRect(r, p.x, p.y)));
      if (hit) setSelId(hit[0]);
      return;
    }
    if (!selId) { setStatus("먼저 오른쪽 목록에서 위치를 정할 단서를 골라 주세요."); return; }
    patchSpot(selId, (s) => {
      if (s.kind === "decoy") return rect;
      const mode = spotMode(s);
      if (mode === "fixed") return rect;
      const at = [...s.at];
      const i = at.findIndex((a) => Math.abs(a.t - t) < 0.5);
      if (i >= 0) at[i] = { ...at[i], ...rect };
      else at.push({ t: round(t, 2), tw: 1.2, ...rect });
      at.sort((a, b) => a.t - b.t);
      return { at, x: null, y: null, w: null, h: null };
    });
    setStatus("");
  }

  async function save() {
    setSaving(true); setError(""); setStatus("");
    try {
      const patch = { clues: {}, decoys: {} };
      for (const id of dirtyIds) {
        const s = spots[id];
        if (s.kind === "decoy") {
          patch.decoys[id] = { label: s.label, text: s.text, ...(s.x != null ? { x: s.x, y: s.y, w: s.w, h: s.h } : { x: null }) };
        } else {
          const hotspot = isTimed(s) ? { label: s.label, at: s.at } : s.x != null ? { label: s.label, x: s.x, y: s.y, w: s.w, h: s.h } : { label: s.label };
          patch.clues[id] = { title: s.title, text: s.text, textNoSkew: s.textNoSkew, hotspot };
        }
      }
      const res = await caseGameAdminPatch({ gameId, patch });
      setOrig(JSON.parse(JSON.stringify(spots)));
      setStatus(`저장했어요. (${res.changed}곳 수정)${res.warnings?.length ? " 참고: " + res.warnings.join(" / ") : ""}`);
    } catch (e) {
      setError(e.message || "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !game) return <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  if (!game) return <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>;

  const rectsToShow = testMode ? [] : locSpots.flatMap(([id, s]) => rectsAt(s, curT).map((r) => ({ id, s, r })));
  const dragRect = drag && { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
  const chip = (s) => ({ timed: `시각 ${s.at.length}곳`, fixed: "고정", none: "위치 없음(버튼)" }[spotMode(s)]);

  return (
    <div className="fade-in">
      <Link to="/admin/case-games" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 놓친 장면 관리</Link>
      <PageHeader
        eyebrow="ADMIN"
        title={`${game.scenario.meta.title} · 플레이형 편집`}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <OutlineButton onClick={() => { setTestMode((v) => !v); setTestMsg(""); }}>{testMode ? "편집으로 돌아가기" : "플레이처럼 눌러보기"}</OutlineButton>
            <PrimaryButton onClick={save} disabled={!dirtyIds.length || saving}>{saving ? "저장하는 중…" : dirtyIds.length ? `저장 (${dirtyIds.length}곳 변경)` : "변경 없음"}</PrimaryButton>
          </div>
        }
      />
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
      {status && <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 10 }}>{status}</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {game.scenario.locations.map((l) => {
          const n = Object.values(spots).filter((s) => s.locId === l.id && s.kind === "clue" && spotMode(s) === "none").length;
          return (
            <button key={l.id} type="button" onClick={() => selectLoc(l.id)} style={{
              height: 34, padding: "0 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${l.id === locId ? "var(--accent)" : "var(--border)"}`,
              background: l.id === locId ? "var(--accent-dim)" : "transparent", color: l.id === locId ? "var(--accent)" : "var(--text-sub)",
            }}>
              {l.name}{n > 0 ? ` · 미지정 ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ gridColumn: "span 2", minWidth: 0 }}>
          <Card style={{ padding: 12 }}>
            {!videoSrc ? (
              <div style={{ fontSize: 13, color: "var(--text-sub)", lineHeight: 1.8, padding: 12 }}>
                이 장소의 영상({videoName || "지정 안 됨"})이 아직 업로드되지 않았어요. "놓친 장면 관리 → 영상·현황"에서 올린 뒤 다시 열어 주세요.
                영상 없이도 아래 목록에서 단서 문구는 고칠 수 있어요.
              </div>
            ) : (
              <>
                <div ref={stageRef} style={{ position: "relative", aspectRatio: "16 / 9", background: "#000", borderRadius: 10, overflow: "hidden", touchAction: "none" }}>
                  <video
                    key={videoSrc} ref={videoRef} src={videoSrc} playsInline preload="auto" muted
                    onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
                    onTimeUpdate={(e) => setCurT(e.currentTarget.currentTime)}
                    onSeeked={(e) => setCurT(e.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                    style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
                  />
                  <div
                    onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
                    style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
                  />
                  {rectsToShow.map(({ id, s, r }, i) => (
                    <div key={id + i} style={{
                      position: "absolute", left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${(r.w ?? 0.12) * 100}%`, height: `${(r.h ?? 0.12) * 100}%`,
                      border: `2px ${id === selId ? "solid" : "dashed"} ${id === selId ? "#ffd54a" : s.kind === "decoy" ? "#ff9f6b" : "#7fd1ff"}`,
                      background: id === selId ? "rgba(255,213,74,.18)" : "rgba(127,209,255,.08)", pointerEvents: "none", boxSizing: "border-box",
                    }}>
                      <span style={{ position: "absolute", top: -17, left: 0, fontSize: 10, color: "#fff", background: "rgba(0,0,0,.6)", padding: "0 4px", whiteSpace: "nowrap" }}>{id}</span>
                    </div>
                  ))}
                  {dragRect && (
                    <div style={{ position: "absolute", left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.w * 100}%`, height: `${dragRect.h * 100}%`, border: "2px solid #ffd54a", background: "rgba(255,213,74,.25)", pointerEvents: "none" }} />
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <OutlineButton style={{ height: 30, padding: "0 12px" }} onClick={() => (playing ? videoRef.current?.pause() : videoRef.current?.play())}>{playing ? "❚❚" : "▶"}</OutlineButton>
                  <OutlineButton style={{ height: 30, padding: "0 8px", fontSize: 12 }} onClick={() => seek(curT - 1)}>−1초</OutlineButton>
                  <OutlineButton style={{ height: 30, padding: "0 8px", fontSize: 12 }} onClick={() => seek(curT - 0.1)}>−0.1</OutlineButton>
                  <OutlineButton style={{ height: 30, padding: "0 8px", fontSize: 12 }} onClick={() => seek(curT + 0.1)}>+0.1</OutlineButton>
                  <OutlineButton style={{ height: 30, padding: "0 8px", fontSize: 12 }} onClick={() => seek(curT + 1)}>+1초</OutlineButton>
                  <input type="range" min={0} max={dur || 0} step={0.05} value={Math.min(curT, dur || 0)} onChange={(e) => seek(Number(e.target.value))} style={{ flex: 1, minWidth: 120 }} />
                  <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-sub)" }}>{fmt(curT)} / {fmt(dur || 0)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 8, lineHeight: 1.7 }}>
                  {testMode
                    ? "플레이처럼 눌러보기: 영상을 재생하거나 멈추고 화면을 눌러 보세요. 점선은 보이지 않고, 실제 플레이어처럼 찾은 결과만 알려 줘요."
                    : "① 오른쪽에서 단서를 고르고 ② 단서가 화면에 나타나는 순간에 영상을 멈춘 뒤 ③ 그 물건 위를 드래그해 상자를 그리세요. 같은 시점에 다시 그리면 위치만 바뀌고, 다른 시점에 그리면 그 시각이 추가돼요. 영상 속에서 물건이 움직이면 시점마다 한 번씩 그려 주세요."}
                </div>
                {testMsg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>{testMsg}</div>}
              </>
            )}
          </Card>
        </div>

        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <Card style={{ padding: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{loc.name} · 단서와 혼란 지점</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {locSpots.map(([id, s]) => {
                const mode = spotMode(s);
                const visibleNow = rectsAt(s, curT).length > 0;
                return (
                  <div key={id} onClick={() => setSelId(id)} style={{
                    padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5,
                    border: `1.5px solid ${id === selId ? "var(--accent)" : "var(--border)"}`, background: id === selId ? "var(--accent-dim)" : "transparent",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <strong>{s.kind === "clue" ? s.title || s.label : `(혼란) ${s.label}`}</strong>
                      <span style={{ fontSize: 11, color: mode === "none" ? "var(--danger)" : "var(--text-sub)", whiteSpace: "nowrap" }}>{chip(s)}{visibleNow ? " · 지금 보임" : ""}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-sub)" }}>{id}{s.difficulty ? ` · ${DIFF[s.difficulty] ?? s.difficulty}` : ""}{dirtyIds.includes(id) ? " · 수정됨" : ""}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {sel && (
            <Card style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 12.5 }}>{selId} 편집</strong>
              <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>영상 속 물건 이름(돋보기 힌트에 쓰여요)
                <input value={sel.label} onChange={(e) => patchSpot(selId, { label: e.target.value })} style={inputStyle} />
              </label>
              {sel.kind === "clue" && (
                <>
                  <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>단서 제목
                    <input value={sel.title} onChange={(e) => patchSpot(selId, { title: e.target.value })} style={inputStyle} />
                  </label>
                  <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>단서 문구
                    <textarea rows={4} value={sel.text} onChange={(e) => patchSpot(selId, { text: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
                  </label>
                  {(sel.textNoSkew || orig[selId]?.textNoSkew) && (
                    <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>입문 난이도용 문구
                      <textarea rows={3} value={sel.textNoSkew} onChange={(e) => patchSpot(selId, { textNoSkew: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
                    </label>
                  )}
                </>
              )}
              {sel.kind === "decoy" && (
                <label style={{ fontSize: 11.5, color: "var(--text-sub)" }}>눌렀을 때 나오는 문구
                  <textarea rows={2} value={sel.text} onChange={(e) => patchSpot(selId, { text: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
                </label>
              )}

              <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 4 }}>위치</div>
              {sel.kind === "clue" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[["timed", "영상 시각마다"], ["fixed", "항상 같은 자리"], ["none", "위치 없음(버튼)"]].map(([m, label]) => (
                    <OutlineButton key={m} style={{ height: 28, padding: "0 10px", fontSize: 11.5, ...(spotMode(sel) === m ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }}
                      onClick={() => {
                        if (m === "none") patchSpot(selId, { at: [], x: null, y: null, w: null, h: null });
                        else if (m === "fixed") patchSpot(selId, (s) => (s.at[0] ? { at: [], x: s.at[0].x, y: s.at[0].y, w: s.at[0].w, h: s.at[0].h } : { at: [], x: 0.4, y: 0.4, w: 0.15, h: 0.15 }));
                        else patchSpot(selId, (s) => ({ x: null, y: null, w: null, h: null, at: s.at.length ? s.at : s.x != null ? [{ t: round(curT, 2), tw: 1.2, x: s.x, y: s.y, w: s.w, h: s.h }] : [] }));
                      }}>{label}</OutlineButton>
                  ))}
                </div>
              )}
              {spotMode(sel) === "fixed" && <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>영상 위를 드래그해서 자리를 바꿀 수 있어요.</div>}
              {spotMode(sel) === "none" && <div style={{ fontSize: 11.5, color: "var(--text-sub)", lineHeight: 1.6 }}>영상에서 위치를 고르지 않으면 플레이어에게는 "찾아볼 곳" 버튼으로 나타나요.</div>}
              {isTimed(sel) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sel.at.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                      <button type="button" onClick={() => seek(a.t)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>{fmt(a.t)}로 이동</button>
                      <span>±</span>
                      <input type="number" min={0.2} max={10} step={0.1} value={a.tw ?? DEFAULT_TW}
                        onChange={(e) => patchSpot(selId, (s) => ({ at: s.at.map((x, j) => (j === i ? { ...x, tw: Number(e.target.value) || DEFAULT_TW } : x)) }))}
                        style={{ ...inputStyle, width: 64 }} />
                      <span>초 동안 보임</span>
                      <button type="button" onClick={() => patchSpot(selId, (s) => ({ at: s.at.filter((_, j) => j !== i) }))} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 11.5 }}>삭제</button>
                    </div>
                  ))}
                </div>
              )}
              {sel.kind === "decoy" && (sel.x != null
                ? <OutlineButton style={{ height: 28, fontSize: 11.5 }} onClick={() => patchSpot(selId, { x: null, y: null, w: null, h: null })}>위치 지우기</OutlineButton>
                : <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>영상 위를 드래그해서 위치를 정하세요.</div>)}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
