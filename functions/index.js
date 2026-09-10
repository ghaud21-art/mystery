// Firebase Cloud Functions (Blaze 요금제에서만 배포 가능).
// 예전엔 GitHub Actions 크론으로 처리하던 알림 발송을, 여기로 옮겨서
// 테스트 알림은 즉시, 리마인더는 Cloud Scheduler로 더 정확한 시각에 보낸다.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// 안드로이드는 기본(보통) 우선순위 FCM 메시지를 절전 모드에서 몇 시간씩 미룰 수 있음
// (특히 TWA로 설치한 앱은 일반 브라우저 탭보다 더 엄격하게 취급됨). 알림이 늦지 않게
// 항상 높은 우선순위로 보낸다.
const URGENT_DELIVERY = {
  android: { priority: "high" },
  webpush: { headers: { Urgency: "high", TTL: "86400" } },
};

// testNotifications/{id} 문서가 생성되는 즉시(클라이언트가 "테스트 알림 보내기"를 누른 순간)
// 해당 기기 토큰으로 바로 발송. 더 이상 폴링(GitHub Actions 5분 크론)을 기다리지 않는다.
export const onTestNotificationCreated = onDocumentCreated("testNotifications/{id}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const { token } = snap.data();
  if (!token) return;

  try {
    await messaging.send({
      token,
      notification: { title: "테스트 알림", body: "이 알림이 보이면 정상적으로 설정된 거예요!" },
      ...URGENT_DELIVERY,
    });
    await snap.ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp() });
  } catch (err) {
    await snap.ref.update({ status: "failed", error: String(err.message || err), sentAt: FieldValue.serverTimestamp() });
  }
});

// 매일 00:00 UTC(=한국시간 09:00)에 실행 — "내일" 예정된 모임 일정에 참석(yes)하기로 한
// 사람들에게 FCM 푸시 알림을 보낸다. (scripts/send-reminders.mjs와 동일 로직)
export const sendDayBeforeReminders = onSchedule({ schedule: "0 0 * * *", timeZone: "UTC" }, async () => {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const tomorrowKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + 1));
  const dayAfterKst = new Date(tomorrowKst.getTime() + 24 * 60 * 60 * 1000);
  const rangeStart = new Date(tomorrowKst.getTime() - KST_OFFSET_MS).toISOString().slice(0, 16);
  const rangeEnd = new Date(dayAfterKst.getTime() - KST_OFFSET_MS).toISOString().slice(0, 16);

  const snap = await db.collection("schedules").where("datetime", ">=", rangeStart).where("datetime", "<", rangeEnd).get();
  if (snap.empty) return;

  for (const doc of snap.docs) {
    const s = doc.data();
    const attendeeIds = Object.entries(s.attendees || {}).filter(([, status]) => status === "yes").map(([uid]) => uid);
    if (attendeeIds.length === 0) continue;

    const userDocs = await Promise.all(attendeeIds.map((uid) => db.collection("users").doc(uid).get()));
    const tokens = userDocs.flatMap((d) => d.data()?.fcmTokens || []);
    if (tokens.length === 0) continue;

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `내일 "${s.title}" 일정이 있어요`,
        body: `${s.location} · 잊지 말고 참석해주세요!`,
      },
      ...URGENT_DELIVERY,
    });
  }
});

// 15분마다 실행 — 45~75분 후 시작하는 모임 일정 중 참석(yes)하기로 한 사람들에게 알림.
// (scripts/send-hour-reminders.mjs와 동일 로직) reminded1h 플래그로 중복 발송 방지.
export const sendHourBeforeReminders = onSchedule({ schedule: "every 15 minutes" }, async () => {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowKstMs = Date.now() + KST_OFFSET_MS;
  const rangeStart = new Date(nowKstMs + 45 * 60 * 1000).toISOString().slice(0, 16);
  const rangeEnd = new Date(nowKstMs + 75 * 60 * 1000).toISOString().slice(0, 16);

  const snap = await db.collection("schedules").where("datetime", ">=", rangeStart).where("datetime", "<", rangeEnd).get();
  const due = snap.docs.filter((d) => !d.data().reminded1h);
  if (due.length === 0) return;

  for (const doc of due) {
    const s = doc.data();
    const attendeeIds = Object.entries(s.attendees || {}).filter(([, status]) => status === "yes").map(([uid]) => uid);

    if (attendeeIds.length > 0) {
      const userDocs = await Promise.all(attendeeIds.map((uid) => db.collection("users").doc(uid).get()));
      const tokens = userDocs.flatMap((d) => d.data()?.fcmTokens || []);
      if (tokens.length > 0) {
        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: `1시간 뒤 "${s.title}" 일정이 있어요`,
            body: `${s.location} · 곧 시작해요!`,
          },
          ...URGENT_DELIVERY,
        });
      }
    }
    await doc.ref.update({ reminded1h: true });
  }
});

// "사건이 도착했습니다" — 별도 파일로 분리(functions/case/). 콘텐츠·정답이 Firestore 규칙에서
// 전면 차단돼 있어 여기 onCall 함수들만이 유일한 접근 경로다 (functions/case/auth.js,
// functions/case/content.js 참고).
export * from "./case/play.js";
export * from "./case/admin.js";
