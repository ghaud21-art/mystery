import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { storage } from "../../lib/firebase.js";
import { caseGameAdminGet, caseGameAdminImport, caseGameAdminSetMedia } from "../../lib/caseApi.js";
import { Card, OutlineButton, PageHeader, PrimaryButton } from "../../components/ui.jsx";

const DEFAULT_TW = 1.5;
const DIFF = { easy: "쉬움", normal: "보통", hard: "어려움", fake: "가짜" };
const LEVEL_KO = { intro: "입문", standard: "표준", advanced: "심화" };
const MEDIA_KEYS = ["video", "poster", "image", "audio", "thumbnail"];
const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

const get = (o, path) => path.reduce((a, k) => a?.[k], o);
function setIn(root, path, val) {
  let o = root;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = val;
}

// 플레이어 쪽과 같은 판정(functions/case/missedRules.js의 activeRects/inRect를 그대로 옮김)
const isTimed = (s) => s.at?.length > 0;
const rectsAt = (s, t) => (isTimed(s) ? s.at.filter((a) => Math.abs(t - a.t) <= (a.tw ?? DEFAULT_TW)) : s.x != null ? [s] : []);
const inRect = (r, fx, fy) => fx >= r.x && fx <= r.x + (r.w ?? 0.12) && fy >= r.y && fy <= r.y + (r.h ?? 0.12);
const spotMode = (s) => (isTimed(s) ? "timed" : s.x != null ? "fixed" : "none");

function readSpots(loc) {
  const out = [];
  (loc.clues ?? []).forEach((c, j) => out.push({
    id: c.id, kind: "clue", j, difficulty: c.difficulty, label: c.hotspot?.label ?? c.title, title: c.title ?? "", text: c.text ?? "", textNoSkew: c.textNoSkew ?? "",
    x: c.hotspot?.x ?? null, y: c.hotspot?.y ?? null, w: c.hotspot?.w ?? null, h: c.hotspot?.h ?? null, at: c.hotspot?.at ? c.hotspot.at.map((a) => ({ ...a })) : [],
  }));
  (loc.decoyHotspots ?? []).forEach((d, j) => out.push({
    id: d.id ?? `${loc.id}_d${j}`, kind: "decoy", j, label: d.label ?? "", text: d.text ?? "", x: d.x ?? null, y: d.y ?? null, w: d.w ?? null, h: d.h ?? null, at: [],
  }));
  return out;
}
function writeSpot(loc, s) {
  if (s.kind === "clue") {
    const c = loc.clues[s.j];
    c.title = s.title; c.text = s.text;
    if (s.textNoSkew) c.textNoSkew = s.textNoSkew; else delete c.textNoSkew;
    c.hotspot = isTimed(s) ? { label: s.label, at: s.at } : s.x != null ? { label: s.label, x: s.x, y: s.y, w: s.w, h: s.h } : { label: s.label };
  } else {
    const d = loc.decoyHotspots[s.j];
    d.label = s.label; d.text = s.text;
    for (const k of ["x", "y", "w", "h"]) delete d[k];
    if (s.x != null) Object.assign(d, { x: s.x, y: s.y, w: s.w, h: s.h });
  }
}

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
// 플레이 순서대로 "이 파일이 어디에 쓰이는지" 이름 붙이기
function mediaList(sc) {
  const m = new Map();
  const add = (name, label) => { if (name && !/^https?:\/\//.test(name) && !m.has(name)) m.set(name, label); };
  add(sc.meta?.thumbnail, "대표 이미지(썸네일)");
  add(sc.briefing?.video, "시작·브리핑 영상");
  for (const l of sc.locations ?? []) {
    add(l.video, `${l.name} · 장소 영상`);
    for (const c of l.clues ?? []) add(c.image, `${l.name} · 단서 이미지 「${c.title}」`);
    const ch = (sc.characters ?? []).find((x) => x.id === l.character);
    if (ch) { add(ch.statement1?.video, `${ch.name} · 첫 번째 진술`); add(ch.statement2?.video, `${ch.name} · 두 번째 진술`); }
  }
  for (const d of sc.decisions ?? []) { add(d.call?.audio, `${d.label} · 전화 음성`); add(d.call?.image, `${d.label} · 전화 이미지`); add(d.callIfNotVisited?.audio, `${d.label} · 전화 음성(안 갔을 때)`); }
  for (const e of sc.endings ?? []) add(e.video, `결말 · ${e.title}`);
  add(sc.hiddenStory?.video, "숨겨진 이야기 영상");
  for (const n of collectMediaNames(sc)) add(n, "기타");
  return [...m.entries()].map(([name, label]) => ({ name, label }));
}

const inputStyle = {
  padding: "8px 10px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: "inherit",
};
const labelStyle = { fontSize: 11.5, color: "var(--text-sub)", display: "flex", flexDirection: "column", gap: 4 };

export default function AdminCaseGameEditor() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null); // { scenario, mediaUrls }
  const [sc, setSc] = useState(null);
  const [origStr, setOrigStr] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("play");
  const [step, setStep] = useState("start");

  useEffect(() => {
    caseGameAdminGet({ gameId }).then((g) => {
      setGame(g);
      setSc(clone(g.scenario));
      setOrigStr(JSON.stringify(g.scenario));
    }).catch((e) => setError(e.message));
  }, [gameId]);

  const dirty = sc && JSON.stringify(sc) !== origStr;
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (fn) => setSc((prev) => { const n = clone(prev); fn(n); return n; });
  const setPath = (path, v) => update((n) => setIn(n, path, v));

  async function save() {
    setSaving(true); setError(""); setStatus("");
    try {
      const res = await caseGameAdminImport({ gameId, scenario: sc });
      setOrigStr(JSON.stringify(sc));
      setStatus(`저장했어요. ${res.warnings?.length ? "참고: " + res.warnings.join(" / ") : "구조 검증을 통과했어요."}${res.activeCount ? ` (지금 플레이 중인 사람 ${res.activeCount}명에게도 바로 적용돼요)` : ""}`);
    } catch (e) {
      setError(e.message || "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !sc) return <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  if (!sc) return <span style={{ color: "var(--text-sub)", fontSize: 13 }}>불러오는 중…</span>;

  // ---- 입력 위젯 (함수 호출로 렌더해서 타이핑 중 포커스가 유지됨)
  const T = (label, path, o = {}) => {
    const v = get(sc, path) ?? "";
    const common = { value: v, onChange: (e) => (o.optional && e.target.value === "" ? update((n) => { let t = n; for (let i = 0; i < path.length - 1; i++) t = t[path[i]]; delete t[path[path.length - 1]]; }) : setPath(path, e.target.value)), style: { ...inputStyle, ...(o.big ? { fontSize: 20, fontWeight: 700 } : {}), resize: "vertical" } };
    return (
      <label key={path.join(".")} style={labelStyle}>
        {label}
        {o.rows ? <textarea rows={o.rows} {...common} /> : <input {...common} />}
        {o.hint && <span style={{ fontSize: 11, color: "var(--text-sub)", opacity: 0.8 }}>{o.hint}</span>}
      </label>
    );
  };
  const List = (label, path, o = {}) => {
    const arr = get(sc, path) ?? [];
    return (
      <div key={path.join(".")} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>{label}</span>
        {arr.map((v, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <textarea rows={o.rows ?? 2} value={v} onChange={(e) => setPath([...path, i], e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
            <OutlineButton type="button" style={{ height: 30, padding: "0 8px", fontSize: 11.5, whiteSpace: "nowrap" }} onClick={() => update((n) => get(n, path).splice(i, 1))}>삭제</OutlineButton>
          </div>
        ))}
        <OutlineButton type="button" style={{ height: 30, fontSize: 12, alignSelf: "flex-start" }} onClick={() => update((n) => { if (!get(n, path)) setIn(n, path, []); get(n, path).push(""); })}>+ 한 줄 추가</OutlineButton>
      </div>
    );
  };
  const Box = (title, children, key) => (
    <div key={key ?? title} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {title && <strong style={{ fontSize: 12.5 }}>{title}</strong>}
      {children}
    </div>
  );

  // ---- 플레이 순서대로 나열한 단계
  const steps = [
    { key: "start", label: "시작·브리핑" },
    ...sc.locations.map((l, i) => ({ key: "loc:" + l.id, label: `${i + 1}. ${l.name}` })),
    { key: "links", label: "단서 잇기" },
    { key: "decisions", label: "결정·전화" },
    { key: "timeline", label: "시간표" },
    { key: "report", label: "보고서" },
    { key: "endings", label: "결말" },
    { key: "story", label: "숨겨진 이야기" },
    { key: "missed", label: "놓친 장면·성찰" },
  ];

  function renderStep() {
    if (step === "start") {
      return (
        <>
          {T("시리즈", ["meta", "series"])}
          {T("제목", ["meta", "title"], { big: true })}
          {T("소개(목록 카드에 보이는 한 줄)", ["meta", "subtitle"], { rows: 3, optional: true })}
          {T("시작 전 콘텐츠 안내 문구(동의 체크박스 위에 보여요)", ["notice"], { rows: 4 })}
          {Box("처음에 선택하는 난이도 문장", Object.keys(sc.levels).map((k) => Box(`${LEVEL_KO[k] ?? k}`, (
            <>
              {T("이름", ["levels", k, "label"])}
              {T("예상 시간(예: 60분)", ["levels", k, "minutes"])}
              {T("설명 문장(선택 화면에 보여요)", ["levels", k, "desc"], { rows: 3 })}
            </>
          ), "lv" + k)))}
          {Box("사건 브리핑", (
            <>
              {T("작은 머리글", ["briefing", "kicker"])}
              {T("브리핑 제목", ["briefing", "title"])}
              {List("브리핑 문단", ["briefing", "lines"], { rows: 3 })}
            </>
          ))}
          {Box("조사 규칙 문장", List("규칙", ["rules"], { rows: 2 }))}
          {Box("시작 자료", (sc.startClues ?? []).map((c, i) => Box(c.id, (
            <>
              {T("제목", ["startClues", i, "title"])}
              {T("문구", ["startClues", i, "text"], { rows: 3 })}
              {c.textNoSkew != null && T("입문 난이도용 문구", ["startClues", i, "textNoSkew"], { rows: 3, optional: true })}
            </>
          ), c.id)))}
        </>
      );
    }
    if (step.startsWith("loc:")) {
      const li = sc.locations.findIndex((l) => "loc:" + l.id === step);
      const loc = sc.locations[li];
      const ci = (sc.characters ?? []).findIndex((c) => c.id === loc.character);
      const ch = sc.characters?.[ci];
      return (
        <>
          {T("장소 이름", ["locations", li, "name"], { big: true })}
          {T("지도에서 보이는 설명", ["locations", li, "blurb"], { rows: 2 })}
          {loc.unlock && !loc.unlock.start && T("잠겨 있을 때 보이는 문장", ["locations", li, "lockedHint"], { rows: 2, optional: true })}
          {ch && Box(`인물 · ${ch.name}`, (
            <>
              {T("이름", ["characters", ci, "name"])}
              {T("직함", ["characters", ci, "role"])}
              {T("첫 번째 진술", ["characters", ci, "statement1", "text"], { rows: 3 })}
              {T("두 번째 진술(단서를 내밀면 열려요)", ["characters", ci, "statement2", "text"], { rows: 5 })}
              {T("틀린 단서를 내밀었을 때", ["characters", ci, "wrongReply"], { rows: 2 })}
            </>
          ))}
          {(loc.clues ?? []).map((c, j) => Box(`단서 ${c.id} · ${DIFF[c.difficulty] ?? c.difficulty}${c.kind === "image" ? " · 이미지" : ""}`, (
            <>
              {T("제목", ["locations", li, "clues", j, "title"])}
              {T("문구", ["locations", li, "clues", j, "text"], { rows: 3 })}
              {c.textNoSkew != null && T("입문 난이도용 문구", ["locations", li, "clues", j, "textNoSkew"], { rows: 3, optional: true })}
              {c.hotspot && T("영상 속 물건 이름(돋보기 힌트)", ["locations", li, "clues", j, "hotspot", "label"])}
            </>
          ), c.id))}
          {(loc.decoyHotspots ?? []).map((d, j) => Box(`혼란 지점 ${d.id ?? j + 1}`, (
            <>
              {T("이름", ["locations", li, "decoyHotspots", j, "label"])}
              {T("눌렀을 때 나오는 문장", ["locations", li, "decoyHotspots", j, "text"], { rows: 2 })}
            </>
          ), d.id ?? "d" + j))}
        </>
      );
    }
    if (step === "links") {
      return (
        <>
          {T("틀린 조합일 때 나오는 문장", ["linkWrongText"], { rows: 2 })}
          {(sc.links ?? []).map((l, i) => Box(`${l.id} · ${l.clues.join(" + ")}`, T("열리는 추론 문장", ["links", i, "text"], { rows: 3 }), l.id))}
        </>
      );
    }
    if (step === "decisions") {
      return (sc.decisions ?? []).map((d, i) => Box(d.label, (
        <>
          {T("제목 줄", ["decisions", i, "label"])}
          {d.call && T("전화 · 거는 사람", ["decisions", i, "call", "who"])}
          {d.call && T("전화 · 대사", ["decisions", i, "call", "text"], { rows: 3 })}
          {T("상황 설명", ["decisions", i, "situation"], { rows: 3 })}
          {d.situationIfNotVisited != null && T("상황 설명(장소에 안 갔을 때)", ["decisions", i, "situationIfNotVisited"], { rows: 3 })}
          {d.callIfNotVisited && T("전화 대사(장소에 안 갔을 때)", ["decisions", i, "callIfNotVisited", "text"], { rows: 3 })}
          {d.options.map((o, k) => Box(`선택지 ${o.id}`, (
            <>
              {T("선택 문장", ["decisions", i, "options", k, "label"])}
              {o.endingLine != null && T("결말에 붙는 문장", ["decisions", i, "options", k, "endingLine"], { rows: 2 })}
            </>
          ), o.id))}
        </>
      ), d.id));
    }
    if (step === "timeline") {
      return (
        <>
          {T("시간표 안내 문장", ["timeline", "intro"], { rows: 2 })}
          {sc.timeline.cards.map((c, i) => Box(`카드 ${c.id}`, (
            <>
              {T("카드 문장", ["timeline", "cards", i, "text"], { rows: 2 })}
              {T("실제 시각(HH:MM)", ["timeline", "cards", i, "time"])}
              {c.timeAlt != null && T("시계 오차 때의 시각", ["timeline", "cards", i, "timeAlt"])}
              {c.timeNoSkew != null && T("입문 난이도의 시각", ["timeline", "cards", i, "timeNoSkew"])}
            </>
          ), c.id))}
        </>
      );
    }
    if (step === "report") {
      return (
        <>
          {T("보고서 안내 문장", ["report", "intro"], { rows: 2 })}
          {sc.report.questions.map((q, i) => Box(`질문 ${q.id}`, (
            <>
              {T("질문", ["report", "questions", i, "q"], { rows: 2 })}
              {q.options.map((o, k) => T(`선택지 ${o.id}`, ["report", "questions", i, "options", k, "label"], { rows: 2 }))}
            </>
          ), q.id))}
        </>
      );
    }
    if (step === "endings") {
      return sc.endings.map((e, i) => Box(e.title, (
        <>
          {T("결말 제목", ["endings", i, "title"])}
          {T("결말 문장", ["endings", i, "text"], { rows: 5 })}
          {T("얻은 것", ["endings", i, "gain"])}
          {T("잃은 것", ["endings", i, "loss"])}
        </>
      ), e.id));
    }
    if (step === "story") {
      const h = sc.hiddenStory;
      if (!h) return <span style={{ fontSize: 13, color: "var(--text-sub)" }}>이 시나리오에는 숨겨진 이야기가 없어요.</span>;
      return (
        <>
          {T("작은 머리글", ["hiddenStory", "kicker"])}
          {T("제목", ["hiddenStory", "title"], { big: true })}
          {T("도입 문장", ["hiddenStory", "intro"], { rows: 3 })}
          {(h.chapters ?? []).map((c, i) => Box(`장 ${i + 1}`, (
            <>
              {T("머리글", ["hiddenStory", "chapters", i, "kicker"])}
              {T("소제목", ["hiddenStory", "chapters", i, "heading"])}
              {T("본문", ["hiddenStory", "chapters", i, "text"], { rows: 5 })}
            </>
          ), "ch" + i))}
          {T("실제 시간표 제목", ["hiddenStory", "timelineTitle"])}
          {Box("실제 시간표", (h.timeline ?? []).map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 6 }}>
              {T("시각", ["hiddenStory", "timeline", i, "time"])}
              {T("내용", ["hiddenStory", "timeline", i, "text"])}
            </div>
          )))}
          {T("맺음말", ["hiddenStory", "closing"], { rows: 3 })}
          {Box("진실의 겹 이름(내 조사 기록에 보여요)", (sc.layers ?? []).map((l, i) => T(l.id, ["layers", i, "name"])))}
        </>
      );
    }
    if (step === "missed") {
      return (
        <>
          {T("제목", ["missed", "title"])}
          {T("질문", ["missed", "question"], { rows: 2 })}
          {List("토론·성찰 질문(마지막 화면에 보여요)", ["reflectionPrompts"], { rows: 2 })}
        </>
      );
    }
    return null;
  }

  return (
    <div className="fade-in">
      <Link to="/admin/case-games" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 놓친 장면 관리</Link>
      <PageHeader
        eyebrow="ADMIN"
        title={`${sc.meta.title} · 편집`}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link to={`/case/game/${gameId}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "underline" }}>실제 플레이 화면 열기 →</Link>
            <PrimaryButton onClick={save} disabled={!dirty || saving}>{saving ? "저장하는 중…" : dirty ? "변경사항 저장" : "변경 없음"}</PrimaryButton>
          </div>
        }
      />
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
      {status && <div style={{ fontSize: 12.5, color: "var(--text-sub)", marginBottom: 10 }}>{status}</div>}
      <div style={{ fontSize: 12, color: "var(--text-sub)", marginBottom: 12, lineHeight: 1.7 }}>
        플레이어가 보는 순서대로 단계를 눌러 글을 바로 고치고 <strong>변경사항 저장</strong>을 누르세요. 미디어는 "미디어 한눈에 보기"에서 올리면 바로 저장돼요.
      </div>

      <div style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--border)", marginBottom: 14 }}>
        {[["play", "플레이형 편집"], ["media", "미디어 한눈에 보기"], ["spots", "단서 위치 지정"]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{
            background: "none", border: "none", padding: "8px 2px", fontSize: 14, fontWeight: 700, cursor: "pointer",
            color: tab === k ? "var(--accent)" : "var(--text-sub)", borderBottom: `2px solid ${tab === k ? "var(--accent)" : "transparent"}`, marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {tab === "play" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {steps.map((s) => (
              <button key={s.key} type="button" onClick={() => setStep(s.key)} style={{
                height: 34, padding: "0 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                border: `1.5px solid ${step === s.key ? "var(--accent)" : "var(--border)"}`,
                background: step === s.key ? "var(--accent-dim)" : "transparent", color: step === s.key ? "var(--accent)" : "var(--text-sub)",
              }}>{s.label}</button>
            ))}
          </div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>{renderStep()}</Card>
        </>
      )}

      {tab === "media" && <MediaTab gameId={gameId} sc={sc} game={game} setGame={setGame} />}
      {tab === "spots" && <SpotsTab sc={sc} game={game} update={update} />}
    </div>
  );
}

// ---------------------------------------------------------------- 미디어 한눈에 보기
function MediaTab({ gameId, sc, game, setGame }) {
  const list = useMemo(() => mediaList(sc), [sc]);
  const [log, setLog] = useState({});
  const [prev, setPrev] = useState({});
  const urls = game.mediaUrls ?? {};
  const done = list.filter((m) => urls[m.name]).length;

  async function upload(name, file) {
    setLog((l) => ({ ...l, [name]: "올리는 중…" }));
    try {
      const r = storageRef(storage, `case-games/${gameId}/${name}`);
      await uploadBytes(r, file, file.type ? { contentType: file.type } : undefined);
      const url = await getDownloadURL(r);
      await caseGameAdminSetMedia({ gameId, mediaUrls: { [name]: url } });
      setGame((g) => ({ ...g, mediaUrls: { ...g.mediaUrls, [name]: url } }));
      setLog((l) => ({ ...l, [name]: "완료" }));
    } catch (err) {
      setLog((l) => ({ ...l, [name]: `실패: ${err.code || err.message}` }));
    }
  }
  // 여러 파일을 한 번에: 파일명이 시나리오가 쓰는 이름과 같은 것만 자동으로 연결
  async function bulk(files) {
    const names = new Set(list.map((m) => m.name));
    for (const f of files) {
      if (!names.has(f.name)) { setLog((l) => ({ ...l, [f.name]: "시나리오가 쓰지 않는 파일명이라 건너뜀" })); continue; }
      await upload(f.name, f);
    }
  }
  const kind = (n) => (/\.(mp4|webm|mov)$/i.test(n) ? "video" : /\.(mp3|wav|m4a|ogg)$/i.test(n) ? "audio" : "image");

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13 }}><strong>{done}/{list.length}</strong> 연결됨 {done < list.length && <span style={{ color: "var(--text-sub)", fontSize: 12 }}>· 빨간 항목이 아직 없는 파일이에요</span>}</div>
      <div>
        <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginBottom: 4 }}>여러 파일 한꺼번에 올리기 (파일명이 아래 목록의 이름과 같아야 해요)</div>
        <input type="file" multiple accept="video/*,image/*,audio/*" onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; bulk(f); }} style={{ fontSize: 12 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((m) => {
          const url = urls[m.name];
          return (
            <div key={m.name} style={{ border: `1px solid ${url ? "var(--border)" : "var(--danger)"}`, borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontSize: 12.5 }}><strong>{m.label}</strong><span style={{ color: "var(--text-sub)", marginLeft: 8, fontSize: 11.5 }}>{m.name}</span></div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: url ? "var(--text-sub)" : "var(--danger)" }}>{log[m.name] || (url ? "연결됨" : "없음")}</span>
                  {url && <OutlineButton type="button" style={{ height: 28, padding: "0 10px", fontSize: 11.5 }} onClick={() => setPrev((p) => ({ ...p, [m.name]: !p[m.name] }))}>{prev[m.name] ? "닫기" : "미리보기"}</OutlineButton>}
                  <label style={{ fontSize: 11.5, color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>
                    {url ? "교체" : "올리기"}
                    <input type="file" accept="video/*,image/*,audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(m.name, f); }} />
                  </label>
                </div>
              </div>
              {url && prev[m.name] && (kind(m.name) === "video"
                ? <video src={url} controls preload="metadata" style={{ width: "100%", maxWidth: 420, borderRadius: 8, background: "#000" }} />
                : kind(m.name) === "audio" ? <audio src={url} controls />
                  : <img src={url} alt="" style={{ width: "100%", maxWidth: 420, borderRadius: 8 }} />)}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- 단서 위치 지정 (영상 위에서 드래그)
function SpotsTab({ sc, game, update }) {
  const [locId, setLocId] = useState(sc.locations[0]?.id ?? null);
  const [selId, setSelId] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [msg, setMsg] = useState("");
  const [curT, setCurT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drag, setDrag] = useState(null);
  const videoRef = useRef(null);
  const stageRef = useRef(null);

  const loc = sc.locations.find((l) => l.id === locId);
  const locSpots = useMemo(() => readSpots(loc), [loc]);
  const videoName = loc.video;
  const videoSrc = videoName ? (/^https?:\/\//.test(videoName) ? videoName : game.mediaUrls?.[videoName]) : null;
  const sel = locSpots.find((s) => s.id === selId) ?? null;

  function selectLoc(id) {
    if (id === locId) return;
    setLocId(id); setSelId(null); setCurT(0); setPlaying(false); setTestMsg(""); setMsg("");
  }
  const patchSpot = (id, f) => update((n) => {
    const l = n.locations.find((x) => x.id === locId);
    const cur = readSpots(l).find((s) => s.id === id);
    if (!cur) return;
    writeSpot(l, { ...cur, ...(typeof f === "function" ? f(cur) : f) });
  });
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
    const hit = locSpots.find((s) => rectsAt(s, t).some((r) => inRect(r, p.x, p.y)));
    if (testMode) {
      setTestMsg(hit ? (hit.kind === "clue" ? `✔ 단서 발견: ${hit.title || hit.label} (${hit.id})` : `· 혼란 지점: ${hit.label}`) : "그곳에서는 아무것도 찾지 못했다.");
      return;
    }
    if (rect.w < 0.01 || rect.h < 0.01) { if (hit) setSelId(hit.id); return; }
    if (!selId) { setMsg("먼저 오른쪽 목록에서 위치를 정할 단서를 골라 주세요."); return; }
    setMsg("");
    patchSpot(selId, (s) => {
      if (s.kind === "decoy") return rect;
      if (spotMode(s) === "fixed") return rect;
      const at = [...s.at];
      const i = at.findIndex((a) => Math.abs(a.t - t) < 0.5);
      if (i >= 0) at[i] = { ...at[i], ...rect };
      else at.push({ t: round(t, 2), tw: 1.2, ...rect });
      at.sort((a, b) => a.t - b.t);
      return { at, x: null, y: null, w: null, h: null };
    });
  }

  const rectsToShow = testMode ? [] : locSpots.flatMap((s) => rectsAt(s, curT).map((r) => ({ s, r })));
  const dragRect = drag && { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
  const chip = (s) => ({ timed: `시각 ${s.at.length}곳`, fixed: "고정", none: "위치 없음(버튼)" }[spotMode(s)]);

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {sc.locations.map((l) => {
          const n = readSpots(l).filter((s) => s.kind === "clue" && spotMode(s) === "none").length;
          return (
            <button key={l.id} type="button" onClick={() => selectLoc(l.id)} style={{
              height: 34, padding: "0 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${l.id === locId ? "var(--accent)" : "var(--border)"}`,
              background: l.id === locId ? "var(--accent-dim)" : "transparent", color: l.id === locId ? "var(--accent)" : "var(--text-sub)",
            }}>{l.name}{n > 0 ? ` · 미지정 ${n}` : ""}</button>
          );
        })}
        <OutlineButton type="button" style={{ height: 34, fontSize: 12.5, marginLeft: "auto" }} onClick={() => { setTestMode((v) => !v); setTestMsg(""); }}>{testMode ? "편집으로 돌아가기" : "플레이처럼 눌러보기"}</OutlineButton>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginBottom: 10 }}>여기서 바꾼 위치도 위쪽 <strong>변경사항 저장</strong>을 눌러야 저장돼요.</div>
      {msg && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ gridColumn: "span 2", minWidth: 0 }}>
          <Card style={{ padding: 12 }}>
            {!videoSrc ? (
              <div style={{ fontSize: 13, color: "var(--text-sub)", lineHeight: 1.8, padding: 12 }}>
                이 장소의 영상({videoName || "지정 안 됨"})이 아직 업로드되지 않았어요. "미디어 한눈에 보기"에서 올린 뒤 다시 열어 주세요.
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
                  <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ position: "absolute", inset: 0, cursor: "crosshair" }} />
                  {rectsToShow.map(({ s, r }, i) => (
                    <div key={s.id + i} style={{
                      position: "absolute", left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${(r.w ?? 0.12) * 100}%`, height: `${(r.h ?? 0.12) * 100}%`,
                      border: `2px ${s.id === selId ? "solid" : "dashed"} ${s.id === selId ? "#ffd54a" : s.kind === "decoy" ? "#ff9f6b" : "#7fd1ff"}`,
                      background: s.id === selId ? "rgba(255,213,74,.18)" : "rgba(127,209,255,.08)", pointerEvents: "none", boxSizing: "border-box",
                    }}>
                      <span style={{ position: "absolute", top: -17, left: 0, fontSize: 10, color: "#fff", background: "rgba(0,0,0,.6)", padding: "0 4px", whiteSpace: "nowrap" }}>{s.id}</span>
                    </div>
                  ))}
                  {dragRect && <div style={{ position: "absolute", left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.w * 100}%`, height: `${dragRect.h * 100}%`, border: "2px solid #ffd54a", background: "rgba(255,213,74,.25)", pointerEvents: "none" }} />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <OutlineButton style={{ height: 30, padding: "0 12px" }} onClick={() => (playing ? videoRef.current?.pause() : videoRef.current?.play())}>{playing ? "❚❚" : "▶"}</OutlineButton>
                  {[["−1초", -1], ["−0.1", -0.1], ["+0.1", 0.1], ["+1초", 1]].map(([l, dt]) => (
                    <OutlineButton key={l} style={{ height: 30, padding: "0 8px", fontSize: 12 }} onClick={() => seek(curT + dt)}>{l}</OutlineButton>
                  ))}
                  <input type="range" min={0} max={dur || 0} step={0.05} value={Math.min(curT, dur || 0)} onChange={(e) => seek(Number(e.target.value))} style={{ flex: 1, minWidth: 120 }} />
                  <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text-sub)" }}>{fmt(curT)} / {fmt(dur || 0)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginTop: 8, lineHeight: 1.7 }}>
                  {testMode
                    ? "플레이처럼 눌러보기: 영상을 재생하거나 멈추고 화면을 눌러 보세요. 점선은 보이지 않고, 실제 플레이어처럼 찾은 결과만 알려 줘요."
                    : "① 오른쪽에서 단서를 고르고 ② 단서가 화면에 나타나는 순간에 영상을 멈춘 뒤 ③ 그 물건 위를 드래그해 상자를 그리세요. 같은 시점에 다시 그리면 위치만 바뀌고, 다른 시점에 그리면 그 시각이 추가돼요."}
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
              {locSpots.map((s) => {
                const mode = spotMode(s);
                return (
                  <div key={s.id} onClick={() => setSelId(s.id)} style={{
                    padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12.5,
                    border: `1.5px solid ${s.id === selId ? "var(--accent)" : "var(--border)"}`, background: s.id === selId ? "var(--accent-dim)" : "transparent",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <strong>{s.kind === "clue" ? s.title || s.label : `(혼란) ${s.label}`}</strong>
                      <span style={{ fontSize: 11, color: mode === "none" ? "var(--danger)" : "var(--text-sub)", whiteSpace: "nowrap" }}>{chip(s)}{rectsAt(s, curT).length ? " · 지금 보임" : ""}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-sub)" }}>{s.id}{s.difficulty ? ` · ${DIFF[s.difficulty] ?? s.difficulty}` : ""}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {sel && (
            <Card style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 12.5 }}>{sel.id} 위치</strong>
              {sel.kind === "clue" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[["timed", "영상 시각마다"], ["fixed", "항상 같은 자리"], ["none", "위치 없음(버튼)"]].map(([m, label]) => (
                    <OutlineButton key={m} style={{ height: 28, padding: "0 10px", fontSize: 11.5, ...(spotMode(sel) === m ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }}
                      onClick={() => {
                        if (m === "none") patchSpot(sel.id, { at: [], x: null, y: null, w: null, h: null });
                        else if (m === "fixed") patchSpot(sel.id, (s) => (s.at[0] ? { at: [], x: s.at[0].x, y: s.at[0].y, w: s.at[0].w, h: s.at[0].h } : { at: [], x: 0.4, y: 0.4, w: 0.15, h: 0.15 }));
                        else patchSpot(sel.id, (s) => ({ x: null, y: null, w: null, h: null, at: s.at.length ? s.at : s.x != null ? [{ t: round(curT, 2), tw: 1.2, x: s.x, y: s.y, w: s.w, h: s.h }] : [] }));
                      }}>{label}</OutlineButton>
                  ))}
                </div>
              )}
              {spotMode(sel) === "fixed" && <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>영상 위를 드래그해서 자리를 바꿀 수 있어요.</div>}
              {spotMode(sel) === "none" && <div style={{ fontSize: 11.5, color: "var(--text-sub)", lineHeight: 1.6 }}>영상에서 위치를 고르지 않으면 플레이어에게는 "찾아볼 곳" 버튼으로 나타나요.</div>}
              {isTimed(sel) && sel.at.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                  <button type="button" onClick={() => seek(a.t)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>{fmt(a.t)}로 이동</button>
                  <span>±</span>
                  <input type="number" min={0.2} max={10} step={0.1} value={a.tw ?? DEFAULT_TW}
                    onChange={(e) => patchSpot(sel.id, (s) => ({ at: s.at.map((x, j) => (j === i ? { ...x, tw: Number(e.target.value) || DEFAULT_TW } : x)) }))}
                    style={{ ...inputStyle, width: 64, padding: "6px 8px" }} />
                  <span>초 동안 보임</span>
                  <button type="button" onClick={() => patchSpot(sel.id, (s) => ({ at: s.at.filter((_, j) => j !== i) }))} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 11.5 }}>삭제</button>
                </div>
              ))}
              {sel.kind === "decoy" && (sel.x != null
                ? <OutlineButton style={{ height: 28, fontSize: 11.5 }} onClick={() => patchSpot(sel.id, { x: null, y: null, w: null, h: null })}>위치 지우기</OutlineButton>
                : <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>영상 위를 드래그해서 위치를 정하세요.</div>)}
              <div style={{ fontSize: 11, color: "var(--text-sub)" }}>제목·문구는 "플레이형 편집" 탭의 해당 장소 단계에서 고쳐요.</div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
