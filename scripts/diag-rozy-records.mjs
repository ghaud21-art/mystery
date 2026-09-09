import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
const rozy = usersSnap.docs.find((d) => (d.data().nickname || d.data().name || "").includes("로지"));
if (!rozy) { console.log("NOT FOUND"); process.exit(0); }
console.log("로지 uid:", rozy.id);

const recSnap = await db.collection("records").where("userId", "==", rozy.id).get();
const records = recSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`총 기록 ${records.length}건`);

// 날짜 분포
const byDate = {};
records.forEach((r) => { byDate[r.date] = (byDate[r.date] || 0) + 1; });
console.log("날짜별 개수:", JSON.stringify(byDate));

// 소스 분포
const bySource = {};
records.forEach((r) => { bySource[r.source || "manual"] = (bySource[r.source || "manual"] || 0) + 1; });
console.log("source별 개수:", JSON.stringify(bySource));

// 중복 제목 (정규화 기준 2회 이상)
const countByTitle = {};
const idsByTitle = {};
records.forEach((r) => {
  const key = normalizeTitle(r.scenarioName);
  countByTitle[key] = (countByTitle[key] || 0) + 1;
  (idsByTitle[key] = idsByTitle[key] || []).push({ id: r.id, note: r.note, character: r.character, rating: r.rating });
});
const dupes = Object.entries(countByTitle).filter(([, c]) => c > 1);
console.log(`중복 제목(2회 이상) 개수: ${dupes.length}건, 중복으로 인한 초과 문서 수: ${dupes.reduce((s, [, c]) => s + (c - 1), 0)}건`);

// 전체 시나리오 DB와 겹치는 비율
const scenariosSnap = await db.collection("scenarios").where("status", "==", "approved").get();
const allTitles = new Set(scenariosSnap.docs.map((d) => normalizeTitle(d.data().title)));
console.log("전체 승인된 시나리오 수:", allTitles.size);
const uniqueRecordTitles = new Set(records.map((r) => normalizeTitle(r.scenarioName)));
const overlap = [...uniqueRecordTitles].filter((t) => allTitles.has(t)).length;
console.log(`로지님 기록의 고유 제목 수: ${uniqueRecordTitles.size}, 그 중 시나리오 DB와 일치: ${overlap}`);

// 진짜 개인 기록으로 보이는 것(캐릭터/별점/메모가 "장소" 패턴이 아닌 것) 후보 확인
const withRatingOrChar = records.filter((r) => r.rating || r.character);
console.log(`rating 또는 character가 채워진 기록 수: ${withRatingOrChar.length}`);
withRatingOrChar.forEach((r) => console.log(`  [${r.id}] "${r.scenarioName}" character=${r.character} rating=${r.rating}`));

// 상위 중복 목록 예시 10개
console.log("\n중복 예시(상위 10개):");
dupes.slice(0, 10).forEach(([key, count]) => {
  console.log(`- "${key}" x${count}:`, JSON.stringify(idsByTitle[key]));
});
