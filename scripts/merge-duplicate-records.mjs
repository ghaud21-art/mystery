// 일회성 정리: 모임/개인 일정 자동 동기화(sync-attended-records)가 완전일치 비교 때문에
// 만들어버린 중복 기록들을, 같은 유저+같은 작품(normalizeTitle 기준)이면 하나로 합침.
// 여러 건 중 "모임/개인 일정에서 자동 연동된 기록"(source: auto-schedule)을 우선 기준으로
// 남긴다 — 그쪽 날짜가 실제 일정 날짜라 더 정확하기 때문. 대신 별점·역할·메모·인생머미(⭐)·
// 공개 여부처럼 손으로 적어둔 내용은, 남겨둔 기록에 비어있는 필드만 다른 중복 건에서 채워
// 넣은 뒤 나머지는 삭제함(값을 덮어쓰지 않음). 자동 연동 기록이 하나도 없는 그룹(직접 적은
// 기록끼리만 중복인 경우)은 기록 내용이 더 채워져 있는 쪽을 남김.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizeTitle(t) {
  return (t || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// 어느 중복 기록을 "남길 것"으로 볼지 점수화. 자동 연동(auto-schedule) 기록의 날짜가 가장
// 정확하므로 그 보너스가 다른 항목(별점/역할/메모/즐겨찾기/공개 여부) 점수 합보다 항상 크게 잡음.
function score(r) {
  let s = 0;
  if (r.rating) s += 2;
  if (r.character) s += 1;
  if (r.note) s += 1;
  if (r.favorite) s += 1;
  if (r.public) s += 1;
  if (r.source === "auto-schedule") s += 10;
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
