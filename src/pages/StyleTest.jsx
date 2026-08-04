import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { SURVEY, calcStyles } from "../lib/personality.js";
import { Card, PageHeader, PrimaryButton } from "../components/ui.jsx";

const TOTAL_STEPS = SURVEY.length + 2; // 객관식 10 + 주관식 2

export default function StyleTest() {
  const { profile, setProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(Array(SURVEY.length).fill(null));
  const [goodMatch, setGoodMatch] = useState("");
  const [badMatch, setBadMatch] = useState("");
  const [saving, setSaving] = useState(false);

  const inSurvey = step < SURVEY.length;
  const subjectiveStep = step - SURVEY.length; // 0 또는 1

  async function choose(optIdx) {
    const next = [...answers];
    next[step] = optIdx;
    setAnswers(next);
    setStep(step + 1);
  }

  async function finish() {
    setSaving(true);
    const result = calcStyles(answers);
    const userRef = doc(db, "users", profile.id);
    await setDoc(
      userRef,
      { style: result.style, style2: result.style2, scores: result.scores, surveyAnswers: answers, updatedAt: serverTimestamp() },
      { merge: true }
    );
    await setDoc(
      doc(db, "users", profile.id, "private", "compatInsight"),
      { goodMatch: goodMatch.trim(), badMatch: badMatch.trim(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    setProfile((p) => ({ ...p, ...result }));
    navigate("/style-result");
  }

  return (
    <div className="fade-in" style={{ maxWidth: 560, margin: "0 auto" }}>
      <PageHeader eyebrow={`문항 ${step + 1} / ${TOTAL_STEPS}`} title="나의 추리 성향은?" />
      <div style={{ height: 4, background: "var(--bg-sub)", borderRadius: 2, marginBottom: 24 }}>
        <div
          style={{
            height: "100%",
            width: `${(step / TOTAL_STEPS) * 100}%`,
            background: "var(--accent)",
            borderRadius: 2,
            transition: "width .2s ease",
          }}
        />
      </div>

      {inSurvey ? (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{SURVEY[step].q}</div>
          {SURVEY[step].opts.map((opt, i) => (
            <button
              key={i}
              onClick={() => choose(i)}
              style={{
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 10,
                border: "1.5px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 14,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              {opt.l}
            </button>
          ))}
        </Card>
      ) : (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>
              {subjectiveStep === 0 ? "나와 잘 맞는 플레이어는 어떤 사람인가요?" : "나와 잘 안 맞는 플레이어는 어떤 사람인가요?"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 6 }}>
              머더미스터리 경험이 아직 많지 않다면, 평소 대화가 잘 통하는/안 통하는 사람이 어떤
              스타일인지 적어주셔도 돼요. <b>이 답변은 나만 볼 수 있어요</b> — AI 성향 분석과
              궁합 매칭에만 참고됩니다.
            </div>
          </div>
          <textarea
            autoFocus
            rows={4}
            value={subjectiveStep === 0 ? goodMatch : badMatch}
            onChange={(e) => (subjectiveStep === 0 ? setGoodMatch(e.target.value) : setBadMatch(e.target.value))}
            placeholder={
              subjectiveStep === 0
                ? "예: 논리적으로 차근차근 설명해주는 사람이랑 잘 맞아요. 대화할 때도 요점부터 말해주는 사람이 편해요."
                : "예: 너무 급하게 결론부터 내리는 사람이랑은 잘 안 맞아요. 제 얘기를 끝까지 안 듣고 끊는 사람도 힘들어요."
            }
            style={{
              padding: "12px 14px", borderRadius: 10, border: "1.5px solid var(--border)",
              background: "var(--bg)", color: "var(--text)", fontSize: 14, resize: "vertical",
            }}
          />
          {subjectiveStep === 0 ? (
            <PrimaryButton onClick={() => setStep(step + 1)}>다음</PrimaryButton>
          ) : (
            <PrimaryButton onClick={finish} disabled={saving}>{saving ? "저장 중…" : "완료"}</PrimaryButton>
          )}
        </Card>
      )}

      {step > 0 && !saving && (
        <PrimaryButton
          style={{ marginTop: 16, background: "transparent", color: "var(--text-sub)", border: "1px solid var(--border)" }}
          onClick={() => setStep(step - 1)}
        >
          이전 문항
        </PrimaryButton>
      )}
    </div>
  );
}
