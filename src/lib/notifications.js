import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { db, getMessagingIfSupported } from "./firebase.js";

const PUSH_SCOPE = "/firebase-cloud-messaging-push-scope";

export async function enableReminderNotifications(uid) {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("이 브라우저는 알림을 지원하지 않아요.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 허용되지 않았어요.");
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    throw new Error("이 브라우저는 푸시 알림을 지원하지 않아요.");
  }

  // 메인 PWA 서비스워커(sw.js, 스코프 "/")와 겹치지 않도록 좁은 스코프로 별도 등록
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: PUSH_SCOPE,
  });

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("알림 토큰을 받아오지 못했어요.");

  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
  return token;
}

// FCM은 탭이 백그라운드/닫혀 있을 때만 서비스워커가 알아서 OS 알림을 띄워주고,
// 탭이 열려서 포커스된(포그라운드) 상태일 때는 이 핸들러가 없으면 아무것도 안 보임(조용히 씹힘).
// 그래서 앱이 켜져 있는 동안엔 여기서 직접 Notification을 띄워줌.
export async function listenForegroundMessages() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const messaging = await getMessagingIfSupported();
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    if (!title) return;
    try {
      new Notification(title, { body: body || "", icon: "/icons/icon-192.png" });
    } catch {
      // 일부 브라우저(예: 모바일 사파리)는 페이지에서 직접 Notification 생성을 막을 수 있음 — 무시
    }
  });
}
