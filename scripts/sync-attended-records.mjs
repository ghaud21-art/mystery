// 매일 GitHub Actions 크론으로 실행됨 (.github/workflows/sync-attended-records.yml).
// 날짜가 지난 "머더미스터리"/"크라임씬" 카테고리 일정(모임 일정 + 개인 일정) 중 참석/등록한 사람에게
// 플레이 기록을 자동으로 만들어줌. 한 번 처리한 일정은 recordSynced:true로 표시해 다음 실행에서 건너뜀.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeTitle } from "../src/lib/scenarioUtils.js";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const now = new Date().toISOString();

// uid별 기존 기록 제목 목록을 한 번만 불러와서 재사용 (완전일치 대신 normalizeTitle로 비교해야
// 내가 손으로 적어둔 기록의 표기가 일정 제목과 띄어쓰기 등만 살짝 달라도 같은 작품으로 인식해서
// 중복 생성을 막을 수 있음. 날짜는 보지 않음 — "이미 기록에 있는 작품"이면 그걸로 충분히 연결된
// 것으로 보고 자동으로는 하나만 남긴다).
const existingTitlesByUid = new Map();

async function loadExistingTitles(uid) {
  if (existingTitlesByUid.has(uid)) return existingTitlesByUid.get(uid);
  const snap = await db.collection("records").where("userId", "==", uid).get();
  const titles = new Set(snap.docs.map((d) => normalizeTitle(d.data().scenarioName)));
  existingTitlesByUid.set(uid, titles);
  return titles;
}

async function createRecordIfMissing(uid, title, date) {
  const key = normalizeTitle(title);
  const existingTitles = await loadExistingTitles(uid);
  if (existingTitles.has(key)) return false;
  existingTitles.add(key); // 같은 실행 안에서 같은 uid에 여러 일정이 같은 작품이면 그중 하나만 생성

  await db.collection("records").add({
    userId: uid,
    scenarioName: title,
    character: "",
    rating: null,
    note: "",
    spoiler: true,
    favorite: false,
    date,
    source: "auto-schedule",
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection("users").doc(uid).update({
    playedTitles: FieldValue.arrayUnion(normalizeTitle(title)),
  });
  return true;
}

let created = 0;

const RECORD_CATEGORIES = ["머더미스터리", "크라임씬"];

// 1) 모임 일정 — 참석(yes)한 멤버들
const groupSnap = await db.collection("schedules").where("category", "in", RECORD_CATEGORIES).get();
const dueGroupSchedules = groupSnap.docs.filter((doc) => {
  const s = doc.data();
  if (s.recordSynced) return false;
  const endsAt = s.endDatetime || s.datetime;
  return !!endsAt && endsAt < now;
});
console.log(`모임 일정 처리 대상: ${dueGroupSchedules.length}건`);

for (const doc of dueGroupSchedules) {
  const s = doc.data();
  const date = s.datetime.slice(0, 10);
  const attendeeIds = Object.entries(s.attendees || {})
    .filter(([, v]) => v === "yes")
    .map(([uid]) => uid);

  for (const uid of attendeeIds) {
    if (await createRecordIfMissing(uid, s.title, date)) created++;
  }
  await doc.ref.update({ recordSynced: true });
}

// 2) 개인 일정 — 등록한 본인
const personalSnap = await db.collection("personalSchedules").where("category", "in", RECORD_CATEGORIES).get();
const duePersonalSchedules = personalSnap.docs.filter((doc) => {
  const s = doc.data();
  if (s.recordSynced) return false;
  const endsAt = s.endDatetime || s.datetime;
  return !!endsAt && endsAt < now;
});
console.log(`개인 일정 처리 대상: ${duePersonalSchedules.length}건`);

for (const doc of duePersonalSchedules) {
  const s = doc.data();
  const date = s.datetime.slice(0, 10);
  if (await createRecordIfMissing(s.userId, s.title, date)) created++;
  await doc.ref.update({ recordSynced: true });
}

console.log(`완료. 기록 ${created}건 자동 생성.`);
