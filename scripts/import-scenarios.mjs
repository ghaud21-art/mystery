// 관리자가 시나리오를 대량 등록할 때 쓰는 스크립트.
// GitHub Actions에서 workflow_dispatch로 수동 실행 (.github/workflows/import-scenarios.yml).
// scripts/scenario-data.json 을 읽어서 없는 것만 새로 등록한다 (제목 기준 중복 스킵).
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SCENARIOS = JSON.parse(readFileSync(new URL("./scenario-data.json", import.meta.url)));

const existingSnap = await db.collection("scenarios").where("status", "==", "approved").get();
const existingTitles = new Set(existingSnap.docs.map((d) => d.data().title?.trim().toLowerCase()));

let added = 0;
for (const s of SCENARIOS) {
  const key = s.title.trim().toLowerCase();
  if (existingTitles.has(key)) continue;
  existingTitles.add(key); // 같은 배치 안 중복도 방지
  await db.collection("scenarios").add({
    ...s,
    description: "",
    status: "approved",
    submittedBy: "admin-import",
    submittedByName: "관리자 (일괄 등록)",
  });
  added++;
}
console.log(`완료. ${added}/${SCENARIOS.length}건 신규 등록.`);
