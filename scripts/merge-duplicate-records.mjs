// 일회성 정리: 모임/개인 일정 자동 동기화(sync-attended-records)가 완전일치 비교 때문에
// 만들어버린 중복 기록들을, 같은 유저+같은 작품(normalizeTitle 기준)이면 하나로 합침.
// 여러 건 중 "손으로 직접 적은 기록"을 우선 기준으로 남기고, 별점·역할·메모·인생머미(⭐)·공개 여부처럼
// 남겨둔 기록이 비어있는 필드만 다른 중복 건에서 채워 넣은 뒤 나머지는 삭제함(값을 덮어쓰지 않음).
// GitHub Actions workflow_dispatch로 수동 실행 (.github/workflows/merge-duplicate-records.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// 어느 중복 기록을 "남길 것"으로 볼지 점수화. 별점/역할/메모/즐겨찾기/공개 여부가 채워져 있을수록,
// 그리고 자동 생성(auto-schedule)이 아니라 직접 적은 기록일수록 점수가 높음.
function score(r) {
  let s = 0;
  if (r.rating) s += 2;
  if (r.character) s += 1;
  if (r.note) s += 1;
  if (r.favorite) s += 1;
  if (r.public) s += 1;
  if (r.source !== "auto-schedule") s += 1;
  return s;
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
let mergedGroups = 0;
let deletedRecords = 0;

for (const userDoc of usersSnap.docs) {
  const uid = userDoc.id;
  const recSnap = await db.collection("records").where("userId", "==", uid).get();
  const records = recSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));

  const groups = new Map();
  for (const r of records) {
    const key = normalizeTitle(r.scenarioName);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let userChanged = false;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort((a, b) => score(b) - score(a));
    const [keeper, ...dupes] = sorted;

    const merged = {};
    if (!keeper.rating) {
      const withRating = dupes.find((d) => d.rating);
      if (withRating) merged.rating = withRating.rating;
    }
    if (!keeper.character) {
      const withCharacter = dupes.find((d) => d.character);
      if (withCharacter) merged.character = withCharacter.character;
    }
    if (!keeper.note) {
      const withNote = dupes.find((d) => d.note);
      if (withNote) merged.note = withNote.note;
    }
    if (!keeper.favorite && dupes.some((d) => d.favorite)) merged.favorite = true;
    if (!keeper.public && dupes.some((d) => d.public)) merged.public = true;

    if (Object.keys(merged).length > 0) {
      await keeper.ref.update(merged);
    }
    for (const d of dupes) {
      await d.ref.delete();
      deletedRecords++;
    }
    mergedGroups++;
    userChanged = true;
  }

  if (userChanged) {
    const freshSnap = await db.collection("records").where("userId", "==", uid).get();
    const freshRecords = freshSnap.docs.map((d) => d.data());
    const playedTitles = [...new Set(freshRecords.map((r) => normalizeTitle(r.scenarioName)))];
    const favoriteTitles = [...new Set(freshRecords.filter((r) => r.favorite && r.scenarioName).map((r) => r.scenarioName.trim()))];
    await userDoc.ref.update({ playedTitles, favoriteTitles, playedCount: freshRecords.length });
  }
}

console.log(`완료. 중복 그룹 ${mergedGroups}건 병합, 기록 ${deletedRecords}건 삭제.`);
