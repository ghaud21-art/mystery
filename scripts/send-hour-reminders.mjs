// 15분마다 GitHub Actions 크론으로 실행됨 (.github/workflows/hour-reminders.yml).
// 1시간 이내(45~75분 후)에 시작하는 모임 일정 중 참석(yes)하기로 한 사람들에게 FCM 알림을 보낸다.
// 한 번 보낸 일정은 reminded1h:true로 표시해 다음 실행에서 중복 발송을 막는다.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const messaging = getMessaging();

// schedules.datetime은 datetime-local(로컬시각) 그대로 저장된 문자열이라, KST 기준으로 범위를 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const nowKstMs = Date.now() + KST_OFFSET_MS;
const rangeStart = new Date(nowKstMs + 45 * 60 * 1000).toISOString().slice(0, 16);
const rangeEnd = new Date(nowKstMs + 75 * 60 * 1000).toISOString().slice(0, 16);

console.log(`1시간 전 알림 대상 확인 중 (${rangeStart} ~ ${rangeEnd})`);

const snap = await db
  .collection("schedules")
  .where("datetime", ">=", rangeStart)
  .where("datetime", "<", rangeEnd)
  .get();

const due = snap.docs.filter((d) => !d.data().reminded1h);

if (due.length === 0) {
  console.log("대상 일정이 없어요.");
  process.exit(0);
}

let sent = 0;
for (const doc of due) {
  const s = doc.data();
  const attendeeIds = Object.entries(s.attendees || {})
    .filter(([, status]) => status === "yes")
    .map(([uid]) => uid);

  if (attendeeIds.length > 0) {
    const userDocs = await Promise.all(attendeeIds.map((uid) => db.collection("users").doc(uid).get()));
    const tokens = userDocs.flatMap((d) => d.data()?.fcmTokens || []);
    if (tokens.length > 0) {
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `1시간 뒤 "${s.title}" 일정이 있어요`,
          body: `${s.location} · 곧 시작해요!`,
        },
      });
      sent += res.successCount;
      console.log(`- ${s.title}: ${res.successCount}/${tokens.length}명에게 발송`);
    }
  }
  await doc.ref.update({ reminded1h: true });
}

console.log(`완료. 총 ${sent}건 발송.`);
