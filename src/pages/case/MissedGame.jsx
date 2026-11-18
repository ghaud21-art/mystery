import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { missedGetPublic, missedPlay } from "../../lib/caseApi.js";
import { Card, OutlineButton, PrimaryButton } from "../../components/ui.jsx";

// 「놓친 장면」 플레이 화면. 정답·단서 위치·결말은 전부 서버(missedPlay)가 단계별로만 내려주고,
// 이 화면은 서버가 준 view를 그리고 플레이어의 행동(action)만 보낸다.

const mono = { fontFamily: "ui-monospace, monospace" };
const Kicker = ({ children, color }) => (
  <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 700, color: color || "var(--case-accent)", textTransform: "uppercase" }}>{children}</div>
);
const Dim = ({ children, style }) => <p style={{ fontSize: 12, color: "var(--text-sub)", lineHeight: 1.7, margin: "6px 0 0", ...style }}>{children}</p>;
const Body = ({ children, style }) => <p style={{ fontSize: 14, lineHeight: 1.85, margin: "8px 0 0", whiteSpace: "pre-line", ...style }}>{children}</p>;

function Media({ kind = "video", src, poster }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src) return null;
  if (failed) return <p style={{ fontSize: 12, color: "var(--text-sub)", margin: "8px 0 0" }}>영상을 불러오지 못했어요. (파일 형식이 브라우저에서 재생되지 않거나 연결이 끊겼을 수 있어요)</p>;
  const box = { width: "100%", borderRadius: 10, border: "1px solid var(--border)", display: "block", marginTop: 8 };
  if (kind === "audio") return <audio controls preload="metadata" src={src} onError={() => setFailed(true)} style={{ width: "100%", marginTop: 8 }} />;
  if (kind === "image") return <img src={src} alt="" onError={() => setFailed(true)} style={box} />;
  return <video controls playsInline preload="metadata" src={src} poster={poster || undefined} onError={() => setFailed(true)} style={{ ...box, background: "#000" }} />;
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 12px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)", width: "min(760px, 100%)", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <strong style={{ fontSize: 15 }}>{title}</strong>
          <OutlineButton style={{ height: 30, padding: "0 12px", fontSize: 12 }} onClick={onClose}>닫기</OutlineButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function ClueCard({ clue, compact, selected, onClick }) {
  if (!clue) return null;
  return (
    <div
      onClick={onClick}
      style={{
        padding: 12, borderRadius: 10, cursor: onClick ? "pointer" : undefined,
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: selected ? "var(--accent-dim)" : "var(--bg-sub)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{clue.title}</strong>
        <span style={{ fontSize: 10.5, color: "var(--text-sub)" }}>{clue.start ? "시작 자료" : clue.locationName}</span>
      </div>
      {!compact && clue.image && <Media kind="image" src={clue.image} />}
      {clue.text && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.65, whiteSpace: "pre-line" }}>
          {clue.kind === "card" ? clue.text.split(" / ").join("\n") : clue.text}
        </p>
      )}
    </div>
  );
}

function Radio({ on, onClick, children }) {
  return (
    <label onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, cursor: "pointer", fontSize: 13.5,
      border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent-dim)" : "var(--bg)",
    }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", flex: "none" }} />
      <span>{children}</span>
    </label>
  );
}

function PhoneCall({ call }) {
  if (!call) return null;
  return (
    <div style={{ padding: 12, borderRadius: 10, border: "1.5px solid #5e91e0", background: "color-mix(in srgb, #5e91e0 10%, transparent)" }}>
      <Kicker color="#5e91e0">📞 {call.who}</Kicker>
      <Media kind="image" src={call.image} />
      <Media kind="audio" src={call.audio} />
      <Body style={{ margin: "6px 0 0" }}>&ldquo;{call.text}&rdquo;</Body>
    </div>
  );
}

// ---------------------------------------------------------------- 시작

function StartScreen({ pub, onStart, busy }) {
  const [level, setLevel] = useState(pub.defaultLevel);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(!pub.notice);
  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: "0 auto" }}>
      <Link to="/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 사건 목록</Link>
      <Card style={{ marginTop: 12, borderTop: "3px solid var(--case-accent)" }}>
        <Kicker>{pub.series}</Kicker>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "4px 0 8px" }}>{pub.title}</h1>
        <p style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{pub.subtitle}</p>
      </Card>
      {pub.notice && (
        <Card style={{ marginTop: 12, borderColor: "var(--danger)" }}>
          <strong style={{ fontSize: 13 }}>⚠ 내용 안내</strong>
          <Dim style={{ whiteSpace: "pre-line", marginTop: 6 }}>{pub.notice}</Dim>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 13 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            위 내용을 확인했고, 계속 진행할게요.
          </label>
        </Card>
      )}
      <Card style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <strong style={{ fontSize: 13 }}>난이도</strong>
        {pub.levels.map((lv) => (
          <Radio key={lv.key} on={level === lv.key} onClick={() => setLevel(lv.key)}>
            <strong>{lv.label}</strong> <span style={{ color: "var(--text-sub)" }}>· {lv.minutes}</span>
            <br /><span style={{ fontSize: 12, color: "var(--text-sub)" }}>{lv.desc}</span>
          </Radio>
        ))}
        <input placeholder="닉네임 (선택)" value={name} maxLength={20} onChange={(e) => setName(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
        <PrimaryButton disabled={!agreed || busy} onClick={() => onStart(level, name.trim())}>{busy ? "시작하는 중…" : "조사관으로 출발한다 →"}</PrimaryButton>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- 장소

const rectActive = (r, t) => (r.t != null ? t != null && Math.abs(t - r.t) <= (r.tw ?? 1.5) : true);

function LocationView({ view, act, busy, setFeedback, feedback }) {
  const L = view.data.location;
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [curT, setCurT] = useState(0);
  const [sel, setSel] = useState([]);
  const placedMode = L.hasPlaced && !!L.video;

  const onOverlay = async (e) => {
    videoRef.current?.pause();
    if (L.left <= 0) return setFeedback({ message: "이 장소에서는 더 지목할 수 없다." });
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const t = videoRef.current ? videoRef.current.currentTime : null;
    const extra = await act("inspect", { locId: L.id, fx, fy, t });
    setFeedback(extra);
  };
  const dot = (r, extra) => ({
    position: "absolute", left: `${(r.x + (r.w ?? 0.12) / 2) * 100}%`, top: `${(r.y + (r.h ?? 0.12) / 2) * 100}%`,
    transform: "translate(-50%,-50%)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", ...extra,
  });
  const P = L.person;
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]));

  return (
    <>
      <Card>
        <Kicker>{L.order}. {L.name}</Kicker>
        {placedMode && (
          <Dim>영상을 보다가 수상한 것이 보이면 <strong>그 자리를 바로 클릭</strong>하세요. 영상이 멈추며 그 순간을 조사합니다. 단서는 화면에 보이는 순간에만 찾을 수 있고, 빗나가도 지목 1번이 쓰입니다.</Dim>
        )}
        <div style={{ position: "relative", marginTop: 8 }}>
          {L.video ? (
            <video ref={videoRef} playsInline preload="metadata" src={L.video} controls={!placedMode}
              onTimeUpdate={(e) => setCurT(e.currentTarget.currentTime)} onSeeked={(e) => setCurT(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
              onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
              style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)", display: "block", background: "#000" }} />
          ) : L.poster ? <Media kind="image" src={L.poster} />
            : <div style={{ padding: 30, textAlign: "center", color: "var(--text-sub)", border: "1px dashed var(--border)", borderRadius: 10 }}>(장소 영상 준비 중)</div>}
          {(() => {
            // 돋보기는 한 번에 하나만: 지금 시각과 가장 가까운 후보 하나
            const cands = L.hintRects.flatMap((h) => h.rects.filter((r) => rectActive(r, curT)).map((r, i) => ({ k: `${h.key}_${i}`, r })));
            cands.sort((a, b) => Math.abs(curT - (a.r.t ?? curT)) - Math.abs(curT - (b.r.t ?? curT)));
            const c = cands[0];
            return c ? <span key={c.k} style={dot(c.r, { width: 30, height: 30, border: "2px solid var(--accent)", background: "rgba(20,16,8,.5)", color: "var(--accent)", fontSize: 15 })}>?</span> : null;
          })()}
          {(() => {
            // 찾은 표시(✓)도 한 번에 하나만: 지금 시각과 가장 가까운 것
            const cands = L.foundRects.flatMap((f) => f.rects.filter((r) => rectActive(r, curT)).map((r, i) => ({ k: `${f.id}_${i}`, r })));
            cands.sort((x, y) => Math.abs(curT - (x.r.t ?? curT)) - Math.abs(curT - (y.r.t ?? curT)));
            const c = cands[0];
            return c ? <span key={c.k} style={dot(c.r, { width: 24, height: 24, background: "var(--accent)", color: "var(--bg)", fontSize: 13 })}>✓</span> : null;
          })()}
          {placedMode && (
            <div onClick={busy ? undefined : onOverlay} style={{ position: "absolute", inset: 0, cursor: L.left > 0 ? "crosshair" : "default", borderRadius: 10 }} />
          )}
          {placedMode && !playing && curT < 0.05 && (
            <button onClick={() => videoRef.current?.play()} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", fontSize: 15, padding: "10px 18px", background: "rgba(20,16,8,.78)", color: "#fff", border: "none", borderRadius: 10 }}>▶ 영상 재생</button>
          )}
        </div>
        {placedMode && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <OutlineButton style={{ height: 30, padding: "0 12px", minWidth: 44 }} onClick={() => (playing ? videoRef.current?.pause() : videoRef.current?.play())}>{playing ? "❚❚" : "▶"}</OutlineButton>
            <OutlineButton style={{ height: 30, padding: "0 10px", fontSize: 12 }} onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 2); }}>↺ 2초</OutlineButton>
            <input type="range" min="0" max={dur || 0} step="0.1" value={curT} style={{ flex: 1 }}
              onChange={(e) => { if (videoRef.current) { videoRef.current.currentTime = Number(e.target.value); setCurT(Number(e.target.value)); } }} />
            <span style={{ fontSize: 12, color: "var(--text-sub)", ...mono }}>{curT.toFixed(1)} / {dur.toFixed(1)}초</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>지목 {L.left}/{L.limit}</strong>
          <span style={{ fontSize: 12, color: "var(--text-sub)" }}>찾은 단서 {L.found.length}/{L.clueTotal}</span>
        </div>
        {L.unplaced.length > 0 && L.left > 0 && (
          <div style={{ marginTop: 8 }}>
            <Dim style={{ margin: 0 }}>살펴볼 곳을 고르세요.</Dim>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {L.unplaced.map((u) => (
                <OutlineButton key={u.key} disabled={busy} style={{ height: 32, padding: "0 12px", fontSize: 12 }}
                  onClick={async () => setFeedback(await act("inspect", { locId: L.id, key: u.key }))}>{u.label}</OutlineButton>
              ))}
            </div>
          </div>
        )}
        {feedback?.message && <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--bg-sub)", fontSize: 13 }}>{feedback.message}</div>}
        {feedback?.justFound && (
          <div style={{ marginTop: 10 }}>
            <Kicker>단서를 찾았다!</Kicker>
            <div style={{ marginTop: 6 }}><ClueCard clue={L.found.find((c) => c.id === feedback.justFound)} /></div>
          </div>
        )}
        {L.found.filter((c) => c.id !== feedback?.justFound).length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <Dim style={{ margin: 0 }}>이 장소에서 찾은 단서</Dim>
            {L.found.filter((c) => c.id !== feedback?.justFound).map((c) => <ClueCard key={c.id} clue={c} compact />)}
          </div>
        )}
      </Card>

      {P ? (
        <Card>
          <Kicker>인물</Kicker>
          <strong style={{ fontSize: 15 }}>{P.name} <span style={{ fontWeight: 400, fontSize: 13, color: "var(--text-sub)" }}>({P.age}) · {P.role}</span></strong>
          <div style={{ marginTop: 8 }}>
            <Dim style={{ margin: 0 }}>첫 번째 진술</Dim>
            <Media src={P.statement1.video} />
            <Body style={{ fontSize: 13.5, margin: "6px 0 0" }}>&ldquo;{P.statement1.text}&rdquo;</Body>
          </div>
          {P.flipped ? (
            <div style={{ marginTop: 12 }}>
              <Kicker>두 번째 진술</Kicker>
              <Media src={P.statement2.video} />
              <Body style={{ fontSize: 13.5, margin: "6px 0 0" }}>&ldquo;{P.statement2.text}&rdquo;</Body>
              {P.noEvidence && <Dim>이름을 빼 주기로 약속하고 들은 진술이라, 보고서의 증거로는 쓸 수 없다.</Dim>}
            </div>
          ) : P.locked ? (
            <Dim style={{ fontSize: 13 }}>{P.name}은(는) 더 이상 말하지 않는다.</Dim>
          ) : (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13 }}>진술의 모순을 짚을 단서를 내밀어 보자. (한 번에 두 장까지{P.wrongLeft != null ? `, 틀린 단서를 내밀 수 있는 횟수 ${P.wrongLeft}번` : ""})</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
                {view.data.present.clueChoices.map((c) => (
                  <ClueCard key={c.id} clue={{ ...c, text: "" }} compact selected={sel.includes(c.id)} onClick={() => toggle(c.id)} />
                ))}
              </div>
              <PrimaryButton style={{ alignSelf: "flex-start" }} disabled={!sel.length || busy}
                onClick={async () => { const ex = await act("present", { charId: P.id, clueIds: sel }); setSel([]); setFeedback(ex?.reply ? { reply: `${P.name}: “${ex.reply}”` } : null); }}>
                단서 {sel.length}장 내밀기
              </PrimaryButton>
              {feedback?.reply && <div style={{ padding: 10, borderRadius: 8, background: "var(--bg-sub)", fontSize: 13 }}>{feedback.reply}</div>}
            </div>
          )}
        </Card>
      ) : (
        <Card><Dim style={{ fontSize: 13, margin: 0 }}>이곳에는 만날 사람이 없다.</Dim></Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- 수첩

function Notebook({ view, act, busy, onClose }) {
  const nb = view.notebook;
  const [tab, setTab] = useState("clues");
  const [sel, setSel] = useState([]);
  const [msg, setMsg] = useState(null);
  const tabs = [["clues", `단서 ${nb.clues.length}`], ["people", "인물"], ["links", `단서 잇기 ${nb.links.length}`], ["videos", "지난 영상"]];
  const tryLink = async () => {
    const ex = await act("link", { a: sel[0], b: sel[1] });
    setMsg(ex?.message ?? null);
    setSel([]);
  };
  return (
    <Modal title="조사 수첩" onClose={onClose}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "6px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
            border: `1.5px solid ${tab === k ? "var(--accent)" : "var(--border)"}`, background: tab === k ? "var(--accent-dim)" : "transparent", color: tab === k ? "var(--accent)" : "var(--text-sub)",
          }}>{l}</button>
        ))}
      </div>
      {tab === "clues" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{nb.clues.map((c) => <ClueCard key={c.id} clue={c} />)}</div>}
      {tab === "people" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nb.people.map((p) => (
            <div key={p.id} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
              <strong>{p.name}</strong> <span style={{ fontSize: 12, color: "var(--text-sub)" }}>· {p.role}{p.locationName ? ` · ${p.locationName}` : ""}</span>
              <p style={{ fontSize: 13, margin: "6px 0 0" }}>① &ldquo;{p.statement1.text}&rdquo;</p>
              {p.flipped ? <p style={{ fontSize: 13, margin: "6px 0 0", color: "var(--accent)" }}>② &ldquo;{p.statement2.text}&rdquo;</p>
                : <Dim>{p.locked ? "더 이상 말하지 않는다." : "두 번째 진술은 아직 열리지 않았다. 그 장소로 다시 찾아가 단서를 내밀 수 있다."}</Dim>}
            </div>
          ))}
          {!nb.people.length && <Dim>아직 만난 사람이 없다.</Dim>}
        </div>
      )}
      {tab === "links" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 13 }}>서로 다른 단서 두 장을 골라 이어 보자. 맞으면 새로운 추론이 열린다.{nb.linkLeft != null && ` (남은 시도 ${nb.linkLeft})`}</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
            {nb.clues.map((c) => (
              <ClueCard key={c.id} clue={{ ...c, text: "" }} compact selected={sel.includes(c.id)}
                onClick={() => setSel((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : s.length >= 2 ? [s[1], c.id] : [...s, c.id]))} />
            ))}
          </div>
          <PrimaryButton style={{ alignSelf: "flex-start" }} disabled={sel.length !== 2 || busy || nb.linkLeft === 0} onClick={tryLink}>두 단서 잇기</PrimaryButton>
          {msg && <div style={{ padding: 10, borderRadius: 8, background: "var(--bg-sub)", fontSize: 13 }}>{msg}</div>}
          <strong style={{ fontSize: 13 }}>열린 추론 {nb.links.length}/{nb.linkTotal}</strong>
          {nb.links.map((l) => (
            <div key={l.id} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)" }}>
              <Dim style={{ margin: 0 }}>{l.titles.join(" + ")}</Dim>
              <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>{l.text}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "videos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {nb.videos.map((v, i) => <div key={i}><strong style={{ fontSize: 13 }}>{v.title}</strong><Media src={v.src} /></div>)}
          {!nb.videos.length && <Dim>다시 볼 영상이 아직 없다.</Dim>}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- 단계별 화면

function Brief({ view, act, busy }) {
  const { briefing, startClues, rules } = view.data;
  return (
    <>
      <Card style={{ borderTop: "3px solid var(--case-accent)" }}>
        <Kicker>{briefing.kicker}</Kicker>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 6px" }}>{briefing.title}</h1>
        <Media src={briefing.video} />
        {briefing.lines.map((l, i) => <Body key={i}>{l}</Body>)}
      </Card>
      <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>처음 받은 자료</strong>
        {startClues.map((c) => <ClueCard key={c.id} clue={c} />)}
        <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-sub)", fontSize: 12.5, lineHeight: 1.8 }}>
          <strong>조사 규칙</strong>
          {rules.map((r, i) => <div key={i}>· {r}</div>)}
        </div>
        <PrimaryButton disabled={busy} onClick={() => act("begin")}>1일 차 조사를 시작한다 →</PrimaryButton>
      </Card>
    </>
  );
}

function MapView({ view, act, busy }) {
  const D = view.data;
  return (
    <>
      <Card>
        <Kicker>{view.day}일 차</Kicker>
        <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.7 }}>
          {D.dayDone ? "오늘 조사할 수 있는 곳은 다 다녀왔다." : `오늘은 ${view.visitsLeftToday}곳을 더 조사할 수 있다. 어디로 갈까?`} 이미 다녀온 곳은 방문 횟수를 쓰지 않고 다시 찾아가 인물을 만날 수 있다.
        </p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {D.locations.map((l) => (
          <Card key={l.id} style={{ opacity: l.open || l.visited ? 1 : 0.5, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <strong>{l.order}. {l.name}</strong>
              <span style={{ fontSize: 10.5, color: "var(--text-sub)", whiteSpace: "nowrap" }}>{l.visited ? "조사함" : !l.open ? "잠김" : ""}</span>
            </div>
            <Dim>{l.text}</Dim>
            {l.visited ? (
              <OutlineButton style={{ height: 32, fontSize: 12, marginTop: 8 }} disabled={busy} onClick={() => act("visit", { locId: l.id })}>다시 찾아가기 (찾은 단서 {l.foundCount})</OutlineButton>
            ) : (
              <PrimaryButton style={{ height: 32, fontSize: 12, marginTop: 8 }} disabled={!l.canVisit || busy} onClick={() => act("visit", { locId: l.id })}>조사하러 간다</PrimaryButton>
            )}
          </Card>
        ))}
      </div>
      {D.dayDone && <PrimaryButton disabled={busy} onClick={() => act("endday")}>{D.endDayLabel}</PrimaryButton>}
    </>
  );
}

function DecisionBlock({ d, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Kicker>{d.label}</Kicker>
      <PhoneCall call={d.call} />
      <p style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{d.situation}</p>
      {d.options.map((o) => <Radio key={o.id} on={value === o.id} onClick={() => onChange(o.id)}>{o.label}</Radio>)}
    </div>
  );
}

function DecisionView({ view, act, busy, setHeard }) {
  const d = view.data.decision;
  const [opt, setOpt] = useState(null);
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <DecisionBlock d={d} value={opt} onChange={setOpt} />
      <PrimaryButton disabled={!opt || busy} onClick={async () => { const ex = await act("decide", { optionId: opt }); if (ex?.heard) setHeard(ex.heard); }}>결정한다</PrimaryButton>
    </Card>
  );
}

function TimelineView({ view, act, busy }) {
  const T = view.data.timeline;
  const [order, setOrder] = useState(() => T.cards.map((c) => c.id));
  const byId = Object.fromEntries(T.cards.map((c) => [c.id, c]));
  const move = (i, d) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Kicker>{view.day}일 차 · 시간표 맞추기</Kicker>
      <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>{T.intro}</p>
      {order.map((id, i) => (
        <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
          <span style={{ ...mono, width: 52, color: byId[id].time ? "var(--accent)" : "var(--text-sub)" }}>{byId[id].time ?? "--:--"}</span>
          <span style={{ flex: 1, fontSize: 13.5 }}>{byId[id].text}</span>
          <OutlineButton style={{ height: 28, padding: "0 8px" }} disabled={i === 0} onClick={() => move(i, -1)}>▲</OutlineButton>
          <OutlineButton style={{ height: 28, padding: "0 8px" }} disabled={i === order.length - 1} onClick={() => move(i, 1)}>▼</OutlineButton>
        </div>
      ))}
      <PrimaryButton disabled={busy} onClick={() => act("timeline", { order })}>이 순서로 확정하고 보고서를 쓴다 →</PrimaryButton>
    </Card>
  );
}

function ReportView({ view, act, busy }) {
  const R = view.data.report;
  const [ans, setAns] = useState({});
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Kicker>최종 보고서</Kicker>
      {R.intro && <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>{R.intro}</p>}
      {R.questions.map((q) => (
        <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <strong style={{ fontSize: 14 }}>{q.q}</strong>
          {q.options.map((o) => <Radio key={o.id} on={ans[q.id] === o.id} onClick={() => setAns((a) => ({ ...a, [q.id]: o.id }))}>{o.label}</Radio>)}
        </div>
      ))}
      <Dim style={{ margin: 0 }}>제출하면 답을 고칠 수 없고, 이어서 보고서에 붙일 결정이 나올 수 있어요.</Dim>
      <PrimaryButton disabled={!R.questions.every((q) => ans[q.id]) || busy} onClick={() => act("report", ans)}>답을 확정한다</PrimaryButton>
    </Card>
  );
}

function Report2View({ view, act, busy }) {
  const ds = view.data.reportDecisions;
  const [dec, setDec] = useState({});
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ds.map((d) => <DecisionBlock key={d.id} d={d} value={dec[d.id]} onChange={(v) => setDec((x) => ({ ...x, [d.id]: v }))} />)}
      <PrimaryButton disabled={!ds.every((d) => dec[d.id]) || busy} onClick={() => act("report2", { decisions: dec })}>보고서를 제출한다</PrimaryButton>
    </Card>
  );
}

function EndingView({ view, act, busy }) {
  const e = view.data.ending;
  return (
    <>
      <Card style={{ borderTop: "3px solid var(--case-accent)" }}>
        <Kicker>결말</Kicker>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "4px 0 10px" }}>{e.title}</h1>
        <Media src={e.video} />
        <Body style={{ fontSize: 14.5 }}>{e.text}</Body>
        {e.extraLine && <Body style={{ fontSize: 14.5 }}>{e.extraLine}</Body>}
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, padding: 12, borderRadius: 10, background: "var(--bg-sub)" }}><Kicker>얻은 것</Kicker><p style={{ margin: "4px 0 0", fontSize: 13 }}>{e.gain}</p></div>
          <div style={{ flex: 1, minWidth: 200, padding: 12, borderRadius: 10, background: "var(--bg-sub)" }}><Kicker>잃은 것</Kicker><p style={{ margin: "4px 0 0", fontSize: 13 }}>{e.loss}</p></div>
        </div>
        <Dim>어느 결말도 &lsquo;정답&rsquo;은 아닙니다.</Dim>
      </Card>
      <PrimaryButton disabled={busy} onClick={() => act("next")}>놓친 장면 보기 →</PrimaryButton>
    </>
  );
}

function MissedView({ view, act, busy }) {
  const M = view.data.missed;
  const stats = M.stats;
  return (
    <>
      <Card style={{ borderTop: "3px solid var(--case-accent)" }}>
        <Kicker>놓친 장면</Kicker>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 10px" }}>{M.title}</h2>
        <strong style={{ fontSize: 13 }}>가지 않은 장소</strong>
        <p style={{ fontSize: 13.5, margin: "4px 0 12px" }}>{M.unvisited.join(", ") || "없음"}</p>
        <strong style={{ fontSize: 13 }}>찾지 못한 단서 {M.missedClues.length}개</strong>
        <div style={{ marginTop: 6 }}>{M.missedClues.map((c, i) => <div key={i} style={{ fontSize: 13 }}>· {c.title} <span style={{ color: "var(--text-sub)" }}>({c.locationName})</span></div>)}</div>
        <p style={{ fontSize: 15, fontWeight: 700, margin: "16px 0 0" }}>{M.question}</p>
      </Card>
      {stats.total > 0 && (
        <Card>
          <strong style={{ fontSize: 13 }}>다른 조사관들은 어디를 갔을까</strong>
          <Dim>끝까지 플레이한 {stats.total}명 중 각 장소를 조사한 비율이에요. 사람마다 본 조각이 달라요.</Dim>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {Object.entries(stats.locations).map(([id, l]) => (
              <div key={id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                <span style={{ width: 110, flex: "none" }}>{l.name}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--bg-sub)" }}><div style={{ width: `${l.percent}%`, height: "100%", borderRadius: 4, background: "var(--accent)" }} /></div>
                <span style={{ width: 36, textAlign: "right", color: "var(--text-sub)" }}>{l.percent}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <PrimaryButton disabled={busy} onClick={() => act("next")}>{M.hasStory ? "숨겨진 이야기 →" : "나의 조사 기록 →"}</PrimaryButton>
    </>
  );
}

function StoryView({ view, act, busy }) {
  const S = view.data.story;
  return (
    <>
      <Card style={{ borderTop: "3px solid var(--case-accent)" }}>
        <Kicker>{S.kicker}</Kicker>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "4px 0 10px" }}>{S.title}</h1>
        <Media src={S.video} />
        {S.intro && <Body>{S.intro}</Body>}
      </Card>
      {S.chapters.map((c, i) => (
        <Card key={i} style={{ borderLeft: `3px solid ${c.reached === false ? "var(--border)" : "var(--accent)"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Kicker>{c.kicker}</Kicker>
            {c.reached != null && <span style={{ fontSize: 11, fontWeight: 700, color: c.reached ? "var(--accent)" : "var(--text-sub)" }}>{c.reached ? "당신이 도달한 진실" : "당신이 놓친 진실"}</span>}
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 800, margin: "2px 0 8px" }}>{c.heading}</h3>
          <Body style={{ margin: 0 }}>{c.text}</Body>
        </Card>
      ))}
      {S.timeline.length > 0 && (
        <Card>
          <Kicker>{S.timelineTitle}</Kicker>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {S.timeline.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ ...mono, color: "var(--accent)", minWidth: 48 }}>{t.time}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>{t.text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {S.closing && <Card><Body style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{S.closing}</Body></Card>}
      <PrimaryButton disabled={busy} onClick={() => act("next")}>나의 조사 기록 →</PrimaryButton>
    </>
  );
}

function EndedView({ view, act, busy, navigate }) {
  const S = view.data.summary;
  const [answers, setAnswers] = useState({});
  const row = (k, v) => (
    <tr><th style={{ textAlign: "left", verticalAlign: "top", padding: "6px 10px 6px 0", fontSize: 12, color: "var(--text-sub)", whiteSpace: "nowrap" }}>{k}</th><td style={{ padding: "6px 0", fontSize: 13 }}>{v}</td></tr>
  );
  return (
    <>
      <Card>
        <Kicker>나의 조사 기록</Kicker>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "4px 0" }}>{view.meta.title}</h2>
        <Dim style={{ margin: "0 0 10px" }}>{S.playerName ? `${S.playerName} · ` : ""}{S.levelLabel} · 결말: {S.endingTitle}</Dim>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {row("방문한 장소", S.visited.join(", "))}
            {row("찾은 단서", `${S.foundCount}개 · 열린 추론 ${S.linksOpened}/${S.linksTotal}`)}
            {row("도달한 겹", S.layers.join(" → "))}
            {row("보고서", `누가: ${S.report.who} · 언제: ${S.report.when} · 왜: ${S.report.why}`)}
            {row("결정", S.decisions.join(" / "))}
            {row("시간표", `${S.timelineScore}/${S.timelineTotal} 맞음`)}
          </tbody>
        </table>
      </Card>
      {S.reflectionPrompts.length > 0 && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Kicker>생각해 볼 것</Kicker>
          {S.reflectionPrompts.map((q, i) => (
            <div key={i}>
              <label style={{ fontSize: 12.5, color: "var(--text-sub)" }}>{q}</label>
              <textarea rows={2} value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
            </div>
          ))}
          <Dim style={{ margin: 0 }}>이 답은 기기에만 보이고 저장되지 않아요. 모임 사람들과 이야기해 보세요.</Dim>
        </Card>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <OutlineButton disabled={busy} onClick={() => { if (window.confirm("처음부터 다시 플레이할까요? 지금까지의 조사 기록은 지워져요.")) act("restart"); }}>다시 플레이하기</OutlineButton>
        <OutlineButton onClick={() => navigate("/case")}>사건 목록으로</OutlineButton>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- 컨테이너

export default function MissedGame() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [pub, setPub] = useState(null);
  const [view, setView] = useState(undefined); // undefined = 로딩, null = 아직 시작 전
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [heard, setHeard] = useState(null);
  const [notebook, setNotebook] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setPub(await missedGetPublic({ gameId }));
        try {
          const res = await missedPlay({ gameId, action: "state" });
          setView(res.view);
        } catch (err) {
          if (/먼저 조사를/.test(err.message)) setView(null);
          else throw err;
        }
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [gameId]);

  // 서버에 행동을 보내고 새 화면 데이터를 받아 그림. extra(발견한 단서, 거절 대사 등)는 호출한 쪽에서 쓰게 돌려줌.
  async function act(action, payload = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await missedPlay({ gameId, action, ...payload });
      if (res.restarted) { setView(null); setFeedback(null); setHeard(null); return null; }
      if (!["inspect", "present", "link"].includes(action)) setFeedback(null);
      setView(res.view);
      if (!["inspect", "present", "link"].includes(action)) window.scrollTo({ top: 0 });
      return res.extra ?? {};
    } catch (err) {
      setError(err.message);
      return {};
    } finally {
      setBusy(false);
    }
  }

  async function start(level, name) {
    setBusy(true);
    try {
      const res = await missedPlay({ gameId, action: "start", level, name });
      setView(res.view);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !pub) return <div style={{ padding: 20, color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  if (!pub || view === undefined) return <div style={{ textAlign: "center", marginTop: 60, color: "var(--text-sub)" }}>불러오는 중…</div>;
  if (view === null) return <StartScreen pub={pub} onStart={start} busy={busy} />;

  const inPlay = ["map", "location", "decision", "timeline", "report", "report2"].includes(view.step);
  const props = { view, act, busy };

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <Link to="/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 사건 목록</Link>
      {inPlay && (
        <Card style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}>
            <strong>{view.meta.title}</strong>
            {["map", "location", "decision"].includes(view.step) && (
              <span style={{ color: "var(--text-sub)" }}> · {view.day}일 차 · 오늘 남은 방문 {view.visitsLeftToday}곳 · 전체 {view.visitedCount}/{view.visitLimit}곳</span>
            )}
          </div>
          <PrimaryButton style={{ height: 32, padding: "0 12px", fontSize: 12 }} onClick={() => setNotebook(true)}>
            📓 수첩 · 단서 {view.notebook.clues.length}
          </PrimaryButton>
        </Card>
      )}
      {error && <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{error}</div>}

      {heard && (
        <Card style={{ borderColor: "var(--accent)" }}>
          <Kicker>{heard.name}의 두 번째 진술</Kicker>
          <Media src={heard.statement2.video} />
          <Body style={{ fontSize: 13.5 }}>&ldquo;{heard.statement2.text}&rdquo;</Body>
          {heard.noEvidence && <Dim>이름을 빼 주기로 약속하고 들은 진술이라, 보고서의 증거로는 쓸 수 없다. (수첩의 인물 칸에서 다시 볼 수 있다)</Dim>}
          <PrimaryButton style={{ marginTop: 10 }} onClick={() => setHeard(null)}>다음으로 →</PrimaryButton>
        </Card>
      )}

      {view.step === "brief" && <Brief {...props} />}
      {view.step === "map" && <MapView {...props} />}
      {view.step === "location" && (
        <>
          <LocationView {...props} setFeedback={setFeedback} feedback={feedback} />
          <PrimaryButton disabled={busy} onClick={() => { setFeedback(null); act("leave"); }}>조사를 마치고 지도로 돌아간다 →</PrimaryButton>
        </>
      )}
      {view.step === "decision" && <DecisionView {...props} setHeard={setHeard} />}
      {view.step === "timeline" && <TimelineView {...props} />}
      {view.step === "report" && <ReportView {...props} />}
      {view.step === "report2" && <Report2View {...props} />}
      {view.step === "ending" && <EndingView {...props} />}
      {view.step === "missed" && <MissedView {...props} />}
      {view.step === "story" && <StoryView {...props} />}
      {view.step === "ended" && <EndedView {...props} navigate={navigate} />}

      {notebook && <Notebook view={view} act={act} busy={busy} onClose={() => setNotebook(false)} />}
    </div>
  );
}
