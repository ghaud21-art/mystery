// 일회성 마이그레이션: 기존 유저들의 records를 기반으로 users/{uid}.playedTitles를 채워줌.
// "같이 안한 머미" 추천 기능이 records 대신 이 필드를 참고하도록 바뀌면서 필요해짐.
// GitHub Actions workflow_dispatch로 수동 실행 (.github/workflows/backfill-played-titles.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
let updated = 0;
for (const userDoc of usersSnap.docs) {
  const recSnap = await db.collection("records").where("userId", "==", userDoc.id).get();
  const titles = [...new Set(recSnap.docs.map((d) => normalizeTitle(d.data().scenarioName)))];
  await userDoc.ref.update({ playedTitles: titles });
  updated++;
}
console.log(`완료. ${updated}명의 playedTitles를 백필했어요.`);
