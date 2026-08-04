import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getToken } from "firebase/messaging";
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
