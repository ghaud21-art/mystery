// 일회성: 전날 리마인더의 타임존 버그(오늘 저녁 일정에 "내일"로 잘못 발송) 수정을 확인하기
// 위해, 오늘 실제로 있는 해당 일정에 대해 올바른("오늘") 문구로 리마인더를 한 번 다시 보냄.
// GitHub Actions workflow_dispatch로 수동 실행 (.github/workflows/resend-today-reminder.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const TARGET_EMAIL = "ghaud21@gmail.com";
const TITLE_KEYWORD = "가면무도회";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

const userSnap = await db.collection("users").where("email", "==", TARGET_EMAIL).limit(1).get();
if (userSnap.empty) throw new Error(`유저를 못 찾음: ${TARGET_EMAIL}`);
const userDoc = userSnap.docs[0];
const uid = userDoc.id;
const tokens = userDoc.data().fcmTokens || [];
if (tokens.length === 0) throw new Error("이 유저는 FCM 토큰이 없어요(알림이 꺼져있음).");

const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

const schedSnap = await db.collection("schedules").where("datetime", ">=", `${todayKst}T00:00`).where("datetime", "<", `${todayKst}T23:59`).get();
const schedule = schedSnap.docs
  .map((d) => d.data())
  .find((s) => s.title?.includes(TITLE_KEYWORD) && s.attendees?.[uid] === "yes");

if (!schedule) throw new Error(`오늘(${todayKst}) "${TITLE_KEYWORD}" 일정을 못 찾음(참석 상태 포함).`);

await messaging.sendEachForMulticast({
  tokens,
  notification: {
    title: `오늘 "${schedule.title}" 일정이 있어요`,
    body: `${schedule.location} · 잊지 말고 참석해주세요!`,
  },
  android: { priority: "high" },
  webpush: { headers: { Urgency: "high", TTL: "86400" } },
});

console.log(`완료. "${schedule.title}" 일정 알림을 ${tokens.length}개 기기로 다시 보냈어요.`);
