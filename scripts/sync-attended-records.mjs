// 매일 GitHub Actions 크론으로 실행됨 (.github/workflows/sync-attended-records.yml).
// 날짜가 지난 "머더미스터리" 카테고리 일정 중 참석(yes)한 사람에게 플레이 기록을 자동으로 만들어줌.
// 한 번 처리한 일정은 recordSynced:true로 표시해 다음 실행에서 건너뜀.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeTitle } from "../src/lib/scenarioUtils.js";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const now = new Date().toISOString();

const snap = await db.collection("schedules").where("category", "==", "머더미스터리").get();
const dueSchedules = snap.docs.filter((doc) => {
  const s = doc.data();
  if (s.recordSynced) return false;
  const endsAt = s.endDatetime || s.datetime;
  return !!endsAt && endsAt < now;
});

console.log(`처리 대상 일정: ${dueSchedules.length}건`);

let created = 0;
for (const doc of dueSchedules) {
  const s = doc.data();
  const date = s.datetime.slice(0, 10);
  const attendeeIds = Object.entries(s.attendees || {})
    .filter(([, v]) => v === "yes")
    .map(([uid]) => uid);

  for (const uid of attendeeIds) {
    const existing = await db
      .collection("records")
      .where("userId", "==", uid)
      .where("scenarioName", "==", s.title)
      .where("date", "==", date)
      .limit(1)
      .get();
    if (!existing.empty) continue;

    await db.collection("records").add({
      userId: uid,
      scenarioName: s.title,
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
      playedTitles: FieldValue.arrayUnion(normalizeTitle(s.title)),
    });
    created++;
  }

  await doc.ref.update({ recordSynced: true });
}

console.log(`완료. 기록 ${created}건 자동 생성.`);
