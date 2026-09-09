import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeTitle } from "../src/lib/scenarioUtils.js";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersSnap = await db.collection("users").get();
const targets = usersSnap.docs.filter((d) => {
  const n = d.data().nickname || d.data().name || "";
  return n.includes("로지") || n.includes("몬가");
});
console.log(`대상 유저: ${targets.map((d) => `${d.data().nickname || d.data().name}(${d.id})`).join(", ")}`);

for (const u of targets) {
  const recSnap = await db.collection("records").where("userId", "==", u.id).get();
  const recs = recSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`\n=== ${u.data().nickname || u.data().name} (${u.id}) 기록 총 ${recs.length}건 ===`);
  const groups = {};
  recs.forEach((r) => {
    const key = normalizeTitle(r.scenarioName);
    (groups[key] ||= []).push(r);
  });
  const dupGroups = Object.entries(groups).filter(([, g]) => g.length > 1);
  console.log(`중복 제목 그룹: ${dupGroups.length}건, 관련 기록: ${dupGroups.reduce((s, [, g]) => s + g.length, 0)}건`);
  dupGroups.slice(0, 10).forEach(([title, g]) => {
    console.log(`  - "${g[0].scenarioName}" x${g.length}: ${g.map((r) => `[char="${r.character}" rating=${r.rating} note=${(r.note||"").slice(0,10)} date=${r.date} source=${r.source}]`).join(" ")}`);
  });
}
