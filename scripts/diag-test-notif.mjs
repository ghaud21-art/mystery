import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection("testNotifications").orderBy("requestedAt", "desc").limit(10).get();
console.log(`최근 testNotifications ${snap.size}건`);
snap.docs.forEach((d) => {
  const v = d.data();
  console.log(`- id=${d.id} status=${v.status} uid=${v.uid} error=${v.error || ""} requestedAt=${v.requestedAt?.toDate?.()} sentAt=${v.sentAt?.toDate?.()}`);
});
