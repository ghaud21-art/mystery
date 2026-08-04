import { doc, getDoc, increment, updateDoc } from "firebase/firestore";
import { getAI, GoogleAIBackend, getGenerativeModel } from "firebase/ai";
import { app, db } from "./firebase.js";
import { TYPE_META } from "./personality.js";

export const AI_FREE_LIMIT = 10;
export const KAKAO_CONTACT_URL = "https://open.kakao.com/o/sblqryEh";

const PRIMARY_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

let _ai = null;
function getAiInstance() {
  if (!_ai) _ai = getAI(app, { backend: new GoogleAIBackend() });
  return _ai;
}

// 우선 모델로 시도하고, 모델 자체를 못 찾는 오류일 때만 대체 모델로 재시도.
async function generateWithFallback(prompt) {
  try {
    const model = getGenerativeModel(getAiInstance(), { model: PRIMARY_MODEL });
    return await model.generateContent(prompt);
  } catch (err) {
    const notFound = /not found|404|unsupported|invalid model/i.test(err?.message || "");
    if (!notFound) throw err;
    const model = getGenerativeModel(getAiInstance(), { model: FALLBACK_MODEL });
    return await model.generateContent(prompt);
  }
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

// 객관식 설문 결과 + 가입 시 작성한 비공개 주관식 답변(나와 잘 맞는/안 맞는 플레이어)을 바탕으로 강점/약점을 분석.
// 주관식 답변은 본인만 읽을 수 있는 users/{uid}/private/compatInsight 문서에 저장돼 있음.
export async function analyzeStyle(profile) {
  if (!canUseAI(profile)) {
    const err = new Error("무료 AI 사용 횟수를 모두 사용했어요.");
    err.code = "AI_LIMIT_REACHED";
    throw err;
  }

  const main = TYPE_META[profile.style];
  const sub = profile.style2 ? TYPE_META[profile.style2] : null;
  const insightSnap = await getDoc(doc(db, "users", profile.id, "private", "compatInsight"));
  const insight = insightSnap.exists() ? insightSnap.data() : null;

  const prompt = [
    "당신은 머더미스터리·추리게임 플레이 성향 분석가입니다.",
    `이 사람의 객관식 설문 기반 주 성향은 "${main.title}"입니다.`,
    sub ? `보조 성향은 "${sub.title}"입니다.` : null,
    insight?.goodMatch ? `이 사람이 직접 밝힌, 자신과 잘 맞는 플레이어 특징:\n${insight.goodMatch}` : null,
    insight?.badMatch ? `이 사람이 직접 밝힌, 자신과 잘 안 맞는 플레이어 특징:\n${insight.badMatch}` : null,
    !insight?.goodMatch && !insight?.badMatch ? "궁합 관련 주관식 답변은 아직 없습니다." : null,
    "",
    "위 정보를 종합해서 이 사람의 추리 게임 성향 강점과 약점을 각각 한국어 2~3문장으로 분석해주세요.",
    "다른 설명 없이 아래 형식의 순수 JSON 객체 하나만 출력하세요:",
    '{"strengths": "...", "weaknesses": "..."}',
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateWithFallback(prompt);
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
