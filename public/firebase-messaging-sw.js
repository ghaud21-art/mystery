// 백그라운드(앱이 꺼져있거나 탭이 닫혀있을 때) 푸시 알림 수신 전용 서비스워커.
// 클래식(non-module) 스크립트라 모든 브라우저(구형 iOS Safari 포함)에서 동작함.
// PWA 캐싱용 메인 서비스워커(sw.js, 스코프 "/")와 충돌하지 않도록,
// 클라이언트에서 이 파일을 좁은 스코프("/firebase-cloud-messaging-push-scope")로 등록함.
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

// Firebase 웹 설정값은 공개돼도 안전한 값(보안은 Firestore 규칙/인증으로 처리)이라 하드코딩함.
firebase.initializeApp({
  apiKey: "AIzaSyDLhnVsGLYhgFWMKjwV9CNvZma3evb2R8o",
  authDomain: "murdermystery-cdff8.firebaseapp.com",
  projectId: "murdermystery-cdff8",
  storageBucket: "murdermystery-cdff8.firebasestorage.app",
  messagingSenderId: "282500478422",
  appId: "1:282500478422:web:9a4db0efe6c56740dca077",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "머더미스터리", {
    body: body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png",
  });
});
