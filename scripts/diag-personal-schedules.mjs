import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

try {
  const snap = await db
    .collection("personalSchedules")
    .where("userId", "==", "test-uid")
    .orderBy("datetime", "asc")
    .get();
  console.log("QUERY OK, size:", snap.size);
} catch (err) {
  console.log("QUERY ERROR:", err.message);
}

const allSnap = await db.collection("personalSchedules").get();
console.log("total docs in collection:", allSnap.size);
allSnap.docs.slice(0, 5).forEach((d) => console.log(d.id, JSON.stringify(d.data())));
