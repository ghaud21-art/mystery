import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { caseGetPlayState, caseSetNightMode, caseSubmitDay, caseSubmitFinal } from "../../lib/caseApi.js";
import { Card, EmptyState, OutlineButton, PageHeader, PrimaryButton } from "../../components/ui.jsx";
import ReportPaper from "../../components/case/ReportPaper.jsx";
import ChoiceList from "../../components/case/ChoiceList.jsx";
import DayTimeline from "../../components/case/DayTimeline.jsx";
import CountdownTimer from "../../components/case/CountdownTimer.jsx";

export default function CasePlay() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [selectedDay, setSelectedDay] = useState(null);
  const [choice, setChoice] = useState(null);
  const [essay, setEssay] = useState("");
  const [finalEssay, setFinalEssay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // {correct, fragment, wrongMessage}
  const [nightBusy, setNightBusy] = useState(false);

  async function load() {
    try {
      const res = await caseGetPlayState({ seasonId });
      if (!res.started) {
        navigate(`/case/${seasonId}`, { replace: true });
        return;
      }
      if (res.completed) {
        navigate(`/case/${seasonId}/result`, { replace: true });
        return;
      }
      setState(res);
      setSelectedDay(res.current ? res.current.day : res.history[res.history.length - 1]?.day || 1);
      setChoice(null);
      setEssay("");
      setFinalEssay("");
      setFeedback(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  if (error) return <div style={{ padding: 20, color: "var(--danger)", fontSize: 13 }}>{error}</div>;
  if (!state) return <div style={{ textAlign: "center", marginTop: 60, color: "var(--text-sub)" }}>불러오는 중…</div>;

  const unlockedThrough = state.current ? state.current.day : state.history.length;
  const viewingCurrent = state.current && selectedDay === state.current.day;
  const historyDay = state.history.find((d) => d.day === selectedDay);

  async function handleNightMode() {
    if (!window.confirm('밤을 새워 기록을 끝까지 읽어내려갑니다. 아침의 기다림은 사라집니다.\n전환하면 되돌릴 수 없습니다. 밤샘 수사로 전환할까요?')) return;
    setNightBusy(true);
    try {
      await caseSetNightMode({ seasonId });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setNightBusy(false);
    }
  }

  async function handleSubmit() {
    if (choice === null) return;
    setSubmitting(true);
    setError("");
    try {
      if (state.current.isFinal) {
        await caseSubmitFinal({ seasonId, choice, essay, finalEssay: finalEssay || undefined });
        navigate(`/case/${seasonId}/result`);
        return;
      }
      const res = await caseSubmitDay({ seasonId, day: state.current.day, choice, essay });
      setFeedback(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fade-in">
      <PageHeader eyebrow="CASE FILES" title={state.season.title} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <DayTimeline totalDays={state.totalDays} unlockedThrough={unlockedThrough} selectedDay={selectedDay} onSelect={setSelectedDay} />
        {state.mode === "realtime" && (
          <OutlineButton style={{ height: 32, padding: "0 12px", fontSize: 11.5, whiteSpace: "nowrap" }} onClick={handleNightMode} disabled={nightBusy}>
            {nightBusy ? "전환 중…" : "🌙 밤샘 수사로 전환"}
          </OutlineButton>
        )}
        {state.mode === "night" && (
          <span style={{ fontSize: 11.5, color: "var(--text-sub)" }}>🌙 밤샘 수사 중</span>
        )}
      </div>

      {error && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}

      {!state.current && state.nextUnlockAt && (
        <Card style={{ marginBottom: 14 }}>
          <CountdownTimer targetIso={state.nextUnlockAt} onArrive={load} />
        </Card>
      )}

      {historyDay && !viewingCurrent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ReportPaper eyebrow={`${historyDay.day}일차`} title={historyDay.reportTitle} body={historyDay.reportBody} />
          <Card>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{historyDay.question}</div>
            <div style={{ fontSize: 12.5, color: historyDay.myCorrect ? "var(--success)" : "var(--danger)", marginBottom: 6 }}>
              내 선택: {historyDay.options[historyDay.myChoice]} — {historyDay.myCorrect ? "정답 ✓" : "오답"}
            </div>
            {historyDay.fragment && (
              <div style={{ fontSize: 12.5, fontStyle: "italic", color: "var(--text-sub)", padding: "8px 10px", background: "var(--bg-sub)", borderRadius: 8, marginBottom: 8 }}>
                {historyDay.fragment}
              </div>
            )}
            {historyDay.wrongMessage && (
              <div style={{ fontSize: 12.5, color: "var(--text-sub)", padding: "8px 10px", background: "var(--bg-sub)", borderRadius: 8, marginBottom: 8 }}>
                {historyDay.wrongMessage}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: "var(--text-sub)", marginBottom: 3 }}>내가 보낸 답장</div>
            <div style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{historyDay.myEssay}</div>
          </Card>
        </div>
      )}

      {viewingCurrent && !feedback && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ReportPaper eyebrow={`${state.current.day}일차`} title={state.current.reportTitle} body={state.current.reportBody} />
          <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ChoiceList question={state.current.question} options={state.current.options} selected={choice} onSelect={setChoice} disabled={submitting} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{state.current.replyPrompt}</div>
              <textarea
                value={essay}
                onChange={(e) => setEssay(e.target.value)}
                rows={5}
                placeholder="답장을 적어주세요"
                style={textareaStyle}
              />
            </div>
            {state.current.isFinal && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  최종 추리 — 범인이 누구인지, 왜 그렇게 확신하는지 적어주세요 (200자 이상 권장)
                </div>
                <textarea
                  value={finalEssay}
                  onChange={(e) => setFinalEssay(e.target.value)}
                  rows={7}
                  placeholder="최종 추리를 적어주세요"
                  style={textareaStyle}
                />
              </div>
            )}
            <PrimaryButton onClick={handleSubmit} disabled={choice === null || submitting}>
              {submitting ? "제출 중…" : state.current.isFinal ? "최종 답장 제출" : "제출하기"}
            </PrimaryButton>
          </Card>
        </div>
      )}

      {viewingCurrent && feedback && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: feedback.correct ? "var(--success)" : "var(--danger)" }}>
            {feedback.correct ? "정답이에요 — 기억 조각을 되찾았어요" : "오답이에요"}
          </div>
          <div style={{ fontSize: 12.5, fontStyle: "italic", color: "var(--text-sub)" }}>
            {feedback.correct ? feedback.fragment : feedback.wrongMessage}
          </div>
          <PrimaryButton onClick={load}>확인했어요</PrimaryButton>
        </Card>
      )}

      {!historyDay && !viewingCurrent && (
        <Card><EmptyState>지난 일차를 선택해서 다시 읽어볼 수 있어요.</EmptyState></Card>
      )}

      <div style={{ marginTop: 20 }}>
        <Link to="/case" style={{ fontSize: 12, color: "var(--text-sub)" }}>← 사건 목록으로</Link>
      </div>
    </div>
  );
}

const textareaStyle = {
  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid var(--border)",
  background: "var(--bg)", color: "var(--text)", fontSize: 13, resize: "vertical", boxSizing: "border-box",
};
