import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { db, getMessagingIfSupported } from "./firebase.js";

const PUSH_SCOPE = "/firebase-cloud-messaging-push-scope";

// register()는 서비스워커가 "설치 중"이기만 해도 resolve돼서, 그 직후 바로 구독을 시도하면
// (특히 모바일에서) "no active Service Worker" 오류로 실패할 수 있음. 실제로 활성화될 때까지 기다림.
function waitForActivation(registration) {
  if (registration.active) return Promise.resolve(registration);
  const worker = registration.installing || registration.waiting;
  if (!worker) return Promise.resolve(registration);
  return new Promise((resolve) => {
    worker.addEventListener("statechange", function handler() {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", handler);
        resolve(registration);
      }
    });
  });
}

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
  await waitForActivation(registration);

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

  onMessage(messaging, async (payload) => {
    const { title, body } = payload.notification || {};
    if (!title) return;
    const options = { body: body || "", icon: "/icons/icon-192.png" };

    // 모바일(Android) Chrome은 페이지 스크립트에서 직접 new Notification()을 호출하는 걸
    // 막고("Illegal constructor") 서비스워커의 showNotification()만 허용함. 그래서 그쪽을
    // 우선 시도하고, 등록된 서비스워커가 없는 경우에만 new Notification()으로 폴백.
    const registration = await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
    if (registration) {
      try {
        await registration.showNotification(title, options);
        return;
      } catch {
        // 아래 폴백으로 넘어감
      }
    }
    try {
      new Notification(title, options);
    } catch {
      // 더 이상 시도할 방법이 없음 — 무시
    }
  });
}
