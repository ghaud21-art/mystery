// 일회성 마이그레이션: 시나리오 인원수 표기를 전부 "n명" 형식으로 통일.
// 온라인 시나리오는 "2인용" 처럼 등록돼 있어서 "2명"으로 바꿔줌 (오프라인은 이미 "명" 형식).
// GitHub Actions workflow_dispatch로 수동 실행 (.github/workflows/normalize-player-count.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function normalize(str) {
  if (!str) return str;
  return String(str).trim().replace(/인용/g, "명");
}

const snap = await db.collection("scenarios").get();
const batch = db.batch();
let changed = 0;
snap.docs.forEach((doc) => {
  const pc = doc.data().playerCount;
  const next = normalize(pc);
  if (next !== pc) {
    batch.update(doc.ref, { playerCount: next });
    changed++;
  }
});
if (changed > 0) await batch.commit();
console.log(`playerCount 정규화 완료: ${changed}건 수정.`);
