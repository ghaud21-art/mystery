// 관리자가 시나리오를 대량 등록할 때 쓰는 스크립트.
// GitHub Actions에서 workflow_dispatch로 수동 실행 (.github/workflows/import-scenarios.yml).
// scripts/{DATA_FILE} 을 읽어서 없는 것만 새로 등록한다 (category+제목 기준 중복 스킵).
// category가 없는 기존 문서는 이 스크립트를 돌릴 때마다 "offline"으로 백필된다.
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DATA_FILE = process.env.DATA_FILE || "scenario-data.json";
const CATEGORY = process.env.CATEGORY || "offline"; // "offline" | "online"

const SCENARIOS = JSON.parse(readFileSync(new URL(`./${DATA_FILE}`, import.meta.url)));

const existingSnap = await db.collection("scenarios").where("status", "==", "approved").get();
const existingKeys = new Set();
let backfilled = 0;
const batch = db.batch();
existingSnap.docs.forEach((doc) => {
  const data = doc.data();
  const category = data.category || "offline";
  existingKeys.add(`${category}:${data.title?.trim().toLowerCase()}`);
  if (!data.category) {
    batch.update(doc.ref, { category: "offline" });
    backfilled++;
  }
});
if (backfilled > 0) {
  await batch.commit();
  console.log(`기존 시나리오 ${backfilled}건에 category="offline" 백필 완료.`);
}

let added = 0;
for (const s of SCENARIOS) {
  const key = `${CATEGORY}:${s.title.trim().toLowerCase()}`;
  if (existingKeys.has(key)) continue;
  existingKeys.add(key); // 같은 배치 안 중복도 방지
  await db.collection("scenarios").add({
    ...s,
    category: CATEGORY,
    description: "",
    status: "approved",
    submittedBy: "admin-import",
    submittedByName: "관리자 (일괄 등록)",
  });
  added++;
}
console.log(`완료. ${added}/${SCENARIOS.length}건 신규 등록 (category=${CATEGORY}).`);
