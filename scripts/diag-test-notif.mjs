import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection("testNotifications").orderBy("requestedAt", "desc").limit(8).get();
console.log(`최근 testNotifications ${snap.size}건`);
snap.docs.forEach((d) => {
  const v = d.data();
  console.log(`- id=${d.id} status=${v.status} uid=${v.uid} token=${(v.token||"").slice(0,20)}... error=${v.error || ""} requestedAt=${v.requestedAt?.toDate?.()} sentAt=${v.sentAt?.toDate?.()}`);
});

const usersSnap = await db.collection("users").get();
console.log(`\n유저별 fcmTokens 개수:`);
usersSnap.docs.forEach((d) => {
  const v = d.data();
  if ((v.fcmTokens || []).length > 0) {
    console.log(`- ${v.nickname || v.name || d.id}: ${v.fcmTokens.length}개`);
  }
});
