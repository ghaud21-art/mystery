import { doc, increment, updateDoc } from "firebase/firestore";
import { db } from "./firebase.js";

export const AI_FREE_LIMIT = 10;
export const KAKAO_CONTACT_URL = "https://open.kakao.com/o/sblqryEh";

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
