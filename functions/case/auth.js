import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  return uid;
}

// 매 호출마다 서버에서 관리자 여부를 다시 확인한다 — 클라이언트가 보낸 값은 절대 신뢰하지 않음
// (firestore.rules의 isAdmin() 헬퍼와 동일한 원칙).
export async function requireAdmin(request) {
  const uid = requireAuth(request);
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists || snap.data()?.isAdmin !== true) {
    throw new HttpsError("permission-denied", "관리자만 사용할 수 있어요.");
  }
  return uid;
}
