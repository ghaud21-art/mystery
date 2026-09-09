import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
const rozy = usersSnap.docs.find((d) => (d.data().nickname || d.data().name || "").includes("로지"));

if (!rozy) {
  console.log("USERS:", usersSnap.docs.map((d) => d.data().nickname || d.data().name).join(", "));
  process.exit(0);
}

console.log("로지 uid:", rozy.id, "email:", rozy.data().email);

const recSnap = await db.collection("records").where("userId", "==", rozy.id).get();
const records = recSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`총 기록 ${records.length}건\n`);
records
  .sort((a, b) => (a.scenarioName || "").localeCompare(b.scenarioName || "", "ko"))
  .forEach((r) => {
    console.log(`[${r.id}] "${r.scenarioName}" | date=${r.date} | character=${r.character || ""} | rating=${r.rating} | note=${(r.note || "").slice(0, 30)}`);
  });
