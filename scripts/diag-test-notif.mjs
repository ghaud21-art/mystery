import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const messaging = getMessaging();

const snap = await db.collection("testNotifications").orderBy("requestedAt", "desc").limit(10).get();
console.log(`최근 testNotifications ${snap.size}건`);
snap.docs.forEach((d) => {
  const v = d.data();
  console.log(`- id=${d.id} status=${v.status} token=${(v.token || "").slice(0, 24)}... error=${v.error || ""} requestedAt=${v.requestedAt?.toDate?.()}`);
});

console.log("\n유저별 fcmTokens 상세:");
const usersSnap = await db.collection("users").get();
for (const d of usersSnap.docs) {
  const v = d.data();
  const tokens = v.fcmTokens || [];
  if (tokens.length === 0) continue;
  console.log(`\n${v.nickname || v.name || d.id} (${tokens.length}개):`);
  for (const t of tokens) {
    try {
      await messaging.send({ token: t, notification: { title: "silent-check" } }, true); // dryRun
      console.log(`  - ${t.slice(0, 24)}... => 유효함`);
    } catch (err) {
      console.log(`  - ${t.slice(0, 24)}... => 오류: ${err.errorInfo?.code || err.message}`);
    }
  }
}
