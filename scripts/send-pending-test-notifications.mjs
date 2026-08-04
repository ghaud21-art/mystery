// 5분마다 GitHub Actions 크론으로 실행됨 (.github/workflows/test-notification-poller.yml).
// testNotifications 컬렉션에서 대기 중인 요청을 찾아 해당 기기로 테스트 푸시를 보낸다.
// 클라이언트는 기기 토큰을 화면에 노출하지 않고, 이 컬렉션에 요청만 남긴다.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const messaging = getMessaging();

const snap = await db.collection("testNotifications").where("status", "==", "pending").limit(20).get();
if (snap.empty) {
  console.log("대기 중인 테스트 알림 요청이 없어요.");
  process.exit(0);
}

for (const doc of snap.docs) {
  const { token } = doc.data();
  try {
    await messaging.send({
      token,
      notification: { title: "테스트 알림", body: "이 알림이 보이면 정상적으로 설정된 거예요!" },
    });
    await doc.ref.update({ status: "sent", sentAt: FieldValue.serverTimestamp() });
    console.log(`발송 완료: ${doc.id}`);
  } catch (err) {
    await doc.ref.update({ status: "failed", error: String(err.message || err), sentAt: FieldValue.serverTimestamp() });
    console.log(`발송 실패: ${doc.id} - ${err.message}`);
  }
}
