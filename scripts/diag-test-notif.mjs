import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const snap = await db.collection("testNotifications").orderBy("requestedAt", "desc").limit(6).get();
console.log(`최근 testNotifications ${snap.size}건`);
snap.docs.forEach((d) => {
  const v = d.data();
  console.log(`- id=${d.id} status=${v.status} token=${(v.token || "").slice(0, 24)}... error=${v.error || ""} requestedAt=${v.requestedAt?.toDate?.()}`);
});
