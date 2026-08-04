// 매일 GitHub Actions 크론으로 실행됨 (.github/workflows/reminders.yml).
// "내일" 예정된 일정에 참석(yes)하기로 한 사람들에게 FCM 푸시 알림을 보낸다.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const messaging = getMessaging();

// 한국 시간(UTC+9) 기준 "내일" 날짜 범위 계산
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const nowKst = new Date(Date.now() + KST_OFFSET_MS);
const tomorrowKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + 1));
const dayAfterKst = new Date(tomorrowKst.getTime() + 24 * 60 * 60 * 1000);
// KST 자정을 다시 UTC ISO 문자열로 변환 (schedules.datetime은 datetime-local, 즉 로컬시각 그대로 저장된 문자열)
const rangeStart = new Date(tomorrowKst.getTime() - KST_OFFSET_MS).toISOString().slice(0, 16);
const rangeEnd = new Date(dayAfterKst.getTime() - KST_OFFSET_MS).toISOString().slice(0, 16);

console.log(`내일(${rangeStart} ~ ${rangeEnd}) 일정 확인 중...`);

const snap = await db
  .collection("schedules")
  .where("datetime", ">=", rangeStart)
  .where("datetime", "<", rangeEnd)
  .get();

if (snap.empty) {
  console.log("내일 예정된 일정이 없어요.");
  process.exit(0);
}

let sent = 0;
for (const doc of snap.docs) {
  const s = doc.data();
  const attendeeIds = Object.entries(s.attendees || {})
    .filter(([, status]) => status === "yes")
    .map(([uid]) => uid);
  if (attendeeIds.length === 0) continue;

  const userDocs = await Promise.all(attendeeIds.map((uid) => db.collection("users").doc(uid).get()));
  const tokens = userDocs.flatMap((d) => d.data()?.fcmTokens || []);
  if (tokens.length === 0) continue;

  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: `내일 "${s.title}" 일정이 있어요`,
      body: `${s.location} · 잊지 말고 참석해주세요!`,
    },
  });
  sent += res.successCount;
  console.log(`- ${s.title}: ${res.successCount}/${tokens.length}명에게 발송`);
}

console.log(`완료. 총 ${sent}건 발송.`);
