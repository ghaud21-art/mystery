import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { caseAdminGetSeason, caseAdminSaveSeason, caseAdminSaveDay } from "../../lib/caseApi.js";
import { Card, OutlineButton, PageHeader, PrimaryButton } from "../../components/ui.jsx";
import ReportPaper from "../../components/case/ReportPaper.jsx";
import ChoiceList from "../../components/case/ChoiceList.jsx";

const EMPTY_SEASON = {
  title: "", landingCopy: { catchphrase: "", intro: "", rules: "", startButtonLabel: "" },
  totalDays: 7, gradeTable: [], checkpoints: [], judgePrompt: "", letterPrompt: "", truthExplanation: "", published: false,
};
const EMPTY_DAY = {
  reportTitle: "", reportBody: "", question: "", options: ["", "", "", ""], correctIndex: 0,
  explanation: "", memoryFragment: "", wrongMessage: "", replyPrompt: "",
};

export default function AdminCaseSeasonEdit() {
  const { seasonId } = useParams();
  const [tab, setTab] = useState("settings");
  const [seasonForm, setSeasonForm] = useState(EMPTY_SEASON);
  const [days, setDays] = useState({});
  const [selectedDay, setSelectedDay] = useState(1);
  const [dayForm, setDayForm] = useState(EMPTY_DAY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [savingSeason, setSavingSeason] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [activeWarning, setActiveWarning] = useState(0);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await caseAdminGetSeason({ seasonId });
        setSeasonForm({ ...EMPTY_SEASON, ...res.season, landingCopy: { ...EMPTY_SEASON.landingCopy, ...res.season.landingCopy } });
        setDays(res.days || {});
        setDayForm({ ...EMPTY_DAY, ...(res.days?.["1"] || {}) });
        setLoaded(true);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [seasonId]);

  function selectDay(day) {
    setSelectedDay(day);
    setDayForm({ ...EMPTY_DAY, ...(days[String(day)] || {}) });
  }

  async function saveSeason() {
    setSavingSeason(true);
    setError("");
    try {
      const res = await caseAdminSaveSeason({ seasonId, patch: seasonForm });
      setActiveWarning(res.activeCount || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSeason(false);
    }
  }

  async function saveDay() {
    setSavingDay(true);
    setError("");
    try {
      const res = await caseAdminSaveDay({ seasonId, day: selectedDay, patch: dayForm });
      setActiveWarning(res.activeCount || 0);
      setDays((d) => ({ ...d, [String(selectedDay)]: dayForm }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDay(false);
    }
  }

  function addGradeRow() {
    setSeasonForm((f) => ({ ...f, gradeTable: [...f.gradeTable, { min: 0, max: 0, name: "", blurb: "" }] }));
  }
  function updateGradeRow(i, key, value) {
    setSeasonForm((f) => ({ ...f, gradeTable: f.gradeTable.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)) }));
  }
  function removeGradeRow(i) {
    setSeasonForm((f) => ({ ...f, gradeTable: f.gradeTable.filter((_, idx) => idx !== i) }));
  }

  function addCheckpointRow() {
    setSeasonForm((f) => ({ ...f, checkpoints: [...f.checkpoints, { id: `CP${f.checkpoints.length + 1}`, description: "" }] }));
  }
  function updateCheckpointRow(i, key, value) {
    setSeasonForm((f) => ({ ...f, checkpoints: f.checkpoints.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)) }));
  }
  function removeCheckpointRow(i) {
    setSeasonForm((f) => ({ ...f, checkpoints: f.checkpoints.filter((_, idx) => idx !== i) }));
  }

  if (!loaded) return <div style={{ textAlign: "center", marginTop: 60, color: "var(--text-sub)" }}>불러오는 중…</div>;

  return (
    <div className="fade-in">
      <Link to="/admin/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 시즌 목록</Link>
      <PageHeader eyebrow="ADMIN" title={seasonForm.title || seasonId} />

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
      {activeWarning > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--danger)", padding: 10, borderRadius: 8, background: "color-mix(in srgb, var(--danger) 10%, transparent)", marginBottom: 12 }}>
          {activeWarning}명이 수사 중입니다. 수정은 즉시 반영되며, 이미 제출된 답안은 재채점되지 않습니다.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {[{ id: "settings", label: "시즌 설정" }, { id: "days", label: "일차 콘텐츠" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 4px", marginBottom: -1, background: "none", border: "none",
            borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            color: tab === t.id ? "var(--accent)" : "var(--text-sub)",
            fontWeight: tab === t.id ? 700 : 500, fontSize: 13.5, marginRight: 16,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "settings" && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={!!seasonForm.published} onChange={(e) => setSeasonForm({ ...seasonForm, published: e.target.checked })} />
            플레이 가능 (공개) — 체크해야 플레이어에게 "사건" 탭에 노출돼요
          </label>
          <Fld label="제목"><input value={seasonForm.title} onChange={(e) => setSeasonForm({ ...seasonForm, title: e.target.value })} style={inputStyle} /></Fld>
          <Fld label="랜딩 캐치프레이즈"><textarea rows={2} value={seasonForm.landingCopy.catchphrase} onChange={(e) => setSeasonForm({ ...seasonForm, landingCopy: { ...seasonForm.landingCopy, catchphrase: e.target.value } })} style={{ ...inputStyle, resize: "vertical" }} /></Fld>
          <Fld label="랜딩 소개문"><textarea rows={5} value={seasonForm.landingCopy.intro} onChange={(e) => setSeasonForm({ ...seasonForm, landingCopy: { ...seasonForm.landingCopy, intro: e.target.value } })} style={{ ...inputStyle, resize: "vertical" }} /></Fld>
          <Fld label="수사 규칙"><textarea rows={5} value={seasonForm.landingCopy.rules} onChange={(e) => setSeasonForm({ ...seasonForm, landingCopy: { ...seasonForm.landingCopy, rules: e.target.value } })} style={{ ...inputStyle, resize: "vertical" }} /></Fld>
          <Fld label="시작 버튼 문구"><input value={seasonForm.landingCopy.startButtonLabel} onChange={(e) => setSeasonForm({ ...seasonForm, landingCopy: { ...seasonForm.landingCopy, startButtonLabel: e.target.value } })} style={inputStyle} /></Fld>
          <Fld label="총 일수"><input type="number" min={1} max={7} value={seasonForm.totalDays} onChange={(e) => setSeasonForm({ ...seasonForm, totalDays: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} /></Fld>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>체크포인트 (AI 판정 기준)</div>
            {seasonForm.checkpoints.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input placeholder="id (예: CP1)" value={c.id} onChange={(e) => updateCheckpointRow(i, "id", e.target.value)} style={{ ...inputStyle, width: 90 }} />
                <input placeholder="설명" value={c.description} onChange={(e) => updateCheckpointRow(i, "description", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <OutlineButton style={{ height: 40, padding: "0 10px" }} onClick={() => removeCheckpointRow(i)}>삭제</OutlineButton>
              </div>
            ))}
            <OutlineButton onClick={addCheckpointRow}>+ 체크포인트 추가</OutlineButton>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>등급표 (0점부터 만점까지 빈틈없이)</div>
            {seasonForm.gradeTable.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <input type="number" placeholder="최소" value={g.min} onChange={(e) => updateGradeRow(i, "min", Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
                <input type="number" placeholder="최대" value={g.max} onChange={(e) => updateGradeRow(i, "max", Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
                <input placeholder="등급명" value={g.name} onChange={(e) => updateGradeRow(i, "name", e.target.value)} style={{ ...inputStyle, width: 140 }} />
                <input placeholder="한줄평" value={g.blurb} onChange={(e) => updateGradeRow(i, "blurb", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <OutlineButton style={{ height: 40, padding: "0 10px" }} onClick={() => removeGradeRow(i)}>삭제</OutlineButton>
              </div>
            ))}
            <OutlineButton onClick={addGradeRow}>+ 등급 추가</OutlineButton>
          </div>

          <Fld label="판정 프롬프트 ({{answers}} 자리에 답장 전문이 들어감)">
            <textarea rows={10} value={seasonForm.judgePrompt} onChange={(e) => setSeasonForm({ ...seasonForm, judgePrompt: e.target.value })} style={{ ...inputStyle, fontFamily: "ui-monospace,monospace", resize: "vertical" }} />
          </Fld>
          <Fld label="편지 프롬프트 ({{reached_list}}/{{missed_list}}/{{tier}}/{{answers}} 사용 가능)">
            <textarea rows={10} value={seasonForm.letterPrompt} onChange={(e) => setSeasonForm({ ...seasonForm, letterPrompt: e.target.value })} style={{ ...inputStyle, fontFamily: "ui-monospace,monospace", resize: "vertical" }} />
          </Fld>
          <Fld label="진상 전체 해설 (결과 페이지에서만 공개)">
            <textarea rows={10} value={seasonForm.truthExplanation} onChange={(e) => setSeasonForm({ ...seasonForm, truthExplanation: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
          </Fld>

          <PrimaryButton onClick={saveSeason} disabled={savingSeason}>{savingSeason ? "저장 중…" : "시즌 설정 저장"}</PrimaryButton>
        </Card>
      )}

      {tab === "days" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Array.from({ length: seasonForm.totalDays }, (_, i) => i + 1).map((d) => (
              <button key={d} onClick={() => selectDay(d)} style={{
                width: 36, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${selectedDay === d ? "var(--accent)" : "var(--border)"}`,
                background: selectedDay === d ? "var(--accent-dim)" : "transparent",
                color: selectedDay === d ? "var(--accent)" : "var(--text)",
              }}>{d}</button>
            ))}
          </div>

          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Fld label="보고서 제목"><input value={dayForm.reportTitle} onChange={(e) => setDayForm({ ...dayForm, reportTitle: e.target.value })} style={inputStyle} /></Fld>
            <Fld label="보고서 본문">
              <textarea rows={10} value={dayForm.reportBody} onChange={(e) => setDayForm({ ...dayForm, reportBody: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            </Fld>
            <Fld label="문제"><input value={dayForm.question} onChange={(e) => setDayForm({ ...dayForm, question: e.target.value })} style={inputStyle} /></Fld>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>보기 4개 (라디오로 정답 선택)</div>
              {dayForm.options.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="radio" checked={dayForm.correctIndex === i} onChange={() => setDayForm({ ...dayForm, correctIndex: i })} />
                  <input
                    value={opt}
                    onChange={(e) => setDayForm({ ...dayForm, options: dayForm.options.map((o, idx) => (idx === i ? e.target.value : o)) })}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder={`보기 ${String.fromCharCode(65 + i)}`}
                  />
                </div>
              ))}
            </div>
            <Fld label="해설 (서버 전용, 플레이어에게 절대 노출 안 됨)">
              <textarea rows={3} value={dayForm.explanation} onChange={(e) => setDayForm({ ...dayForm, explanation: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            </Fld>
            <Fld label="기억 조각 (정답 시 공개)">
              <textarea rows={3} value={dayForm.memoryFragment} onChange={(e) => setDayForm({ ...dayForm, memoryFragment: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            </Fld>
            <Fld label="오답 문구">
              <textarea rows={2} value={dayForm.wrongMessage} onChange={(e) => setDayForm({ ...dayForm, wrongMessage: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
            </Fld>
            <Fld label="답장 주제"><input value={dayForm.replyPrompt} onChange={(e) => setDayForm({ ...dayForm, replyPrompt: e.target.value })} style={inputStyle} /></Fld>

            <div style={{ display: "flex", gap: 8 }}>
              <PrimaryButton onClick={saveDay} disabled={savingDay} style={{ flex: 1 }}>{savingDay ? "저장 중…" : `${selectedDay}일차 저장`}</PrimaryButton>
              <OutlineButton onClick={() => setPreview((v) => !v)}>{preview ? "미리보기 닫기" : "미리보기"}</OutlineButton>
            </div>
          </Card>

          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ReportPaper eyebrow={`${selectedDay}일차`} title={dayForm.reportTitle} body={dayForm.reportBody} />
              <Card><ChoiceList question={dayForm.question} options={dayForm.options} selected={null} disabled /></Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fld({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "var(--text-sub)" }}>
      <div style={{ marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {children}
    </label>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box",
};
