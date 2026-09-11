// 일회성 복구: merge-duplicate-records.mjs가 중복을 합칠 때 "손으로 적은 기록"을 우선
// 남기는 바람에(예전 기준), 모임/개인 일정에서 자동 연동됐던 정확한 날짜가 담긴 기록이 지워지고
// 손으로 대충 적은 날짜만 남은 경우를 되살림. recordSynced:true로 표시된 일정(=한 번 자동 동기화가
// 돌았던 일정)을 기준으로 "이 유저는 이 작품을 이 날짜에 했었다"는 정답 목록을 다시 만든 뒤,
// 지금 남아있는 기록의 날짜가 그 정답과 다르면 정답 날짜로 되돌리고 source도 auto-schedule로
// 표시함. 별점/역할/메모 등 이미 병합된 손으로 적은 내용은 그대로 두고 날짜만 보정함.
// GitHub Actions workflow_dispatch로 수동 실행 (.github/workflows/restore-synced-record-dates.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const RECORD_CATEGORIES = ["머더미스터리", "크라임씬"];

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// (uid, normalizeTitle) -> 그 작품을 실제로 했던 날짜 후보들
const candidatesByKey = new Map();

function addCandidate(uid, title, date) {
  const key = `${uid}__${normalizeTitle(title)}`;
  if (!candidatesByKey.has(key)) candidatesByKey.set(key, new Set());
  candidatesByKey.get(key).add(date);
}

// category만 Firestore where로 거르고, recordSynced/datetime은 클라이언트에서 필터링
// (복합 인덱스 없이도 동작하게 하기 위함 — sync-attended-records.mjs와 같은 방식).
const groupSnap = await db.collection("schedules").where("category", "in", RECORD_CATEGORIES).get();
for (const doc of groupSnap.docs) {
  const s = doc.data();
  if (!s.recordSynced || !s.datetime) continue;
  const date = s.datetime.slice(0, 10);
  Object.entries(s.attendees || {})
    .filter(([, v]) => v === "yes")
    .forEach(([uid]) => addCandidate(uid, s.title, date));
}

const personalSnap = await db.collection("personalSchedules").where("category", "in", RECORD_CATEGORIES).get();
for (const doc of personalSnap.docs) {
  const s = doc.data();
  if (!s.recordSynced || !s.datetime) continue;
  addCandidate(s.userId, s.title, s.datetime.slice(0, 10));
}

const recordsSnap = await db.collection("records").get();
let fixed = 0;
let ambiguous = 0;

for (const doc of recordsSnap.docs) {
  const r = doc.data();
  const key = `${r.userId}__${normalizeTitle(r.scenarioName)}`;
  const candidates = candidatesByKey.get(key);
  if (!candidates || candidates.size === 0) continue;
  if (candidates.has(r.date)) continue; // 이미 정확한 날짜라 손댈 필요 없음

  const sortedDates = [...candidates].sort();
  const correctDate = sortedDates[0];
  if (candidates.size > 1) {
    console.log(`⚠ 후보 날짜가 여러 개라 가장 이른 날짜로 복구: uid=${r.userId} title="${r.scenarioName}" candidates=${sortedDates.join(",")}`);
    ambiguous++;
  }

  await doc.ref.update({ date: correctDate, source: "auto-schedule" });
  console.log(`복구: uid=${r.userId} title="${r.scenarioName}" ${r.date} -> ${correctDate}`);
  fixed++;
}

console.log(`완료. 날짜 ${fixed}건 복구 (그중 후보가 여러 개라 애매했던 건 ${ambiguous}건).`);
