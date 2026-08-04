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

// 우선 모델로 시도하고, 모델을 못 찾거나(사용 불가) 일시적인 서버 과부하일 때 대체 모델로 재시도.
function shouldFallback(err) {
  return /not found|404|unsupported|invalid model|high demand|overloaded|unavailable|\b(429|500|503)\b/i.test(
    err?.message || ""
  );
}

async function generateWithFallback(prompt) {
  try {
    const model = getGenerativeModel(getAiInstance(), { model: PRIMARY_MODEL });
    return await model.generateContent(prompt);
  } catch (err) {
    if (!shouldFallback(err)) throw err;
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

function parseJsonResponse(result) {
  const text = result.response.text().trim();
  const jsonText = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("AI 응답을 해석하지 못했어요. 다시 시도해주세요.");
  }
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

// 자유 형식으로 붙여넣은 플레이 기록 텍스트(제목만, 혹은 캐릭터·별점·날짜가 섞인 메모)를
// 플레이 기록 등록에 쓸 수 있는 구조화된 배열로 파싱.
export async function parseBulkRecords(profile, rawText) {
  if (!canUseAI(profile)) {
    const err = new Error("무료 AI 사용 횟수를 모두 사용했어요.");
    err.code = "AI_LIMIT_REACHED";
    throw err;
  }
  if (!rawText?.trim()) return [];

  const prompt = [
    "당신은 머더미스터리·추리게임 플레이 기록 정리 도우미입니다.",
    "아래는 사용자가 다른 곳에 적어두었던 플레이 기록을 그대로 붙여넣은 텍스트입니다.",
    "형식이 자유롭습니다 (한 줄에 시나리오 제목만 있을 수도, 날짜·캐릭터·별점이 섞여 있을 수도 있어요).",
    "이걸 읽고 각 플레이 기록을 하나씩 뽑아 아래 형식의 순수 JSON 배열로만 출력하세요. 다른 설명은 쓰지 마세요.",
    '[{"scenarioName": "시나리오 제목", "character": "역할(모르면 빈 문자열)", "rating": 1~5 숫자 또는 null(모르면), "date": "YYYY-MM-DD 또는 null(모르면)", "note": "특이사항(없으면 빈 문자열)"}]',
    "시나리오 제목이 아닌 줄(빈 줄, 인사말 등)은 무시하세요.",
    "",
    "--- 붙여넣은 텍스트 ---",
    rawText.trim(),
  ].join("\n");

  const result = await generateWithFallback(prompt);
  const parsed = parseJsonResponse(result);
  await recordAIUsage(profile.id);
  if (!Array.isArray(parsed)) throw new Error("AI 응답을 해석하지 못했어요. 다시 시도해주세요.");
  return parsed
    .filter((r) => r?.scenarioName?.trim())
    .map((r) => ({
      scenarioName: r.scenarioName.trim(),
      character: r.character?.trim() || "",
      rating: Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 ? r.rating : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : null,
      note: r.note?.trim() || "",
    }));
}
