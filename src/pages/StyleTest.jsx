import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext.jsx";
import { db } from "../lib/firebase.js";
import { SURVEY, calcStyles } from "../lib/personality.js";
import { Card, PageHeader, PrimaryButton } from "../components/ui.jsx";

export default function StyleTest() {
  const { profile, setProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(Array(SURVEY.length).fill(null));
  const [saving, setSaving] = useState(false);

  const q = SURVEY[step];
  const isLast = step === SURVEY.length - 1;

  async function choose(optIdx) {
    const next = [...answers];
    next[step] = optIdx;
    setAnswers(next);

    if (!isLast) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    const result = calcStyles(next);
    const ref = doc(db, "users", profile.id);
    await setDoc(
      ref,
      { style: result.style, style2: result.style2, scores: result.scores, surveyAnswers: next, updatedAt: serverTimestamp() },
      { merge: true }
    );
    setProfile((p) => ({ ...p, ...result }));
    navigate("/style-result");
  }

  return (
    <div className="fade-in" style={{ maxWidth: 560, margin: "0 auto" }}>
      <PageHeader eyebrow={`문항 ${step + 1} / ${SURVEY.length}`} title="나의 추리 성향은?" />
      <div style={{ height: 4, background: "var(--bg-sub)", borderRadius: 2, marginBottom: 24 }}>
        <div
          style={{
            height: "100%",
            width: `${((step + (saving ? 1 : 0)) / SURVEY.length) * 100}%`,
            background: "var(--accent)",
            borderRadius: 2,
            transition: "width .2s ease",
          }}
        />
      </div>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{q.q}</div>
        {q.opts.map((opt, i) => (
          <button
            key={i}
            disabled={saving}
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
