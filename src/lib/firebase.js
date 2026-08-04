import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported as isMessagingSupported } from "firebase/messaging";

// Firebase 콘솔 > 프로젝트 설정 > 일반 > "내 앱"에서 값을 복사해
// 프로젝트 루트의 .env 파일(.env.example 참고)에 넣어주세요.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// 알림(FCM)은 지원하지 않는 브라우저(구형 iOS Safari 등)에서 즉시 예외를 던지므로
// 지원 여부를 먼저 확인한 뒤에만 초기화한다.
export async function getMessagingIfSupported() {
  if (!(await isMessagingSupported())) return null;
  return getMessaging(app);
}
