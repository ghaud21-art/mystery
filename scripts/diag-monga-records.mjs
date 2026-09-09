import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
const monga = usersSnap.docs.find((d) => (d.data().nickname || d.data().name || "").includes("몬가"));
if (!monga) {
  console.log("NOT FOUND. USERS:", usersSnap.docs.map((d) => d.data().nickname || d.data().name).join(", "));
  process.exit(0);
}
console.log("몬가 uid:", monga.id);

const recSnap = await db.collection("records").where("userId", "==", monga.id).get();
const records = recSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`총 기록 ${records.length}건`);

const byDate = {};
records.forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + 1; });
console.log("날짜별 개수:", JSON.stringify(byDate));

const bySource = {};
records.forEach((r) => { bySource[r.source || "manual"] = (bySource[r.source || "manual"] || 0) + 1; });
console.log("source별 개수:", JSON.stringify(bySource));

const countByTitle = {};
records.forEach((r) => {
  const key = normalizeTitle(r.scenarioName);
  countByTitle[key] = (countByTitle[key] || 0) + 1;
});
const dupes = Object.entries(countByTitle).filter(([, c]) => c > 1);
console.log(`중복 제목(2회 이상): ${dupes.length}건, 초과 문서 수: ${dupes.reduce((s, [, c]) => s + (c - 1), 0)}건`);
console.log("중복 예시(상위 5개):", JSON.stringify(dupes.slice(0, 5)));

const withRatingOrChar = records.filter((r) => r.rating || r.character);
console.log(`rating 또는 character가 채워진 기록 수: ${withRatingOrChar.length} / ${records.length}`);
