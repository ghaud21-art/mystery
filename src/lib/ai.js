import { doc, increment, updateDoc } from "firebase/firestore";
import { getAI, GoogleAIBackend, getGenerativeModel } from "firebase/ai";
import { app, db } from "./firebase.js";
import { TYPE_META } from "./personality.js";

export const AI_FREE_LIMIT = 10;
export const KAKAO_CONTACT_URL = "https://open.kakao.com/o/sblqryEh";

const MODEL_NAME = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.5-flash-lite";
let _model = null;
function getModel() {
  if (!_model) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    _model = getGenerativeModel(ai, { model: MODEL_NAME });
  }
  return _model;
}

export function canUseAI(profile) {
  if (!profile) return false;
  if (profile.aiUnlimited) return true;
  return (profile.aiUsageCount || 0) < AI_FREE_LIMIT;
}

export function remainingAI(profile) {
  if (!profile) return 0;
  if (profile.aiUnlimited) return Infinity;
  return Math.max(0, AI_FREE_LIMIT - (profile.aiUsageCount || 0));
}

export async function recordAIUsage(uid) {
  await updateDoc(doc(db, "users", uid), { aiUsageCount: increment(1) });
}

// 객관식 설문 결과 + 친구별 궁합 메모(자연어)를 바탕으로 강점/약점을 분석.
// friendsById: { [friendUid]: { nickname/name, ... } } — 메모에 이름을 붙여주기 위함
export async function analyzeStyle(profile, friendsById) {
  if (!canUseAI(profile)) {
    const err = new Error("무료 AI 사용 횟수를 모두 사용했어요.");
    err.code = "AI_LIMIT_REACHED";
    throw err;
  }

  const main = TYPE_META[profile.style];
  const sub = profile.style2 ? TYPE_META[profile.style2] : null;
  const notes = Object.entries(profile.compatNotes || {})
    .map(([uid, n]) => n?.text?.trim())
    .filter(Boolean);

  const prompt = [
    "당신은 머더미스터리·추리게임 플레이 성향 분석가입니다.",
    `이 사람의 객관식 설문 기반 주 성향은 "${main.title}"입니다.`,
    sub ? `보조 성향은 "${sub.title}"입니다.` : null,
    notes.length > 0
      ? `이 사람이 함께 플레이한 친구들과의 궁합에 대해 직접 남긴 메모:\n- ${notes.join("\n- ")}`
      : "친구 궁합 메모는 아직 없습니다.",
    "",
    "위 정보를 종합해서 이 사람의 추리 게임 성향 강점과 약점을 각각 한국어 2~3문장으로 분석해주세요.",
    "다른 설명 없이 아래 형식의 순수 JSON 객체 하나만 출력하세요:",
    '{"strengths": "...", "weaknesses": "..."}',
  ]
    .filter(Boolean)
    .join("\n");

  const result = await getModel().generateContent(prompt);
  const text = result.response.text().trim();
  const jsonText = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI 응답을 해석하지 못했어요. 다시 시도해주세요.");
  }

  const analysis = {
    strengths: parsed.strengths || "",
    weaknesses: parsed.weaknesses || "",
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, "users", profile.id), { styleAnalysis: analysis });
  await recordAIUsage(profile.id);
  return analysis;
}
