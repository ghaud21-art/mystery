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

// uid별 기존 기록을 한 번만 불러와서 재사용 (완전일치 대신 normalizeTitle로 비교해야 내가 손으로
// 적어둔 기록의 표기가 일정 제목과 띄어쓰기 등만 살짝 달라도 같은 작품으로 인식해서 중복 생성을
// 막을 수 있음). 이미 같은 작품 기록이 있으면 새로 만들진 않되, 그 기록이 아직 "손으로 적은"
// 기록(source가 auto-schedule이 아님)이고 날짜가 실제 일정 날짜와 다르면 일정 쪽 날짜로 보정한다
// — 모임/개인 일정에서 자동 연동된 날짜가 손으로 대충 적은 날짜보다 정확하다고 보기 때문. 이미
// auto-schedule로 한 번 보정된 기록은 다시 안 건드림(같은 작품을 다른 날 또 플레이한 경우까지
// 뒤에 처리되는 다른 일정 날짜로 덮어써버리는 걸 막기 위함). 별점/역할/메모처럼 손으로 적어둔
// 내용은 기록을 지우고 새로 만드는 게 아니라 날짜만 보정하는 것이므로 그대로 남는다.
const existingByUid = new Map();

async function loadExisting(uid) {
  if (existingByUid.has(uid)) return existingByUid.get(uid);
  const snap = await db.collection("records").where("userId", "==", uid).get();
  const map = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    map.set(normalizeTitle(data.scenarioName), { date: data.date, source: data.source || null, ref: d.ref });
  });
  existingByUid.set(uid, map);
  return map;
}

async function createRecordIfMissing(uid, title, date) {
  const key = normalizeTitle(title);
  const existing = await loadExisting(uid);
  const found = existing.get(key);

  if (found) {
    if (found.date !== date && found.source !== "auto-schedule") {
      await found.ref.update({ date, source: "auto-schedule" });
      console.log(`날짜 보정: uid=${uid} title="${title}" ${found.date} -> ${date}`);
      found.date = date;
      found.source = "auto-schedule";
    }
    return false;
  }

  const ref = await db.collection("records").add({
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
  existing.set(key, { date, ref });
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
