// 특정 기기(FCM 토큰) 하나로 테스트 푸시 알림을 한 건 보낸다.
// GitHub Actions workflow_dispatch로 토큰/제목/본문을 입력받아 실행됨 (.github/workflows/test-notification.yml).
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });

const token = process.env.TEST_TOKEN;
const title = process.env.TEST_TITLE || "테스트 알림";
const body = process.env.TEST_BODY || "머더미스터리 알림 테스트입니다!";

if (!token) {
  console.error("TEST_TOKEN이 비어있어요.");
  process.exit(1);
}

const messaging = getMessaging();
const id = await messaging.send({ token, notification: { title, body } });
console.log(`발송 완료: ${id}`);
